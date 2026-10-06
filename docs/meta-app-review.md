# Meta App Review — Instagram + Messenger agent

App: **Vantriq AI** (ID 968515449639687), currently in development mode.
Goal: Advanced Access to the permissions the Instagram + Messenger agent needs, so it can answer **anyone** who messages @vantriq_ai or the Facebook Page, not only people with a role on the app.

Checked on 6 Oct 2026 through Meta's developer tools: the app has never been submitted (one empty draft exists), has no privacy policy URL, is not attached to a business portfolio, and business verification has not passed.

---

## 1. Before you submit (in the App Dashboard)

Meta rejects a submission without these. All of them are in the dashboard; none can be set through the API.

| # | Where | Set to |
|---|---|---|
| 1 | App settings → Basic → **Privacy policy URL** | `https://vantriqai.com/privacy` |
| 2 | App settings → Basic → **Terms of Service URL** | `https://vantriqai.com/terms` |
| 3 | App settings → Basic → **User data deletion** → "Data deletion instructions URL" | `https://vantriqai.com/data-deletion` |
| 4 | App settings → Basic → **App icon** | 1024×1024 PNG of the VantriqAI logo (notched square) |
| 5 | App settings → Basic → **Category** | Business and pages |
| 6 | App settings → Basic → **Contact email** | an address you read, then verify it (the current one is unverified) |
| 7 | App settings → Basic → **Business portfolio** | attach the app to VantriqAI's business portfolio in Meta Business Suite |
| 8 | Business Suite → Settings → Security Centre → **Business verification** | complete it (company registration, NTN or utility bill in the business name, a phone/email/domain check). This can take several days; start it first. |

The privacy policy and data-deletion page went live on vantriqai.com on 6 Oct 2026 and describe exactly what the agent does with Instagram and Messenger data.

## 2. What to request

In **App Review → Permissions and features**, request **Advanced Access** to:

| Permission | Why the agent needs it |
|---|---|
| `pages_messaging` | Receive and reply to Messenger conversations with our Page |
| `instagram_manage_messages` | Receive and reply to Instagram DMs to @vantriq_ai |
| `instagram_basic` | Read the Instagram account's ID and username (prerequisite of the above) |
| `pages_manage_metadata` | Subscribe our Page to the app's webhooks |
| `pages_show_list` | Find our Page and its linked Instagram account |
| `pages_read_engagement` | Prerequisite for reading Page content and conversations |

Do **not** request the extra permissions that were ticked in the Graph API Explorer (ads, WhatsApp, shopping, creator marketplace…). Every permission requested needs its own justification and screencast, and unused ones are a common reason for rejection.

The daily-post workflow uses `pages_manage_posts` and `instagram_content_publish` on our own Page only, which works with Standard Access; leave them out of this submission.

## 3. Text to paste, per permission

Meta asks "How will your app use this permission?" for each one. Paste these, adjusting only if something has changed.

**pages_messaging**
> VantriqAI is a business in Islamabad, Pakistan, that builds AI customer-service agents. This app runs only on our own Facebook Page, "Vantriq AI - Where business meets Intelligence". When someone sends our Page a Messenger message, the message is delivered to our server by webhook, an AI assistant writes a reply answering their questions about our services, and the app sends that reply through the Send API within the 24-hour messaging window. The person can ask for a human at any time; the assistant tells them a team member will reply, and our team answers from the Page inbox in Meta Business Suite. We do not send promotional or unsolicited messages; every message we send is a reply to a message the person sent us.

**instagram_manage_messages**
> The same assistant answers direct messages sent to our own Instagram professional account, @vantriq_ai, which is linked to our Facebook Page. Incoming messages arrive by webhook; the app replies through the Instagram Messaging API, only in response to a message the person sent, within 24 hours. We use the sender's Instagram name and username only to address them and to record the enquiry in our own CRM so our sales team can follow up. We do not message anyone who has not messaged us first.

**instagram_basic**
> Needed to identify our own Instagram professional account (@vantriq_ai, ID 17841414904483393) linked to our Page, and to read the name and username of people who message it so the reply can address them by name.

**pages_manage_metadata**
> Used once to subscribe our own Page to this app's webhooks for the `messages` and `messaging_postbacks` fields, so incoming Messenger and Instagram messages reach our server.

**pages_show_list**
> Used to list the Pages the administrator manages and select our own Page and its linked Instagram account when the app is connected. The app only operates on VantriqAI's own Page.

**pages_read_engagement**
> Required as a prerequisite to read our own Page's metadata and conversations (including the linked Instagram account) when replying to customer messages.

**Data handling questions** (asked once per submission):

- *Do you share data with third parties?* Yes, with service providers only: message text is sent to OpenAI to generate the reply; the conversation and the enquiry are stored in our own CRM on our own server (Hostinger VPS). We do not sell data, use it for advertising, or share it with other businesses.
- *Data retention and deletion:* see https://vantriqai.com/data-deletion. A person can type "Delete my data" in the chat; the team is emailed automatically, deletes the record and confirms in the same chat.
- *Is the data processed by an AI model?* Yes, to write the reply. The person is told it is VantriqAI's AI assistant if they ask, and can ask for a human.

## 4. Screencast script (one video, about 3 minutes)

Meta wants to see the permission being used from the user's side, end to end. Record the screen at 1080p, no music, English captions or a voice-over. Use a **test account that is not an admin of the app**, added as a Tester (App roles → Roles) so the agent answers it before approval.

1. **0:00 — What the app is.** Show vantriqai.com briefly, then a title card: "VantriqAI answers messages to its own Facebook Page and Instagram account with an AI assistant."
2. **0:15 — Messenger (`pages_messaging`).** On a phone or messenger.com, logged in as the test account, open our Page and send: *"Hi, I run a clothing store in Lahore. Can you answer our DMs?"* Show the reply arriving within about 10 seconds.
3. **0:45 — Instagram (`instagram_manage_messages`, `instagram_basic`).** In the Instagram app, logged in as the test account, DM @vantriq_ai the same message. Show the reply, addressed to the account's name.
4. **1:15 — Human handover.** Send *"Can I talk to a person?"*. Show the reply offering a person and WhatsApp. Then open **Meta Business Suite → Inbox** as the Page admin and show the conversation is there for the team.
5. **1:45 — Data deletion.** Send *"Delete my data"*. Show the short confirmation reply. Then show `https://vantriqai.com/data-deletion`.
6. **2:10 — Webhook subscription (`pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`).** In the App Dashboard, show Messenger → Webhooks (and Instagram → Webhooks) with the callback URL and the `messages` and `messaging_postbacks` fields, and our Page listed as subscribed.
7. **2:40 — Close.** Title card: "Replies are only sent in response to a user's message, within 24 hours. No promotional messages."

Upload the same video against each permission, or cut it into one clip per permission if the form asks for that.

## 5. Instructions for the reviewer

Paste into "Notes for the reviewer":

> This app operates only on our own Facebook Page "Vantriq AI - Where business meets Intelligence" (Page ID 1291897617346380) and its linked Instagram account @vantriq_ai. To test: send any message to the Page on Messenger, or a DM to @vantriq_ai on Instagram. An AI assistant replies within about 10 seconds with information about VantriqAI's services. Ask "Can I talk to a person?" to see the human handover, or "Delete my data" to see the deletion flow. No login to our systems is required. The app does not offer Facebook Login and is not used on any Page other than our own.

## 6. After approval

- Switch the app to **Live** (App settings → Basic → App mode).
- Send a test message from an account with no role on the app to confirm public users get replies.
- Nothing changes in n8n: the same webhook, token and workflow keep working.
