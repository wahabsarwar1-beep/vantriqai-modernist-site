# The VantriqAI app — on phones, and in the Play Store (v9.15)

## Where the app is

There are three surfaces, and only one of them is ever installed:

| Who | What they use | Install? |
|---|---|---|
| **Your clients' customers** (answering a survey) | the survey page — a link, QR code or WhatsApp message opens it in any phone browser | **Never.** Nobody installs an app to answer three questions; a link gets answers, an app store kills them. |
| **Your clients** (the businesses) | the customer portal at `https://portal.vantriqai.com` — Surveys, Analytics, agents, invoices | **Yes: the VantriqAI app.** Installable today from the browser; publishable to the Play Store (below). |
| **A counter tablet** (kiosk) | a survey's kiosk link (`…/s/<address>?kiosk=1`) | Optional: open the kiosk link on the tablet and choose **Install app / Add to Home screen** — it becomes a full-screen app for that survey. |

## Install it now (no store needed)

- **Android (Chrome)**: open `https://portal.vantriqai.com`, sign in — the Overview tab shows **Get the VantriqAI app → Install** (or Chrome's menu → *Install app*).
- **iPhone / iPad (Safari)**: open the same address → **Share** → **Add to Home Screen**.
- It opens full screen with the VantriqAI icon. Surveys only appear for clients an admin has switched them on for (CRM → Clients → the client → Customer-satisfaction surveys).

## Put it in the Google Play Store

The Play Store app is the same portal, wrapped as a *Trusted Web Activity* — Google's own way of publishing a web app. Updates are instant: every CRM deploy updates the app, with no new store release.

What only you can do (it needs your Google account and payment):

1. **Google Play developer account** — https://play.google.com/console → sign up (one-time USD 25, identity verification can take a few days).
2. **Build the Android package** — https://www.pwabuilder.com → enter `https://portal.vantriqai.com` → *Package for stores* → **Android** →
   - Package ID: `com.vantriqai.app` (must match CRM → Settings → The VantriqAI app)
   - App name `VantriqAI`, launcher name `VantriqAI`
   - Signing key: *Create new* — **download the zip and keep the signing key file and its passwords safe**; you need them for every future update.
3. **Create the app in Play Console** → *Create app* → name **VantriqAI**, App, Free. Then:
   - *Test and release → Production* (or *Internal testing* first) → upload the `.aab` from the PWABuilder zip.
   - *Store listing*: icon `android/store-listing/play-icon-512.png`, feature graphic `android/store-listing/feature-graphic-1024x500.png`, 2+ phone screenshots (take them on your phone from the installed app), short and full description (below).
   - *App content*: privacy policy **`https://portal.vantriqai.com/privacy`** (a draft — read it and adjust before submitting), data safety (collects: name, email, phone, app interactions; encrypted in transit; users can request deletion), content rating questionnaire (Business, no objectionable content), target audience 18+.
4. **Make it full screen** — Play Console → *Test and release → App integrity* → copy the **SHA-256 certificate fingerprint** of the *App signing key* (and of the *Upload key*) → CRM → **Settings → The VantriqAI app** → paste both, one per line → **Save**. Check with *View what Android sees*: it should list `com.vantriqai.app` and your fingerprints. (Until then the app works but shows a thin browser bar at the top.)
5. **Submit for review** — Google usually decides within a few days.

### Listing text

- **Short description** (80): `Your AI agents, analytics and customer-satisfaction surveys in one app.`
- **Full description**:
  > VantriqAI puts your business's AI agents in your pocket. See every conversation your WhatsApp, website and social agents handle, track usage and invoices, and — with Customer Satisfaction — ask your own customers how you did by QR code, link or WhatsApp, with results, NPS and follow-ups the moment answers arrive. For VantriqAI customers; sign in with your portal account.

## What was built for this

- `public/app/manifest.webmanifest`, icons in `public/app/`, `public/sw.js` (keeps only an offline page — never account data), `public/app/offline.html`.
- Portal: app metadata, the install card on Overview.
- Kiosk: `/s/<address>/app.webmanifest`, offered only on `?kiosk=1`.
- `/.well-known/assetlinks.json` from CRM Settings (`settings.android_package`, `settings.android_sha256`).
- `/privacy` — the draft privacy policy.
