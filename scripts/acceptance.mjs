#!/usr/bin/env node
/**
 * End-to-end acceptance tests.
 *
 * Starts an isolated copy of the app (temporary datastore, throw-away secrets,
 * its own port), then drives it over HTTP exactly like Meta, the website and the
 * dashboard do. Nothing touches your real data or your .env file.
 *
 *   npm run test:acceptance        (local demo datastore)
 *   npm run test:appwrite          (same checks against YOUR Appwrite project)
 *
 * The Appwrite run reads APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY
 * from .env, works in a separate throw-away database and deletes it (and the test
 * users) afterwards. Your real database is never touched.
 */
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.ACCEPTANCE_PORT ?? 5199);
const BASE = `http://localhost:${PORT}`;
const dataDir = mkdtempSync(path.join(tmpdir(), "crm-acceptance-"));
const secret = (bytes = 18) => randomBytes(bytes).toString("base64url");

// ── Optional: run against a real Appwrite project ───────────────────────────
const USE_APPWRITE = process.argv.includes("--appwrite");
let appwriteEnv = { APPWRITE_ENDPOINT: "", APPWRITE_PROJECT_ID: "", APPWRITE_API_KEY: "", APPWRITE_DATABASE_ID: "" };
if (USE_APPWRITE) {
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile?.(path.join(root, ".env"));
  const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env;
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    console.error("Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY in .env first.");
    process.exit(1);
  }
  appwriteEnv = {
    APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID,
    APPWRITE_API_KEY,
    APPWRITE_DATABASE_ID: `crm_selftest_${randomBytes(4).toString("hex")}`,
  };
  console.log(`Running against Appwrite at ${APPWRITE_ENDPOINT} — temporary database "${appwriteEnv.APPWRITE_DATABASE_ID}"`);
}

/** Removes what an Appwrite run created: the temporary database and the test logins. */
async function cleanupAppwrite({ dropDatabase }) {
  const { Client, Query, TablesDB, Users } = await import("node-appwrite");
  const client = new Client().setEndpoint(appwriteEnv.APPWRITE_ENDPOINT).setProject(appwriteEnv.APPWRITE_PROJECT_ID).setKey(appwriteEnv.APPWRITE_API_KEY);
  const users = new Users(client);
  const found = await users.list({ queries: [Query.limit(100)], search: "acceptance.test" }).catch(() => ({ users: [] }));
  for (const user of found.users) {
    if (user.email?.endsWith("@acceptance.test")) await users.delete({ userId: user.$id }).catch(() => {});
  }
  if (dropDatabase) await new TablesDB(client).delete({ databaseId: appwriteEnv.APPWRITE_DATABASE_ID }).catch(() => {});
}
if (USE_APPWRITE) await cleanupAppwrite({ dropDatabase: false }); // leftovers of an interrupted run

const cfg = {
  adminEmail: "admin@acceptance.test",
  adminPassword: secret(),
  managerPassword: secret(),
  agentPassword: secret(),
  verifyToken: secret(),
  appSecret: secret(24),
  phoneNumberId: "TEST_PNID_1",
};

const server = spawn(process.execPath, [path.join(root, "node_modules/@react-router/dev/bin.js"), "dev", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    ADMIN_EMAIL: cfg.adminEmail,
    ADMIN_PASSWORD: cfg.adminPassword,
    ADMIN_NAME: "Acceptance Admin",
    WHATSAPP_VERIFY_TOKEN: cfg.verifyToken,
    WHATSAPP_APP_SECRET: cfg.appSecret,
    WHATSAPP_PHONE_NUMBER_ID: cfg.phoneNumberId,
    WHATSAPP_ACCESS_TOKEN: "",
    WHATSAPP_BUSINESS_ACCOUNT_ID: "",
    ...appwriteEnv,
    DEMO_TOOLS: "true",
    SESSION_SECRET: secret(40),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"}  ${name}${!ok && detail ? `\n        ${String(detail).slice(0, 400)}` : ""}`);
}
const section = (title) => console.log(`\n${title}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  // With Appwrite the first health call also creates the tables, which can take a few minutes.
  for (let i = 0; i < (USE_APPWRITE ? 600 : 90); i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`Server did not start:\n${serverLog.slice(-1500)}`);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function login(email, password) {
  const res = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return { status: res.status, cookie, body: await res.json().catch(() => null) };
}
async function rpc(cookie, name, input = {}, headers = {}) {
  const res = await fetch(`${BASE}/api/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok && body?.ok, data: body?.data, code: body?.code };
}
const snapshot = async (cookie) => (await rpc(cookie, "snapshot")).data;

let counter = 0;
const wamid = () => `wamid.ACCEPT${Date.now()}${++counter}`;
const sign = (raw) => `sha256=${createHmac("sha256", cfg.appSecret).update(raw).digest("hex")}`;

