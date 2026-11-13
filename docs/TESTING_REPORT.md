# Testing report

Date: 2026-11-13 · Environment: Windows 11, Node 24, local demo datastore, Redis 7 and Appwrite 2.7.2 in Docker, headless Chrome.

## Summary

| Suite | Result | How to run |
|---|---|---|
| TypeScript check | clean | `npm run typecheck` |
| Unit tests | 40 / 40 | `npm test` |
| End-to-end acceptance (HTTP, isolated server), local datastore | 114 / 114 | `npm run test:acceptance` |
| Same 114 checks against **Redis 7** (Docker, isolated key prefix) | 114 / 114 | `REDIS_URL=redis://127.0.0.1:6379 REDIS_PREFIX=test npm run test:acceptance` |
| Same 114 checks against **live Appwrite 2.7.2** (Docker, temporary database) | 114 / 114 | `npm run test:appwrite` |
| Two app servers sharing one Redis (serverless simulation): the same WhatsApp message sent 10 times and 12 messages from one customer, split across both at once | 1 lead, 1 + 12 messages, 0 duplicates; server B's change feed saw server A's writes | script used during the Vercel work |
| Vercel build (`VERCEL=1 react-router build`, Vercel preset) and standard Node build | both succeed | — |
| Browser checks on the Appwrite-backed dashboard | 16 / 16 | headless Chrome, same script as below |
| Browser checks (real UI, two sessions, RTL, phone width) | 16 / 16 | driven by a headless-Chrome script during the build |
| Production build + smoke test | 9 / 9 | `npm run build`, then served build checked |

The 5 checks added with the Vercel work: one-click booking confirms the customer and links the offer; a photo uploads and is served back; an uploaded photo can be set as a package cover; agents cannot upload; non-images are refused.

Not covered by any test (stated plainly, details at the end): a deployment on a real Vercel account, a real Meta webhook, audible playback of the notification sound, and mouse drag-and-drop on the pipeline board.

## The 20 acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Admin can log in | Pass | Acceptance §1: login, wrong password 401, forged cookie 401, redirect without session |
| 2 | Admin can create and manage employees | Pass | §2: create manager/agents, duplicate email refused, deactivate blocks login, reactivate |
| 3 | A simulated WhatsApp message creates a lead | Pass | §3–9: signed webhook → lead; also from the dashboard's Simulate buttons |
| 4 | Lead shows WhatsApp name and phone | Pass | §3–9; browser: card shows name and `+213 …` |
| 5 | Message appears in the conversation timeline | Pass | §3–9 (`messages.list`); browser: drawer conversation tab |
| 6 | Repeated message updates the existing lead | Pass | §3–9: one lead, unread 2, latest message updated, employee edits untouched |
| 7 | Duplicate delivery creates no duplicate | Pass | §3–9: same body twice, and same message id in a new envelope → one message, counter unchanged |
| 8 | Referral information is saved | Pass | §3–9: Facebook ad (ID, headline, click ID), Instagram ad detected |
| 9 | Missing referral handled | Pass | §3–9: source "organic", no ad fields; missing profile name → null |
| 10 | Realtime across dashboard sessions | Pass | Acceptance: event pushed in ~40–55 ms; browser: second session shows the card in ~150 ms with toast, badge and tab-title count |
| 11 | Employees can assign and update leads | Pass | §11: manager assigns, agent edits, agent cannot reassign or touch other leads |
| 12 | Employees can schedule follow-ups | Pass | §12: create, reschedule, complete; browser: scheduled from the drawer |
| 13 | Managers can create and manage packages | Pass | §13: create with first departure, second departure, update, agent refused, published on website |
| 14 | Confirmed leads can become bookings | Pass | §14: refused before Confirmed; booking, one pilgrim per traveller, seats deducted, overbooking refused |
| 15 | Booking and payment data appear in reports | Pass | §15: payment update → status, manager's data; unit tests of revenue / conversion calculations |
| 16 | Role permissions are enforced | Pass | §16: 403 for each forbidden action per role; agents get only their records (page data and live feed); deactivation revokes an open session |
| 17 | Activity logs record important changes | Pass | §17: 19 action types present with actor, time, lead, metadata; no edit/delete endpoint; agents see only their own entries |
| 18 | Mobile and desktop layouts work | Pass | Browser: all 11 dashboard pages and the website at 390 px without horizontal overflow; desktop at 1440 px; mobile menu opens |
| 19 | No decorative buttons | Pass (by review) | Every control is wired to a handler or link; primary flows exercised in tests. Not every single button was clicked by automation |
| 20 | No runtime errors or broken routes | Pass | All routes return 200 (404 for unknown); zero console errors across the browser run |

