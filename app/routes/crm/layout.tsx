import { useEffect, useState } from "react";
import { Outlet, redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/layout";
import { LeadDrawer } from "~/crm/lead-drawer";
import { DemoBanner, Sidebar, Topbar } from "~/crm/shell";
import { CrmProvider } from "~/crm/store";
import { currentRevision, liveMode } from "~/server/events.server";
import { snapshot } from "~/server/rpc/index.server";
import { ensureBootstrap, getUser } from "~/server/session.server";
import { FeedbackProvider } from "~/ui/feedback";

/** Every dashboard page is protected on the server: no session, no data, no HTML. */
export async function loader({ request }: Route.LoaderArgs) {
  await ensureBootstrap();
  const user = await getUser(request);
  if (!user) throw redirect("/admin/sign-in");
  // Read the revision first: anything written while the snapshot loads is replayed afterwards.
  const rev = await currentRevision();
  return { snapshot: await snapshot(user), live: { mode: liveMode(), rev } };
}

// Data stays current through the live feed, so navigation never refetches the snapshot.
export const shouldRevalidate = () => false;

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.snapshot.settings.agencyName ?? "CRM"} — CRM` }, { name: "robots", content: "noindex, nofollow" }];
}

const COLLAPSE_KEY = "crm_sidebar_collapsed";

export default function CrmLayout({ loaderData }: Route.ComponentProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const leadId = params.get("lead");

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !value;
    });
  };
  const closeLead = () => {
    const next = new URLSearchParams(params);
    next.delete("lead");
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="theme-crm min-h-dvh flex">
      <FeedbackProvider>
        <CrmProvider initial={loaderData.snapshot} live={loaderData.live}>
          <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
          <div className="flex-1 min-w-0 flex flex-col">
            <Topbar onMenu={() => setMobileOpen(true)} />
            <DemoBanner />
            <main className="flex-1 min-w-0">
              <Outlet />
            </main>
          </div>
          <LeadDrawer leadId={leadId} onClose={closeLead} />
        </CrmProvider>
      </FeedbackProvider>
    </div>
  );
}
