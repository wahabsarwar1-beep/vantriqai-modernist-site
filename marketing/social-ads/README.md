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