## Additional checks in the acceptance suite

- **Webhook security:** invalid signature 401, missing signature 401, wrong verify token 403, malformed JSON 400, events for another phone number ignored, rejected webhooks create nothing and are logged.
- **Concurrency:** five customers at once → five leads; three simultaneous first messages from one sender → one lead, three messages, unread 3.
- **Coexistence echo:** a reply from the Business app is stored as outgoing, clears unread, moves New → Contacted.
- **Username-only customer:** lead created with no phone number.
- **Website:** language and direction per locale; form creates a linked lead with campaign data; rate limit; consent and phone validation; honeypot; cross-site posts blocked; drafts hidden; WhatsApp links carry the reference code; seats left shown from real bookings.
- **Integrations honesty:** never "connected" without a successful Meta test; missing variables listed by name; secrets absent from the response; connection test reports missing credentials.
- **Demo data:** all sample records flagged; removal leaves real records intact.
- **Production mode:** secure cookie flags, demo tools off by default, webhook answers 503 until configured.

## Problems found during testing and fixed

| Problem | Fix |
|---|---|
| Horizontal overflow on phones (Departures, Analytics) | Grid children and long labels can now shrink; segmented controls scroll |
| Syncfusion trial banner covered the top bar on Analytics | Built-in chart by default; Syncfusion loads only with a licence key |
| "Load sample data" was blocked after a single simulated event | Loading now checks for the seeded set specifically |
| Sample leads showed a time in the future | Today's sample leads are dated in the recent past |
| In Arabic, a phone number used as a name showed "+" on the wrong side; Latin names misplaced a trailing dot | Direction isolation for numbers, automatic direction for names |
| Avatar initials such as "S(" | Initials use words that start with a letter |
| Dialog stole focus back on every keystroke (found in review) | Focus logic no longer depends on re-renders |
| Three Appwrite driver bugs (empty create, date format, null booleans) | See "Live Appwrite run" |

## Live Appwrite run (2026-11-13)

A self-hosted Appwrite **2.7.2** was installed with the official installer (Docker, `infra/appwrite`, ports 8080/8443 on 127.0.0.1). `scripts/local-appwrite-bootstrap.mjs` created the console account, project `umrah-crm-local` and a server key with 14 scopes. The app created the database, 12 tables, columns and indexes by itself.

First run: **100 / 109**. The failures exposed three real driver bugs, all fixed:

| Bug (only visible on real Appwrite) | Effect | Fix |
|---|---|---|
| Appwrite refuses to create a row from an empty data object | The `integration` singleton was never created, so every webhook failed with 500 | Rows are created with every column (missing ones as null) |
| Appwrite returns dates as `…+00:00`, the app compares ISO strings ending in `Z` | Follow-up date checks failed | All dates are normalised to `…Z` on read |
| Appwrite returns unset booleans as null, the driver turned them into `false` | Integration status read "error" instead of "not tested yet" | Nullable boolean columns keep null |

Also hardened: first-start bootstrap now only ignores "already exists" and surfaces any other error.

Second and third runs: **108 / 109**, then **109 / 109** (35 s). Local-datastore suite re-run afterwards: still 109 / 109. Browser suite on the Appwrite-backed dashboard: 16 / 16, *Integrations → Database* shows Appwrite with a green self-test.

Not yet run: Appwrite **Cloud** (same API; only endpoint and key differ).

## What was not tested, and why

1. *(resolved — see "Live Appwrite run" above)*
2. **Real Meta traffic.** No Meta credentials: the handshake, signature check and payload handling were tested with payloads built from Meta's documented shapes and signed with a test secret. The Graph API "Test connection" call was only exercised on its missing-credentials path.
3. **Coexistence history import and contact sync** — implemented from documentation; unit-tested for parsing only.
4. **Notification sound** — the trigger path is covered (notification, badge, highlight); actual audio output cannot be heard in a headless browser. Use *Settings → Play sound*.
5. **Mouse drag-and-drop** on the pipeline — stage changes were tested through the same server call (and the per-card "move to stage" control); the native drag gesture itself was not automated.
6. **Load and long-running behaviour**, multi-instance deployments, and browsers other than Chromium.

## Re-running

```bash
npm run typecheck
npm test
npm run test:acceptance   # starts its own server on port 5199 with temporary data
npm run test:appwrite     # same, against the Appwrite in infra/appwrite/app.env or .env (temporary database, cleaned up)
```
