import { createHmac, timingSafeEqual } from "node:crypto";
import { DEFAULT_CHECKLIST } from "~/lib/constants";
import { can, type Capability } from "~/lib/permissions";
import type { SessionUser, Settings, Staff } from "~/lib/types";
import { db } from "./db.server";
import { env } from "./env.server";
import { forbidden, HttpError, unauthorized } from "./errors";
import { ConflictError, getStore } from "./store/index.server";

/**
 * Sessions are an HMAC-signed, httpOnly cookie holding only the user id and an
 * expiry. Role and active status are re-read from the database on every request,
 * so deactivating an employee takes effect immediately.
 */

const COOKIE = "crm_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const sign = (value: string) => createHmac("sha256", env.sessionSecret).update(value).digest("base64url");

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const readCookie = (request: Request, name: string) =>
  parseCookies(request.headers.get("cookie"))[name] ?? null;

export function sessionCookie(userId: string | null): string {
  const secure = env.isProd ? "; Secure" : "";
  if (!userId) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
  ).toString("base64url");
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

function readSessionUserId(request: Request): string | null {
  const raw = readCookie(request, COOKIE);
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof uid !== "string" || typeof exp !== "number" || exp * 1000 < Date.now()) return null;
    return uid;
  } catch {
    return null;
  }
}

export async function getUser(request: Request): Promise<SessionUser | null> {
  const uid = readSessionUserId(request);
  if (!uid) return null;
  const staff = await db.get<Staff>("staff", uid);
  if (!staff || !staff.isActive) return null;
  return { id: staff.id, name: staff.name, email: staff.email, role: staff.role };
}

export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getUser(request);
  if (!user) throw unauthorized();
  return user;
}

export function requireCap(user: SessionUser, capability: Capability): void {
  if (!can(user.role, capability)) throw forbidden();
}

/** Blocks cross-site form posts: state-changing requests must come from our own pages. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (request.headers.get("x-crm-request") === "1") return;
    throw new HttpError(403, "bad_origin", "Cross-site request blocked");
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (new URL(origin).host !== host) throw new HttpError(403, "bad_origin", "Cross-site request blocked");
}

// ── Login throttling (per email + IP, in memory) ────────────────────────────
const attempts = new Map<string, { count: number; resetAt: number }>();
export function throttle(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    throw new HttpError(429, "too_many_requests", "Too many attempts. Please wait a moment and try again.");
  }
}

export const clientIp = (request: Request) =>
  (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

// ── First-run bootstrap ─────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: Omit<Settings, "id" | "createdAt" | "updatedAt"> = {
  agencyName: "YourTour",
  agencyNameAr: "يور تور للسياحة والأسفار",
  licenseNumber: null,
  phone: null,
  whatsappNumber: null,
  email: null,
  address: null,
  addressAr: null,
  hours: null,
  mapsUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  crmLocale: "fr",
  soundDefault: true,
  autoAssign: "off",
  autoContacted: true,
  assignCursor: 0,
  checklistItems: DEFAULT_CHECKLIST,
};

let bootstrapped: Promise<void> | null = null;
/** Creates the singleton records and, when configured, the first administrator. */
export function ensureBootstrap(): Promise<void> {
  return (bootstrapped ??= (async () => {
    const store = getStore();
    const ignoreExisting = (error: unknown) => {
      if (!(error instanceof ConflictError)) throw error; // created by a parallel request: fine
    };
    if (!(await store.get("settings", "agency"))) {
      await store.create("settings", DEFAULT_SETTINGS, "agency").catch(ignoreExisting);
    }
    if (!(await store.get("integration", "whatsapp"))) {
      await store.create("integration", { lastWebhookOk: null, lastTestOk: null }, "whatsapp").catch(ignoreExisting);
    }
    const { email, password, name } = env.bootstrapAdmin;
    if (email && password.length >= 10 && (await store.list("staff", { limit: 1 })).length === 0) {
      try {
        await createStaffAccount({ email, password, name, role: "admin" });
        console.info(`[bootstrap] Created the first administrator account for ${email}.`);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        // The login survived (e.g. the database was recreated): attach it again with the configured password.
        const id = await store.auth.findUserIdByEmail(email);
        if (!id) throw error;
        await store.auth.setPassword(id, password);
        await store.auth.setActive(id, true);
        await db.create<Staff>("staff", { name, email, role: "admin", isActive: true, lastLoginAt: null }, { id });
        console.info(`[bootstrap] Re-attached the existing administrator login for ${email}.`);
      }
    }
  })().catch((error) => {
    bootstrapped = null;
    throw error;
  }));
}

export async function createStaffAccount(input: {
  email: string;
  password: string;
  name: string;
  role: Staff["role"];
}): Promise<Staff> {
  const email = input.email.trim().toLowerCase();
  const id = await getStore().auth.createUser(email, input.password, input.name);
  return db.create<Staff>(
    "staff",
    { name: input.name.trim(), email, role: input.role, isActive: true, lastLoginAt: null },
    { id },
  );
}

export async function getSettings(): Promise<Settings> {
  await ensureBootstrap();
  const settings = await db.get<Settings>("settings", "agency");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) } as Settings;
}
