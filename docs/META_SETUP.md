# Connecting WhatsApp (Meta Cloud API)

This guide takes you from "Not connected" to real WhatsApp messages appearing as leads.
Requirements and menu names are Meta's and change over time — when in doubt, Meta's documentation wins.
Facts below were checked against Meta's developer documentation on 2026-11-13.

## What the dashboard does (and does not do)

- **Receives** customer messages and stores them as leads and a conversation record.
- **Receives a copy** of replies sent from the WhatsApp Business app, when the number is onboarded with *Coexistence*.
- **Does not send** WhatsApp messages. Employees reply from the WhatsApp Business app; the *Open WhatsApp* button opens the customer's chat.

## 1. Before you start

- The app must be reachable at a **public https:// address** (Meta does not call `localhost`). For a first trial you can use a tunnel; for production use your domain.
- A Meta Business portfolio for the agency (business verification may be requested by Meta).
- A Meta developer account.

## 2. Create the Meta app

1. <https://developers.facebook.com> → *My Apps* → *Create App* → use case with **WhatsApp**.
2. In the app: *WhatsApp → API Setup*. Meta gives you a **test phone number** — use it first.
3. Note the **Phone number ID** and the **WhatsApp Business Account ID** shown on that page.
4. *App settings → Basic* → copy the **App secret**.

## 3. Configure the server

Set these in the server environment (`.env` locally) and restart:

```
WHATSAPP_VERIFY_TOKEN=<any random text you invent>
WHATSAPP_APP_SECRET=<App secret from step 2.4>
WHATSAPP_PHONE_NUMBER_ID=<Phone number ID>
WHATSAPP_BUSINESS_ACCOUNT_ID=<WhatsApp Business Account ID>
WHATSAPP_ACCESS_TOKEN=<token, see step 6>
PUBLIC_BASE_URL=https://your-domain
```

*Integrations* now shows which variables are set (never their values).

## 4. Register the webhook

1. Dashboard → *Integrations* → copy the **Callback URL** (`https://your-domain/api/whatsapp/webhook`).
2. Meta app → *WhatsApp → Configuration → Webhook → Edit*: paste the URL and the same **verify token**.
3. Meta calls the URL with `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`; the server answers with the challenge only if the token matches. *Integrations → Verification handshake* then shows the time.

## 5. Subscribe to webhook fields

In the same Meta screen, subscribe to:

| Field | Used for |
|---|---|
| `messages` | Customer messages and delivery statuses (**required**) |
| `smb_message_echoes` | Replies sent from the WhatsApp Business app (Coexistence) |
| `history` | Past conversations shared during Coexistence onboarding |
| `smb_app_state_sync` | Contacts from the WhatsApp Business app |
| `account_update` | Onboarding / disconnection notices |

## 6. Access token

For anything beyond a quick trial, create a **system user** in Meta Business settings, give it access to the app and the WhatsApp account, and generate a **permanent token** with `whatsapp_business_management` and `whatsapp_business_messaging`. Put it in `WHATSAPP_ACCESS_TOKEN`. (The temporary token on the API Setup page expires within a day.)

The token is only used by the **Test connection** button, which reads the number's display name, quality rating and whether it is linked to the WhatsApp Business app.

## 7. Test

1. *Integrations → Test connection* → status becomes **Connected** only if Meta accepts the credentials.
2. Send a WhatsApp message to the number. Within seconds: a new card on *WhatsApp Leads*, a sound, a notification, and *Last real WhatsApp event* updates.
3. Nothing arrives? Check *Integrations → Last error* and *Recent webhook events*. "Invalid signature" means `WHATSAPP_APP_SECRET` does not match the app that sends the webhooks.

You can also send a signed test event yourself: `npm run simulate -- --url https://your-domain --name "Test" --text "Salam"`.

## 8. Keeping the WhatsApp Business app (Coexistence)

Meta calls this *onboarding WhatsApp Business app users*. The agency keeps its app; the Cloud API receives a copy of conversations.

What Meta's documentation states:

- WhatsApp Business app **2.24.17 or newer**.
- Onboarding goes through **Embedded Signup**, performed by a Meta **Tech Provider or Solution Partner**. An agency cannot switch it on alone from the developer console; you either register as a Tech Provider or use a partner. Embedded Signup v2/v3 were scheduled for deprecation on 2026-10-15 — use the current version.
- After onboarding there are **24 hours** to synchronise contacts and history (up to ~6 months of 1:1 chats, **only if the business agrees to share it**). Group chats are never included.
- In the app, **broadcast lists become read-only**; disappearing messages, view-once and live location are turned off for 1:1 chats.
- Messages sent from the app stay free; throughput for such numbers is fixed at 20 messages per second.
- Meta disconnects numbers whose phone is inactive for about **14 days** (companion devices: about 30 days).

What this means here:

- **Eligibility is Meta's decision.** Do not assume a given number or country qualifies; verify in Meta Business Suite first.
- This project **receives** the Coexistence webhooks once a number is onboarded; it does **not** contain the Embedded Signup onboarding flow itself.
- History import and contact sync are implemented from the documented payloads and **have not been verified with a live onboarded account**. Imported messages are labelled *Imported history*, never count as unread and never trigger notifications.
- *Integrations → Test connection* reports whether Meta says the number is linked to the Business app.

## 9. Things worth knowing

- **Customers without a visible phone number.** Since 2026 WhatsApp users can adopt a username; Meta may then send a business-scoped user ID instead of the phone number. Such a customer still becomes a lead ("Number not shared"); *Open WhatsApp* is unavailable until the number is known.
- **Advertising attribution** comes only from the `referral` object Meta attaches to Click-to-WhatsApp messages (ad ID, headline, body, source URL, click ID). Campaign names are not part of it. Without a referral the lead is labelled *Organic WhatsApp* — an ad source is never guessed.
- **Retries.** Meta retries failed deliveries for up to 36 hours. The server answers 200 only after storing and processing an event, and recognises repeated deliveries by message ID.
- **Demo events** use the reserved phone number ID `DEMO`; they are accepted only when demo tools are enabled and are always flagged DEMO.
