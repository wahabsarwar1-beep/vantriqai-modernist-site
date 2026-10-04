# VantriqAI social posts

Facebook and Instagram feed posts for vantriqai.com: 1080×1350 (4:5), built in
the site's Symphony palette (ink, cream, cobalt) with Sora / Manrope.

## What's here

| File | What it is |
| --- | --- |
| `ads.html` | Source for every card and carousel slide. Open it in a browser to see them all. |
| `vantriqai-ad-NN.png` | Single-image posts 01–12 |
| `vantriqai-carousel-NN-K.png` | Carousel slides (C01 = slides 1–7) |
| `vantriqai-video-*.mp4` | Video posts (V01 Reel 9:16, V02 Feed 4:5) |
| `captions.md` | Ad headline, Facebook caption and Instagram caption for each post. **This is the file people edit.** |
| `captions.json` | The same copy in the form the n8n workflow reads. Built from `captions.md`; don't edit it by hand. |
| `briefs.md` | Ideas for upcoming posts. The weekly content routine works through them. |
| `render.js` | Renders `ads.html` to the PNGs |
| `captions_to_json.py` | Rebuilds `captions.json` from `captions.md` |
| `n8n/daily-post.workflow.ts` | Original source of the n8n posting workflow (the live copy in n8n has since gained the video branch) |

| Post | Angle |
| --- | --- |
| 01 | Answer every customer in 1.2s |
| 02 | 21:40 WhatsApp conversation |
| 03 | 78% buy from whoever answers first |
| 04 | Same message, two endings |
| 05 | One agent, every channel |
| 06 | Live in weeks, not quarters |
| 07 | 21× more likely to qualify at 5 minutes |
| 08 | Clinics: appointments booked, front desk freed |
| 09 | Real estate: every enquiry qualified by morning |
| 10 | Restaurants: take the order through the rush |
| 11 | Roman Urdu replies |
| 12 | Monday Insights Digest |
| C01 | Carousel: 5 signs your inbox is costing you sales (7 slides) |
| V01 | Video, Reel 9:16: One platform, built to act (posts 5 Oct) |
| V02 | Video, Feed 4:5: Agents, Pulse and Echo (posts 8 Oct) |

## Making or changing a post

```sh
npm i --no-save playwright-core
node marketing/social-ads/render.js          # everything
node marketing/social-ads/render.js 8 k3     # card 08 and carousel slide 3
python3 marketing/social-ads/captions_to_json.py
```

- A **single post** is a `<section class="card cN">` in `ads.html` plus a
  `## NN · …` section in `captions.md`.
- A **carousel** is a set of `<section class="card k …" id="ckN">` slides plus a
  `## C01 · …` section. Its slides are every `vantriqai-carousel-01-*.png`, in
  order (2–10 slides).
- A **video** is a `## V01 · …` section with a `**Video:**` line. Use a
  jsDelivr URL pinned to the commit that added the file
  (`https://cdn.jsdelivr.net/gh/wahabsarwar1-beep/vantriqai-modernist-site@<sha>/marketing/social-ads/<file>.mp4`),
  because GitHub raw serves .mp4 as `application/octet-stream`. Keep files under 20 MB (jsDelivr's limit).
  Instagram gets a Reel shared to the feed, and Facebook gets a Page video.
- Add `**Post on:** 2026-10-12` under a heading to post it on that day.

## How posting works (n8n)

Workflow **VantriqAI · Daily Facebook + Instagram Post** on n8n.vantriqai.com.

Every day at 10:00 PKT it:

1. reads `captions.json` from this folder on GitHub;
2. picks the post dated today, or, if none is dated today, the next evergreen
   post in rotation;
3. emails the draft to server@vantriqai.com with **Publish now** and **Skip
   today** buttons (skipped if nobody answers in 6 hours);
4. posts it to the Facebook Page (ID 1291897617346380) and to Instagram @vantriq_ai,
   as a single photo, a multi-photo/carousel post, or a video (Instagram Reel).

Before it can run, three things need doing in n8n and Meta (see the sticky note
on the workflow):

1. Make @vantriq_ai a Business account linked to the Facebook Page.
2. Add a **VantriqAI Page Access Token** credential (Facebook Graph API,
   long-lived Page token with `pages_manage_posts`, `pages_read_engagement`,
   `instagram_basic`, `instagram_content_publish`) to every Facebook/Instagram
   node.
3. Add a **VantriqAI SMTP** credential (smtp.hostinger.com:465,
   server@vantriqai.com) to the approval email node.

To test, set `forceCardId` in Config (e.g. `C01`) and click **Test Run**.

`contentBaseUrl` points at this branch on raw.githubusercontent.com. Once the
branch is merged, point it at `main`.

## Handing posts over

- **Ideas:** add them to `briefs.md`, or send them to Claude in chat.
- **Weekly:** a Claude routine runs each Saturday. It turns the briefs (or
  topics from the site, if there are none) into the next week's dated posts,
  renders them, updates the captions and pushes. The n8n workflow posts them
  day by day.
- **Control:** nothing goes live without the approval email, unless
  `requireApproval` is switched off.