function inbound({ from, name, text, id = wamid(), referral, userId, username, pnid = cfg.phoneNumberId }) {
  const contact = {};
  if (name || username) contact.profile = { ...(name ? { name } : {}), ...(username ? { username } : {}) };
  if (from) contact.wa_id = from;
  if (userId) contact.user_id = userId;
  const message = { id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } };
  if (from) message.from = from;
  if (userId) message.from_user_id = userId;
  if (referral) message.referral = referral;
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "213770000000", phone_number_id: pnid }, contacts: [contact], messages: [message] } }] }],
  };
}
const echo = (to, text) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "smb_message_echoes", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "213770000000", phone_number_id: cfg.phoneNumberId }, message_echoes: [{ from: "213770000000", to, id: wamid(), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }],
});
async function webhook(payload, { signature, raw } = {}) {
  const body = raw ?? JSON.stringify(payload);
  const res = await fetch(`${BASE}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signature === null ? {} : { "X-Hub-Signature-256": signature ?? sign(body) }) },
    body,
  });
  return { status: res.status, text: await res.text() };
}
const leadByPhone = (snap, phone) => snap.leads.find((l) => l.phone === phone);

/** Opens the live feed and collects events until closed. */
function openStream(cookie) {
  const controller = new AbortController();
  const events = [];
  const ready = (async () => {
    const res = await fetch(`${BASE}/api/events`, { headers: { Cookie: cookie }, signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let index;
          while ((index = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const data = chunk.split("\n").find((line) => line.startsWith("data: "));
            if (data && data.length > 8) events.push(JSON.parse(data.slice(6)));
          }
        }
      } catch {
        /* aborted */
      }
    })();
    return res.status;
  })();
  const waitFor = async (predicate, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = events.find(predicate);
      if (found) return { event: found, ms: Date.now() - start };
      await sleep(40);
    }
    return null;
  };
  return { ready, events, waitFor, close: () => controller.abort() };
}

// ── Tests ───────────────────────────────────────────────────────────────────
async function run() {
  await waitForServer();

  section("1 · Authentication");
  const bad = await login(cfg.adminEmail, "wrong-password-123");
  check("Wrong password is refused", bad.status === 401);
  const admin = await login(cfg.adminEmail, cfg.adminPassword);
  check("Admin can log in", admin.status === 200 && admin.body.data.user.role === "admin", JSON.stringify(admin.body));
  const noSession = await fetch(`${BASE}/admin`, { redirect: "manual" });
  check("Dashboard redirects visitors without a session to sign-in", noSession.status === 302 && (noSession.headers.get("location") ?? "").includes("/admin/sign-in"));
  check("API refuses calls without a session", (await rpc(null, "snapshot")).status === 401);
  check("API refuses cross-site requests", (await rpc(admin.cookie, "snapshot", {}, { Origin: "https://evil.example" })).status === 403);
  const forged = await rpc("crm_session=eyJ1aWQiOiJ4IiwiZXhwIjo5OTk5OTk5OTk5fQ.forged", "snapshot");
  check("Forged session cookie is rejected", forged.status === 401);

  section("2 · Team management");
  const manager = await rpc(admin.cookie, "team.create", { name: "Meriem Manager", email: "manager@acceptance.test", password: cfg.managerPassword, role: "manager" });
  const agent = await rpc(admin.cookie, "team.create", { name: "Anis Agent", email: "agent@acceptance.test", password: cfg.agentPassword, role: "agent" });
  const agent2 = await rpc(admin.cookie, "team.create", { name: "Bilal Agent", email: "agent2@acceptance.test", password: cfg.agentPassword, role: "agent" });
  check("Admin can create employees with roles", manager.ok && agent.ok && agent2.ok, JSON.stringify([manager.code, agent.code]));
  check("Duplicate employee email is refused", (await rpc(admin.cookie, "team.create", { name: "Dup", email: "agent@acceptance.test", password: cfg.agentPassword, role: "agent" })).code === "email_taken");
  check("Weak passwords are refused", (await rpc(admin.cookie, "team.create", { name: "Weak", email: "weak@acceptance.test", password: "short", role: "agent" })).status === 400);
  const mgr = await login("manager@acceptance.test", cfg.managerPassword);
  let agt = await login("agent@acceptance.test", cfg.agentPassword);
  check("New employees can log in", mgr.status === 200 && agt.status === 200);
  await rpc(admin.cookie, "team.update", { id: agent2.data.id, isActive: false });
  check("Deactivated employee cannot log in", (await login("agent2@acceptance.test", cfg.agentPassword)).status === 401);
  check("Admin cannot remove their own admin access", (await rpc(admin.cookie, "team.update", { id: admin.body.data.user.id, role: "agent" })).status === 409);

  section("3–9 · WhatsApp webhook → lead");
  const verifyOk = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(cfg.verifyToken)}&hub.challenge=1158201444`);
  check("Verification handshake echoes hub.challenge", verifyOk.status === 200 && (await verifyOk.text()) === "1158201444");
  const verifyBad = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`);
  check("Verification with a wrong token is refused", verifyBad.status === 403);

  const p1 = inbound({ from: "213661000001", name: "Karim Test", text: "السلام عليكم، أريد معلومات عن العمرة" });
  check("Webhook with an invalid signature is rejected (401)", (await webhook(p1, { signature: "sha256=" + "0".repeat(64) })).status === 401);
  check("Webhook without a signature is rejected (401)", (await webhook(p1, { signature: null })).status === 401);
  check("Rejected webhooks create nothing", !leadByPhone(await snapshot(admin.cookie), "+213661000001"));

  const first = await webhook(p1);
  let snap = await snapshot(admin.cookie);
  let lead = leadByPhone(snap, "+213661000001");
  check("A new WhatsApp message creates a lead automatically", first.status === 200 && !!lead, first.text);
  check("Lead shows the WhatsApp contact name and phone", lead?.waName === "Karim Test" && lead?.phone === "+213661000001");
  check("New lead starts as NEW, unread, not marked demo", lead?.stage === "new" && lead?.unreadCount === 1 && lead?.isDemo === false);
  check("Service is detected from the customer's words", lead?.serviceType === "umrah");
  check("Missing referral is handled: source is organic, no ad data invented", lead?.source === "organic" && lead?.adId === null && lead?.adTitle === null);
  let messages = (await rpc(admin.cookie, "messages.list", { leadId: lead.id })).data;
  check("Message appears in the conversation timeline", messages.length === 1 && messages[0].body.includes("العمرة") && messages[0].direction === "inbound");

  // Employee edits must survive later webhooks.
  await rpc(admin.cookie, "leads.update", { id: lead.id, patch: { displayName: "M. Karim (VIP)", serviceType: "hajj", notes: "Note interne" } });
  await webhook(inbound({ from: "213661000001", name: "Karim Renamed", text: "Encore une question" }));
  snap = await snapshot(admin.cookie);
  const again = leadByPhone(snap, "+213661000001");
  check("A repeated message updates the existing lead (no second lead)", snap.leads.filter((l) => l.phone === "+213661000001").length === 1 && again.unreadCount === 2 && again.lastMessageText === "Encore une question");
  check("Webhook does not overwrite what the employee typed", again.displayName === "M. Karim (VIP)" && again.serviceType === "hajj" && again.notes === "Note interne");

  const dup = inbound({ from: "213661000001", name: "Karim Test", text: "Message unique" });
  await webhook(dup);
  const dupAgain = await webhook(dup);
  const sameIdNewEnvelope = await webhook(inbound({ from: "213661000001", name: "Karim Test", text: "Message unique", id: dup.entry[0].changes[0].value.messages[0].id }));
  messages = (await rpc(admin.cookie, "messages.list", { leadId: lead.id })).data;
  snap = await snapshot(admin.cookie);
  check("Duplicate webhook delivery is acknowledged but stores nothing twice", dupAgain.status === 200 && sameIdNewEnvelope.status === 200 && messages.filter((m) => m.body === "Message unique").length === 1 && messages.length === 3);
  check("Duplicate delivery does not inflate the unread counter", leadByPhone(snap, "+213661000001").unreadCount === 3);

  await webhook(
    inbound({
      from: "213661000002",
      name: "Amina Ad",
      text: "Bonjour, prix Omra ?",
      referral: { source_url: "https://fb.me/abc", source_id: "120211111", source_type: "ad", headline: "Omra Ramadan 2027", body: "Départ Alger", media_type: "image", ctwa_clid: "CLID-ACCEPT" },
    }),
  );
  await webhook(inbound({ from: "213661000003", name: "Insta Ad", text: "Salam", referral: { source_url: "https://www.instagram.com/p/xyz/", source_id: "120222222", source_type: "ad", headline: "عمرة شعبان" } }));
  snap = await snapshot(admin.cookie);
  const adLead = leadByPhone(snap, "+213661000002");
  check("Referral information is saved (Facebook ad, ad ID, headline, click ID)", adLead?.source === "facebook_ad" && adLead.adId === "120211111" && adLead.adTitle === "Omra Ramadan 2027" && adLead.ctwaClid === "CLID-ACCEPT");
  check("Instagram ads are identified from the referral URL", leadByPhone(snap, "+213661000003")?.source === "instagram_ad");

  await webhook(inbound({ from: "213661000004", text: "Sans nom de profil" }));
  snap = await snapshot(admin.cookie);
  check("Missing WhatsApp profile name is handled", leadByPhone(snap, "+213661000004")?.waName === null);

  const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => webhook(inbound({ from: `21366100010${i}`, name: `Burst ${i}`, text: "Salam" }))));
  snap = await snapshot(admin.cookie);
  check("Several customers arriving at the same time each get one lead", burst.every((r) => r.status === 200) && snap.leads.filter((l) => l.phone?.startsWith("+21366100010")).length === 5);

  await Promise.all([webhook(inbound({ from: "213661000200", name: "Race", text: "un" })), webhook(inbound({ from: "213661000200", name: "Race", text: "deux" })), webhook(inbound({ from: "213661000200", name: "Race", text: "trois" }))]);
  snap = await snapshot(admin.cookie);
  const raceLeads = snap.leads.filter((l) => l.phone === "+213661000200");
  const raceMessages = raceLeads[0] ? (await rpc(admin.cookie, "messages.list", { leadId: raceLeads[0].id })).data : [];
  check("Simultaneous first messages from one sender create a single lead", raceLeads.length === 1 && raceMessages.length === 3 && raceLeads[0].unreadCount === 3, `${raceLeads.length} leads, ${raceMessages.length} messages, unread ${raceLeads[0]?.unreadCount}`);

  await webhook(echo("213661000001", "Bonjour, voici nos tarifs."));
  snap = await snapshot(admin.cookie);
  const afterEcho = leadByPhone(snap, "+213661000001");
  messages = (await rpc(admin.cookie, "messages.list", { leadId: lead.id })).data;
  check("Replies sent from the WhatsApp Business app are synchronised as outgoing messages", messages.at(-1).direction === "outbound" && afterEcho.unreadCount === 0 && afterEcho.stage === "contacted" && !!afterEcho.firstResponseAt);

  await webhook(inbound({ userId: "DZ.99887766554433221100", username: "pilgrim.dz", name: "Sans Numero", text: "Salam" }));
  snap = await snapshot(admin.cookie);
  check("Customers identified only by a WhatsApp user ID (no phone) still become leads", snap.leads.some((l) => l.waUserId === "DZ.99887766554433221100" && l.phone === null && l.waUsername === "pilgrim.dz"));

  const before = snap.leads.length;
  const other = await webhook(inbound({ from: "213661000300", name: "Other number", text: "x", pnid: "SOMEONE_ELSES_NUMBER" }));
  snap = await snapshot(admin.cookie);
  check("Events for a different WhatsApp number are ignored", other.status === 200 && snap.leads.length === before);
  check("Malformed JSON is refused without crashing (400)", (await webhook(null, { raw: "{not json" })).status === 400);
  const demoEvent = await webhook(inbound({ from: "213555000999", name: "Demo Via HTTP", text: "demo", pnid: "DEMO" }));
  snap = await snapshot(admin.cookie);
  check("Simulated events are flagged as demo, never mixed with real leads", demoEvent.status === 200 && leadByPhone(snap, "+213555000999")?.isDemo === true);

  section("10 · Realtime");
  const adminStream = openStream(admin.cookie);
  const agentStream = openStream(agt.cookie);
  check("Live feed opens for signed-in users", (await adminStream.ready) === 200 && (await agentStream.ready) === 200);
  check("Live feed is closed to visitors", (await fetch(`${BASE}/api/events`)).status === 401);
  await sleep(300);
  await webhook(inbound({ from: "213661000400", name: "Realtime Lead", text: "Salam, je veux réserver" }));
  const pushed = await adminStream.waitFor((e) => e.collection === "leads" && e.doc.phone === "+213661000400" && e.notify === "new_lead");
  check("A new lead is pushed to open dashboards with a notification flag", !!pushed, "no event within 5 s");
  if (pushed) console.log(`        delivered in ${pushed.ms} ms`);
  check("Messages are pushed too", !!(await adminStream.waitFor((e) => e.collection === "messages" && e.doc.body === "Salam, je veux réserver", 2000)));
  await sleep(300);
  check("An agent does NOT receive leads that are not assigned to them", !agentStream.events.some((e) => e.collection === "leads" && e.doc.phone === "+213661000400"));

  section("11 · Assigning and updating leads");
  snap = await snapshot(admin.cookie);
  const target = leadByPhone(snap, "+213661000400");
  const assigned = await rpc(mgr.cookie, "leads.update", { id: target.id, patch: { assignedTo: agent.data.id, priority: "high" } });
  check("Manager can assign a lead to an agent", assigned.ok && assigned.data.assignedTo === agent.data.id);
  check("The assigned agent receives the lead live", !!(await agentStream.waitFor((e) => e.collection === "leads" && e.op === "upsert" && e.doc.id === target.id, 3000)));
  let agentSnap = await snapshot(agt.cookie);
  check("Agent sees only the leads assigned to them", agentSnap.leads.length === 1 && agentSnap.leads[0].id === target.id, `${agentSnap.leads.length} leads visible`);
  const agentEdit = await rpc(agt.cookie, "leads.update", { id: target.id, patch: { stage: "qualified", adults: 2, children: 1, budgetDzd: 600000, departureCity: "Alger", notes: "Rappeler le soir", tags: ["famille"] } });
  check("Agent can update their lead (stage, travellers, budget, notes, tags)", agentEdit.ok && agentEdit.data.stage === "qualified" && agentEdit.data.budgetDzd === 600000 && agentEdit.data.tags[0] === "famille");
  check("Agent cannot reassign leads", (await rpc(agt.cookie, "leads.update", { id: target.id, patch: { assignedTo: null } })).status === 403);
  check("Agent cannot open or edit someone else's lead", (await rpc(agt.cookie, "leads.update", { id: lead.id, patch: { notes: "x" } })).status === 403 && (await rpc(agt.cookie, "messages.list", { leadId: lead.id })).status === 403);
  check("Marking a lead Lost requires a reason", (await rpc(agt.cookie, "leads.update", { id: target.id, patch: { stage: "lost" } })).status === 400);
  check("Invalid values are rejected by server-side validation", (await rpc(agt.cookie, "leads.update", { id: target.id, patch: { stage: "not-a-stage" } })).status === 400 && (await rpc(agt.cookie, "leads.update", { id: target.id, patch: { adults: -3 } })).status === 400);
  const manual = await rpc(agt.cookie, "leads.create", { phone: "0550 12 34 56", name: "Walk-in Client", serviceType: "umrah" });
  check("Agent can add a walk-in lead, which is assigned to them", manual.ok && manual.data.phone === "+213550123456" && manual.data.assignedTo === agent.data.id && manual.data.source === "manual");
  check("Adding an existing phone number is refused instead of duplicating", (await rpc(agt.cookie, "leads.create", { phone: "+213550123456" })).code === "lead_exists");

  section("12 · Follow-ups");
  const due = new Date(Date.now() + 86_400_000).toISOString();
  const followUp = await rpc(agt.cookie, "followups.create", { leadId: target.id, dueAt: due, reason: "call_back", notes: "Rappeler pour le devis" });
  agentSnap = await snapshot(agt.cookie);
  check("Agent can schedule a follow-up; the lead shows its next follow-up date", followUp.ok && agentSnap.leads.find((l) => l.id === target.id).nextFollowUpAt === due);
  const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
  check("Follow-up can be rescheduled", (await rpc(agt.cookie, "followups.update", { id: followUp.data.id, dueAt: later })).data?.dueAt === later);
  const done = await rpc(agt.cookie, "followups.update", { id: followUp.data.id, done: true });
  agentSnap = await snapshot(agt.cookie);
  check("Follow-up can be completed, clearing the lead's next follow-up", done.data?.status === "done" && agentSnap.leads.find((l) => l.id === target.id).nextFollowUpAt === null);
  check("Agent cannot schedule follow-ups on other people's leads", (await rpc(agt.cookie, "followups.create", { leadId: lead.id, dueAt: due, reason: "other" })).status === 403);

  section("13 · Packages and departures");
  const pkgInput = { name: "Omra Test 12 jours", nameAr: "عمرة تجريبية", category: "umrah", description: "Forfait de test", descriptionAr: null, durationDays: 12, departureCity: "Alger", flightInfo: null, makkahHotel: "Hôtel test", madinahHotel: null, hotelCategory: "4★", transport: null, roomOptions: ["double", "triple"], priceDzd: 250000, defaultCapacity: 4, status: "active", coverImage: null };
  check("Agent cannot create packages", (await rpc(agt.cookie, "packages.save", pkgInput)).status === 403);
  const pkg = await rpc(mgr.cookie, "packages.save", { ...pkgInput, firstDeparture: { departDate: "2027-03-10", returnDate: "2027-03-22" } });
  check("Manager can create a package (reference code generated)", pkg.ok && /^OMR-\d+$/.test(pkg.data.refCode) && pkg.data.slug === "omra-test-12-jours", JSON.stringify(pkg.code));
  snap = await snapshot(mgr.cookie);
  const dep1 = snap.departures.find((d) => d.packageId === pkg.data.id);
  check("First departure is created with the package", !!dep1 && dep1.capacity === 4);
  const dep2 = await rpc(mgr.cookie, "departures.save", { packageId: pkg.data.id, groupName: "Groupe avril", departDate: "2027-04-15", returnDate: "2027-04-27", departureCity: null, capacity: 30, priceDzd: 265000, status: "open", flightInfo: null, notes: null });
  check("A package can have several departures", dep2.ok);
  check("Return date before departure date is refused", (await rpc(mgr.cookie, "departures.save", { packageId: pkg.data.id, groupName: null, departDate: "2027-05-10", returnDate: "2027-05-01", departureCity: null, capacity: 10, priceDzd: null, status: "open", flightInfo: null, notes: null })).status === 400);
  const edited = await rpc(mgr.cookie, "packages.save", { ...pkgInput, id: pkg.data.id, priceDzd: 255000 });
  check("Manager can update a package", edited.data?.priceDzd === 255000 && edited.data.refCode === pkg.data.refCode);
  const sitePackages = await (await fetch(`${BASE}/fr/packages`)).text();
  check("Active package is published on the public website", sitePackages.includes("Omra Test 12 jours"));
  await webhook(inbound({ from: "213661000500", name: "Site Visitor", text: `[${pkg.data.refCode}] السلام عليكم، أريد معلومات عن هذا العرض` }));
  snap = await snapshot(admin.cookie);
  const refLead = leadByPhone(snap, "+213661000500");
  check("A website WhatsApp message is linked to its package by reference code", refLead?.packageId === pkg.data.id && refLead.source === "website_whatsapp" && refLead.refCode === pkg.data.refCode);

  const chosen = await rpc(mgr.cookie, "leads.update", { id: lead.id, patch: { packageId: pkg.data.id } });
  check("A preferred package can be selected on a lead", chosen.data?.packageId === pkg.data.id);

  section("14–15 · Bookings and payments");
  const tooEarly = await rpc(agt.cookie, "bookings.create", { leadId: target.id, departureId: dep1.id, travelers: 3, totalDzd: 765000, paidDzd: 200000, bookingDate: "2026-11-13" });
  check("A lead that is not Confirmed cannot be converted", tooEarly.code === "lead_not_confirmed");
  await rpc(agt.cookie, "leads.update", { id: target.id, patch: { stage: "confirmed" } });
  const booking = await rpc(agt.cookie, "bookings.create", { leadId: target.id, departureId: dep1.id, travelers: 3, totalDzd: 765000, paidDzd: 200000, bookingDate: "2026-11-13" });
  check("A confirmed lead can become a booking", booking.ok && booking.data.paymentStatus === "partial" && booking.data.packageId === pkg.data.id, JSON.stringify(booking.code));
  agentSnap = await snapshot(agt.cookie);
  check("One pilgrim record is created per traveller", agentSnap.pilgrims.filter((p) => p.bookingId === booking.data.id).length === 3);
  check("Seats are deducted from the departure", agentSnap.seatsTaken[dep1.id] === 3);
  await rpc(admin.cookie, "leads.update", { id: refLead.id, patch: { stage: "confirmed" } });
  check("Overbooking is refused", (await rpc(admin.cookie, "bookings.create", { leadId: refLead.id, departureId: dep1.id, travelers: 2, totalDzd: 510000, paidDzd: 0, bookingDate: "2026-11-13" })).code === "not_enough_seats");
  const siteDetail = await (await fetch(`${BASE}/fr/packages/${pkg.data.slug}`)).text();
  check("The website shows the real number of seats left", siteDetail.includes("1 places restantes"));
  const paid = await rpc(agt.cookie, "bookings.update", { id: booking.data.id, paidDzd: 765000 });
  check("Updating the payment recalculates the status", paid.data?.paymentStatus === "paid");
  check("Paying more than the total is refused", (await rpc(agt.cookie, "bookings.update", { id: booking.data.id, paidDzd: 900000 })).status === 400);
  const pilgrim = agentSnap.pilgrims.find((p) => p.bookingId === booking.data.id);
  const checklist = await rpc(agt.cookie, "pilgrims.update", { id: pilgrim.id, checklist: { passport: true, photos: true }, visaStatus: "submitted" });
  check("Pilgrim document checklist and visa status can be tracked", checklist.data?.checklist.passport === true && checklist.data.visaStatus === "submitted");
  const mgrSnap = await snapshot(mgr.cookie);
  const reportBooking = mgrSnap.bookings.find((b) => b.id === booking.data.id);
  check("Booking and payment data reach the manager's reports", reportBooking?.totalDzd === 765000 && reportBooking.paidDzd === 765000 && reportBooking.paymentStatus === "paid");
  const cancelled = await rpc(mgr.cookie, "bookings.update", { id: booking.data.id, paymentStatus: "cancelled" });
  check("Cancelling a booking releases its seats", cancelled.data?.paymentStatus === "cancelled" && (await snapshot(mgr.cookie)).seatsTaken[dep1.id] === undefined);

  // One-click booking from the dashboard ("Book now"): the customer is confirmed automatically.
  await webhook(inbound({ from: "213661000777", name: "One Click", text: "Salam" }));
  const quickLead = leadByPhone(await snapshot(admin.cookie), "+213661000777");
  const quick = await rpc(admin.cookie, "bookings.create", { leadId: quickLead.id, departureId: dep2.data.id, travelers: 2, totalDzd: 530000, paidDzd: 100000, bookingDate: "2026-11-13", confirmLead: true });
  const quickAfter = leadByPhone(await snapshot(admin.cookie), "+213661000777");
  check("One-click booking confirms the customer and links the offer", quick.ok && quickAfter.stage === "confirmed" && quickAfter.packageId === pkg.data.id, JSON.stringify(quick.code));

  // Package photos uploaded from the dashboard.
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const upload = (cookie, body, type = "image/png") => fetch(`${BASE}/api/upload`, { method: "POST", headers: { "Content-Type": type, Origin: BASE, Cookie: cookie }, body });
  const uploaded = await upload(mgr.cookie, png);
  const uploadedUrl = (await uploaded.json().catch(() => null))?.data?.url;
  const served = uploadedUrl ? await fetch(`${BASE}${uploadedUrl}`) : null;
  check("A package photo can be uploaded and is served back", uploaded.ok && served?.ok && served.headers.get("content-type") === "image/png", uploadedUrl);
  const withPhoto = await rpc(mgr.cookie, "packages.save", { ...Object.fromEntries(Object.entries(pkg.data).filter(([k]) => !["createdAt", "updatedAt", "slug", "refCode", "isDemo"].includes(k))), coverImage: uploadedUrl, firstDeparture: null });
  check("An uploaded photo can be set as the package cover", withPhoto.data?.coverImage === uploadedUrl, JSON.stringify(withPhoto.code));
  check("Agents cannot upload photos", (await upload(agt.cookie, png)).status === 403);
  check("Files that are not images are refused", (await upload(mgr.cookie, "hello", "image/png")).status === 400);

  // Vacation and trip offers, next to Umrah and Hajj.
  const base = Object.fromEntries(Object.entries(pkg.data).filter(([k]) => !["id", "createdAt", "updatedAt", "slug", "refCode", "isDemo", "coverImage"].includes(k)));
  const vacation = await rpc(mgr.cookie, "packages.save", { ...base, name: "Vacances Antalya 8 jours", nameAr: null, category: "vacation", status: "active", makkahArea: null, haramDistanceM: null, walkMinutes: null, madinahHotel: null, coverImage: null, firstDeparture: null });
  const trip = await rpc(mgr.cookie, "packages.save", { ...base, name: "Circuit Tassili 5 jours", nameAr: null, category: "trip", status: "draft", coverImage: null, firstDeparture: null });
  check("Vacation and trip offers get their own reference codes", vacation.data?.refCode?.startsWith("VAC-") && trip.data?.refCode?.startsWith("TRP-"), JSON.stringify([vacation.code, trip.code]));
  check("An active vacation offer is listed on the website under its own filter", (await (await fetch(`${BASE}/fr/packages?c=vacation`)).text()).includes("Vacances Antalya 8 jours"));

  section("16 · Role permissions (enforced on the server)");
  const denied = async (cookie, name, input = {}) => (await rpc(cookie, name, input)).status === 403;
  check("Agent: no integrations, team, settings, demo tools or deletions", (await denied(agt.cookie, "integrations.status")) && (await denied(agt.cookie, "team.create", { name: "Xx", email: "x@x.test", password: "0123456789ab", role: "admin" })) && (await denied(agt.cookie, "settings.update", { agencyName: "Hack" })) && (await denied(agt.cookie, "demo.simulate", { scenario: "new_customer" })) && (await denied(agt.cookie, "leads.delete", { id: target.id })));
  check("Manager: sales and catalogue, but no integrations, team management or settings", (await denied(mgr.cookie, "integrations.status")) && (await denied(mgr.cookie, "team.update", { id: agent.data.id, role: "admin" })) && (await denied(mgr.cookie, "settings.update", { agencyName: "Hack" })) && mgrSnap.leads.length > 5);
  check("Agents do not receive colleagues' e-mail addresses", agentSnap.staff.every((s) => s.email === ""));
  check("Employees cannot promote themselves", (await denied(agt.cookie, "team.update", { id: agent.data.id, role: "admin" })));
  await rpc(admin.cookie, "team.update", { id: agent.data.id, isActive: false });
  check("Deactivation revokes an open session immediately", (await rpc(agt.cookie, "snapshot")).status === 401);
  await rpc(admin.cookie, "team.update", { id: agent.data.id, isActive: true });
  agt = await login("agent@acceptance.test", cfg.agentPassword);
  check("Reactivated employee can log in again", agt.status === 200);
  // Usernames instead of emails.
  const userPass = secret();
  const byUsername = await rpc(admin.cookie, "team.create", { name: "Username Agent", username: "Sara.B", password: userPass, role: "agent" });
  const usernameLogin = await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ login: "sara.b", password: userPass }) });
  check("Employees can be created with a username and sign in with it", byUsername.ok && usernameLogin.status === 200, JSON.stringify(byUsername.code));
  check("A username can only be used once", (await rpc(admin.cookie, "team.create", { name: "Other", username: "sara.b", password: secret(), role: "agent" })).code === "email_taken");
  const settings = await rpc(admin.cookie, "settings.update", { agencyName: "Agence Test", whatsappNumber: "213 770 00 00 00", licenseNumber: "TEST-LIC" });
  check("Admin can update agency settings", settings.data?.agencyName === "Agence Test" && settings.data.whatsappNumber === "213770000000");
  const home = await (await fetch(`${BASE}/ar`)).text();
  check("Website WhatsApp buttons appear once the number is set, with the reference code prefilled", home.includes("https://wa.me/213770000000?text=%5BWEB-00%5D"));

  section("17 · Activity logs");
  const log = (await rpc(admin.cookie, "activity.list", { limit: 500 })).data;
  const actions = new Set(log.map((a) => a.action));
  const expected = ["lead_created", "message_in", "message_out", "lead_assigned", "stage_changed", "lead_updated", "package_selected", "booking_created", "payment_updated", "followup_scheduled", "followup_completed", "followup_rescheduled", "package_created", "package_updated", "departure_created", "staff_created", "staff_updated", "settings_updated", "login"];
  const missing = expected.filter((a) => !actions.has(a));
  check("Important changes are recorded in the activity log", missing.length === 0, `missing: ${missing.join(", ")}`);
  const entry = log.find((a) => a.action === "lead_assigned" && a.leadId === target.id);
  check("Entries carry time, actor, action, related lead, description and metadata", !!entry?.createdAt && entry.actorName === "Meriem Manager" && entry.leadId === target.id && !!entry.description && entry.meta.toName === "Anis Agent");
  check("System events are attributed to the system", log.find((a) => a.action === "message_in")?.actorType === "system");
  check("Rejected webhooks are logged as errors", actions.has("webhook_error"));
  check("There is no endpoint to edit or delete log entries", (await rpc(admin.cookie, "activity.update", { id: entry.id })).status === 404 && (await rpc(admin.cookie, "activity.delete", { id: entry.id })).status === 404);
  const agentLog = (await rpc(agt.cookie, "activity.list", { limit: 500 })).data;
  check("Agents only see log entries about their own work", agentLog.length > 0 && agentLog.length < log.length && agentLog.every((a) => a.actorId === agent.data.id || a.visibleTo.includes(agent.data.id)));

  section("Integrations page honesty");
  const statusRes = await fetch(`${BASE}/api/rpc/integrations.status`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, Cookie: admin.cookie }, body: "{}" });
  const statusText = await statusRes.text();
  const status = JSON.parse(statusText).data;
  check("Without a successful Meta test the status is never 'connected'", status.connection === "configured" && status.state.lastTestOk === null);
  check("Missing credentials are listed by name", status.config.missing.includes("WHATSAPP_ACCESS_TOKEN") && status.config.present.WHATSAPP_APP_SECRET === true);
  check("Secrets are never sent to the browser", !statusText.includes(cfg.appSecret) && !statusText.includes(cfg.verifyToken));
  check("Handshake and last webhook times are tracked", !!status.state.webhookVerifiedAt && !!status.state.lastRealEventAt && status.recentEvents.length > 0);
  const test = await rpc(admin.cookie, "integrations.test");
  check("Connection test reports missing credentials instead of pretending", test.ok && test.data.ok === false && test.data.detail.error === "missing_credentials");

  section("Public website");
  for (const lang of ["ar", "fr", "en"]) {
    const html = await (await fetch(`${BASE}/${lang}`)).text();
    check(`/${lang} renders with the right language and direction`, html.includes(`<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">`));
  }
  const form = (body) => fetch(`${BASE}/api/public/lead`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify(body) });
  const formOk = await form({ name: "Visiteur Site", phone: "0770 11 22 33", packageSlug: pkg.data.slug, adults: 2, children: 1, message: "Je souhaite un devis", consent: true, utmSource: "facebook", utmCampaign: "ramadan" });
  snap = await snapshot(admin.cookie);
  const formLead = leadByPhone(snap, "+213770112233");
  check("Website form creates a lead linked to the package, with campaign tracking", formOk.status === 201 && formLead?.source === "website_form" && formLead.packageId === pkg.data.id && formLead.displayName === "Visiteur Site" && formLead.utmCampaign === "ramadan" && formLead.adults === 2);
  check("Repeated form submissions are rate-limited", (await form({ name: "Visiteur Site", phone: "0770 11 22 33", consent: true })).status === 429);
  check("Form without consent or with an invalid phone is refused", (await form({ name: "X Y", phone: "0770 11 22 44", consent: false })).status === 400 && (await form({ name: "X Y", phone: "12", consent: true })).status === 400);
  const leadsBefore = snap.leads.length;
  const bot = await form({ name: "Bot", phone: "0770 99 88 77", consent: true, website: "http://spam.example" });
  check("Honeypot submissions are silently dropped", bot.status === 200 && (await snapshot(admin.cookie)).leads.length === leadsBefore);
  check("Form posts from other sites are blocked", (await fetch(`${BASE}/api/public/lead`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" })).status === 403);
  const draft = await rpc(mgr.cookie, "packages.save", { ...pkgInput, name: "Brouillon secret", status: "draft" });
  check("Draft packages are not visible on the website", draft.ok && !(await (await fetch(`${BASE}/fr/packages`)).text()).includes("Brouillon secret"));

  section("19–20 · Routes");
  const routes = ["", "/leads", "/packages", "/departures", "/bookings", "/follow-ups", "/team", "/analytics", "/activity", "/integrations", "/settings"];
  const statuses = await Promise.all(routes.map((r) => fetch(`${BASE}/admin${r}`, { headers: { Cookie: admin.cookie } }).then((res) => res.status)));
  check("All 11 dashboard screens render for an admin", statuses.every((s) => s === 200), statuses.join(","));
  const sitePages = await Promise.all(["/ar/packages", "/fr/about", "/en/contact", "/ar/privacy", "/fr/thank-you", `/ar/packages/${pkg.data.slug}`].map((r) => fetch(`${BASE}${r}`).then((res) => res.status)));
  check("All website pages render", sitePages.every((s) => s === 200), sitePages.join(","));
  check("Unknown pages return 404", (await fetch(`${BASE}/fr/does-not-exist`)).status === 404 && (await fetch(`${BASE}/xx`)).status === 404);

  section("Demo data");
  const loaded = await rpc(admin.cookie, "demo.load");
  snap = await snapshot(admin.cookie);
  check("Sample data loads and every sample record is flagged", loaded.data?.leads === 14 && snap.leads.filter((l) => l.isDemo).length >= 14 && snap.packages.filter((p) => p.isDemo).length === 3);
  const realBefore = snap.leads.filter((l) => !l.isDemo).length;
  await rpc(admin.cookie, "demo.clear");
  snap = await snapshot(admin.cookie);
  check("Removing sample data leaves real records untouched", snap.leads.every((l) => !l.isDemo) && snap.leads.length === realBefore && snap.packages.every((p) => !p.isDemo));

  adminStream.close();
  agentStream.close();
}

let failed = false;
try {
  await run();
} catch (error) {
  failed = true;
  console.error("\nAcceptance run crashed:", error);
  console.error(serverLog.slice(-1200));
} finally {
  server.kill();
  await sleep(500);
  if (USE_APPWRITE) {
    await cleanupAppwrite({ dropDatabase: true }).catch((error) => console.error("Appwrite cleanup failed:", error?.message ?? error));
    console.log(`Removed temporary database "${appwriteEnv.APPWRITE_DATABASE_ID}" and the test users.`);
  }
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* temp dir is cleaned by the OS */
  }
}
const passed = results.filter((r) => r.ok).length;
if (passed !== results.length) {
  const errors = serverLog.split("\n").filter((line) => /\[(server|webhook|activity|bootstrap)\]|Error|error:/.test(line));
  if (errors.length) console.log(`\nServer log (errors):\n${[...new Set(errors)].slice(-25).join("\n").slice(0, 4000)}`);
}
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(failed || passed !== results.length ? 1 : 0);
