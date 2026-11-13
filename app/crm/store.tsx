import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { useI18n } from "~/i18n";
import { leadName } from "~/lib/format";
import type { Capability } from "~/lib/permissions";
import type { Departure, Lead, Message, Package, Staff } from "~/lib/types";
import type { Snapshot } from "~/server/rpc/index.server";
import { useToast } from "~/ui/feedback";
import { api, errorMessage } from "./api";
import { playChime, unlockSound } from "./sound";

type ListKey = "staff" | "leads" | "packages" | "departures" | "bookings" | "pilgrims" | "followups" | "activity";
const LIST_KEYS: ListKey[] = ["staff", "leads", "packages", "departures", "bookings", "pilgrims", "followups", "activity"];

interface ChangeEvent {
  collection: string;
  op: "upsert" | "delete";
  doc: { id: string } & Record<string, unknown>;
  notify?: "new_lead" | "new_message";
}

export interface Notice {
  id: string;
  kind: "new_lead" | "new_message";
  leadId: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
}

interface CrmContext {
  data: Snapshot;
  connection: "live" | "offline";
  can: (capability: Capability) => boolean;
  staffById: Map<string, Staff>;
  packageById: Map<string, Package>;
  departureById: Map<string, Departure>;
  leadById: Map<string, Lead>;
  /** Applies a record returned by the server straight away (the live feed confirms it later). */
  apply: (collection: ListKey | "settings", doc: { id: string }) => void;
  drop: (collection: ListKey, id: string) => void;
  /** Runs a server procedure and shows a toast if it fails. Returns undefined on failure. */
  run: <T>(name: string, input?: unknown, successMessage?: string) => Promise<T | undefined>;
  reload: () => Promise<void>;
  notices: Notice[];
  markNoticesRead: () => void;
  highlighted: Set<string>;
  sound: boolean;
  setSound: (on: boolean) => void;
  onMessage: (listener: (message: Message, op: "upsert" | "delete") => void) => () => void;
  openLead: (id: string) => void;
}

const Context = createContext<CrmContext | null>(null);
const SOUND_KEY = "crm_sound";

export function useCrm(): CrmContext {
  const value = useContext(Context);
  if (!value) throw new Error("useCrm must be used inside CrmProvider");
  return value;
}

function upsert<T extends { id: string }>(list: T[], doc: T, prepend = false): T[] {
  const index = list.findIndex((item) => item.id === doc.id);
  if (index === -1) return prepend ? [doc, ...list] : [...list, doc];
  const next = list.slice();
  next[index] = doc;
  return next;
}

