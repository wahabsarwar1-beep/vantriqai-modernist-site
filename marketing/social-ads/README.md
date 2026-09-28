# VantriqAI social ad cards

Six 1080×1350 (4:5) cards for Facebook and Instagram feed, built in the site's
Symphony palette (ink, cream, cobalt) with Sora / Manrope.

| File | Angle | CTA |
| --- | --- | --- |
| `vantriqai-ad-01.png` | Answer every customer in 1.2s (orb gauge) | Book a free demo |
| `vantriqai-ad-02.png` | 21:40 WhatsApp conversation | Get your agent |
| `vantriqai-ad-03.png` | 78% buy from whoever answers first | Be first — every time |
| `vantriqai-ad-04.png` | Same message, two endings | See it on your business |
| `vantriqai-ad-05.png` | One agent, every channel | Start building |
| `vantriqai-ad-06.png` | Live in weeks, not quarters | Book a 15‑min call |

Edit copy in `ads.html` (open it in a browser to see all six), then re-render:

```sh
npm i --no-save playwright-core
node marketing/social-ads/render.js        # all cards
node marketing/social-ads/render.js 2 5    # just cards 2 and 5
```

`render.js` expects a Chromium at `/opt/pw-browsers/...`; point `executablePath`
at your local Chrome if you render elsewhere.

## Captions

`captions.md` holds the write-up for each card: an ad headline, a Facebook caption
and an Instagram caption. `captions.json` holds the same text for the posting
workflow. Change both together, or change the `.md` and regenerate the `.json`.

## Daily posting (n8n)

Workflow **VantriqAI · Daily Facebook + Instagram Post** on n8n.vantriqai.com
(source: `n8n/daily-post.workflow.ts`, written in n8n Workflow SDK code).

Daily 10:00 PKT → fetch `captions.json` → pick the next card in rotation →
email the draft for approval (Publish now / Skip today; skipped if nobody
answers within 6 hours) → post the photo to the Facebook Page, and create and
publish the Instagram post.

Before you activate it:

1. **Config node**: fill in `facebookPageId` and `instagramAccountId` (the
   Instagram Business account linked to that Page).
2. **VantriqAI Page Access Token** credential (Facebook Graph API): a long-lived
   Page token with `pages_manage_posts`, `pages_read_engagement`,
   `instagram_basic` and `instagram_content_publish`.
3. **VantriqAI SMTP** credential: for example Hostinger `smtp.hostinger.com:465`
   for server@vantriqai.com.
4. `contentBaseUrl` points at this branch on raw.githubusercontent.com. Once the
   branch is merged, point it at `main`.

To test, set `forceCardId` (for example `03`) and click **Test Run**. To post
with no approval step, set `requireApproval` to `false`. To add a card, render a
new PNG here and add its entry to `captions.json`. The rotation picks it up
automatically.
