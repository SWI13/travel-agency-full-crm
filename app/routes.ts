import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // "/" sends visitors to the default website language.
  index("routes/site/redirect.tsx"),

  // ── Server endpoints ──────────────────────────────────────────────────────
  route("api/rpc/:name", "routes/api/rpc.ts"),
  route("api/session", "routes/api/session.ts"),
  route("api/events", "routes/api/events.ts"),
  route("api/whatsapp/webhook", "routes/api/whatsapp-webhook.ts"),
  route("api/public/lead", "routes/api/public-lead.ts"),
  route("api/health", "routes/api/health.ts"),

  // ── Staff dashboard (CRM) ─────────────────────────────────────────────────
  route("admin/sign-in", "routes/crm/sign-in.tsx"),
  route("admin", "routes/crm/layout.tsx", [
    index("routes/crm/overview.tsx"),
    route("leads", "routes/crm/leads.tsx"),
    route("packages", "routes/crm/packages.tsx"),
    route("departures", "routes/crm/departures.tsx"),
    route("bookings", "routes/crm/bookings.tsx"),
    route("follow-ups", "routes/crm/follow-ups.tsx"),
    route("team", "routes/crm/team.tsx"),
    route("analytics", "routes/crm/analytics.tsx"),
    route("activity", "routes/crm/activity.tsx"),
    route("integrations", "routes/crm/integrations.tsx"),
    route("settings", "routes/crm/settings.tsx"),
    route("*", "routes/crm/not-found.tsx"),
  ]),

  // ── Public website (/ar, /fr, /en) ────────────────────────────────────────
  route(":lang", "routes/site/layout.tsx", [
    index("routes/site/home.tsx"),
    route("packages", "routes/site/packages.tsx"),
    route("packages/:slug", "routes/site/package-detail.tsx"),
    route("about", "routes/site/about.tsx"),
    route("contact", "routes/site/contact.tsx"),
    route("privacy", "routes/site/privacy.tsx"),
    route("thank-you", "routes/site/thank-you.tsx"),
    route("*", "routes/site/not-found.tsx"),
  ]),
] satisfies RouteConfig;