export function CrmProvider({ initial, children }: { initial: Snapshot; children: ReactNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Snapshot>(initial);
  const [connection, setConnection] = useState<"live" | "offline">("offline");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [sound, setSoundState] = useState<boolean>(initial.settings.soundDefault);
  const messageListeners = useRef(new Set<(message: Message, op: "upsert" | "delete") => void>());
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SOUND_KEY);
      if (stored !== null) setSoundState(stored === "1");
    } catch {
      /* storage unavailable */
    }
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
    if (on) playChime();
  }, []);

  const apply = useCallback<CrmContext["apply"]>((collection, doc) => {
    setData((current) => {
      if (collection === "settings") return { ...current, settings: doc as unknown as Snapshot["settings"] };
      const list = current[collection] as Array<{ id: string }>;
      return { ...current, [collection]: upsert(list, doc, collection === "activity") };
    });
  }, []);

  const drop = useCallback<CrmContext["drop"]>((collection, id) => {
    setData((current) => ({
      ...current,
      [collection]: (current[collection] as Array<{ id: string }>).filter((item) => item.id !== id),
    }));
  }, []);

  const reload = useCallback(async () => {
    setData(await api<Snapshot>("snapshot"));
  }, []);

  const openLead = useCallback(
    (id: string) => {
      const here = new URL(window.location.href);
      here.searchParams.set("lead", id);
      navigate(`${here.pathname}${here.search}`, { preventScrollReset: true });
    },
    [navigate],
  );

  const handleNotify = useCallback(
    (kind: "new_lead" | "new_message", lead: Lead) => {
      const name = leadName(lead);
      const fromForm = lead.source === "website_form" && kind === "new_lead";
      const title = kind === "new_lead" ? t(fromForm ? "crm.notify.newLeadForm" : "crm.notify.newLead") : t("crm.notify.newMessage");
      const body = `${name}${lead.lastMessageText ? ` — ${lead.lastMessageText}` : ""}`;
      setNotices((list) => [
        { id: `${lead.id}:${lead.updatedAt}`, kind, leadId: lead.id, title, body, at: new Date().toISOString(), read: false },
        ...list.slice(0, 49),
      ]);
      setHighlighted((set) => new Set(set).add(lead.id));
      setTimeout(() => {
        setHighlighted((set) => {
          const next = new Set(set);
          next.delete(lead.id);
          return next;
        });
      }, 12_000);
      if (soundRef.current) playChime();
      toast.info(title, body, { label: t("crm.notify.open"), onClick: () => openLead(lead.id) });
    },
    [t, toast, openLead],
  );

  // ── Live feed ───────────────────────────────────────────────────────────
  useEffect(() => {
    let source: EventSource | null = null;
    let closed = false;
    let everConnected = false;
    let fallback: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      source = new EventSource("/api/events");
      source.addEventListener("ready", () => {
        setConnection("live");
        // After a reconnect, catch up on anything missed while offline.
        if (everConnected) void reload().catch(() => {});
        everConnected = true;
      });
      source.onmessage = (event) => {
        let change: ChangeEvent;
        try {
          change = JSON.parse(event.data);
        } catch {
          return;
        }
        if (change.collection === "seats") {
          setData((current) => ({
            ...current,
            seatsTaken: { ...current.seatsTaken, [change.doc.id]: Number(change.doc.taken) },
          }));
        } else if (change.collection === "messages") {
          for (const listener of messageListeners.current) listener(change.doc as unknown as Message, change.op);
        } else if (change.collection === "settings") {
          apply("settings", change.doc);
        } else if (LIST_KEYS.includes(change.collection as ListKey)) {
          if (change.op === "delete") drop(change.collection as ListKey, change.doc.id);
          else apply(change.collection as ListKey, change.doc);
        }
        if (change.notify && change.op === "upsert") handleNotify(change.notify, change.doc as unknown as Lead);
      };
      source.onerror = () => setConnection("offline"); // EventSource retries by itself
    };
    connect();

    // Safety net when the stream cannot be established (strict proxies, serverless hosts).
    fallback = setInterval(() => {
      if (!closed && source?.readyState !== EventSource.OPEN && document.visibilityState === "visible") {
        void reload().catch(() => {});
      }
    }, 20_000);

    return () => {
      closed = true;
      source?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [apply, drop, handleNotify, reload]);

  // Unread conversations in the browser tab title.
  const unread = useMemo(() => data.leads.filter((l) => l.unreadCount > 0).length, [data.leads]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }, [unread]);

  const run = useCallback<CrmContext["run"]>(
    async (name, input, successMessage) => {
      try {
        const result = await api(name, input);
        if (successMessage) toast.success(successMessage);
        return result as never;
      } catch (error) {
        toast.error(errorMessage(t, error));
        return undefined;
      }
    },
    [t, toast],
  );

  const value = useMemo<CrmContext>(() => {
    const capabilities = new Set<string>(data.capabilities);
    return {
      data,
      connection,
      can: (capability) => capabilities.has(capability),
      staffById: new Map(data.staff.map((s) => [s.id, s])),
      packageById: new Map(data.packages.map((p) => [p.id, p])),
      departureById: new Map(data.departures.map((d) => [d.id, d])),
      leadById: new Map(data.leads.map((l) => [l.id, l])),
      apply,
      drop,
      run,
      reload,
      notices,
      markNoticesRead: () => setNotices((list) => list.map((n) => ({ ...n, read: true }))),
      highlighted,
      sound,
      setSound,
      onMessage: (listener) => {
        messageListeners.current.add(listener);
        return () => messageListeners.current.delete(listener);
      },
      openLead,
    };
  }, [data, connection, apply, drop, run, reload, notices, highlighted, sound, setSound, openLead]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
