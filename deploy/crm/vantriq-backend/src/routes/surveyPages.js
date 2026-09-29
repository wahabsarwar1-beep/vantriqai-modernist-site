const express = require('express');
const fs = require('fs');
const path = require('path');
const S = require('../utils/surveys');
const { clientIp } = require('../utils/clientIp');

/**
 * The pages a respondent and a customer's printer see — mounted at /s:
 *
 *   GET /s/:slug                         the survey app
 *   GET /s/:slug/qr.svg[?loc=&size=]     a QR code for the table, the counter or the receipt
 *   GET /s/:slug/poster[?loc=&layout=]   a printable A4 poster, or four table cards to a sheet
 *   GET /s/_template/:key                a library template, as a preview (never recorded)
 *
 * The survey app is rendered on the server with the survey already inside it,
 * so it paints on the first response — a respondent standing at a counter on
 * a weak connection should not wait for a second round trip — and so a link
 * pasted into WhatsApp previews with the business's name rather than a blank.
 *
 * Query parameters the app understands: ch= (qr, whatsapp, sms, email, kiosk,
 * embed) tags where the answer came from; loc= the branch; lang= the starting
 * language; kiosk=1 starts over after each answer, for a tablet at a counter;
 * i= a personal one-time invite; preview=1 shows a draft without recording.
 */
const router = express.Router();

const VIEW = path.join(__dirname, '..', 'views', 'survey.html');
let template = null;
function surveyTemplate() {
  // Read once in production; re-read otherwise, so an edit shows on refresh.
  if (!template || process.env.NODE_ENV !== 'production') template = fs.readFileSync(VIEW, 'utf8');
  return template;
}

/** JSON that is safe inside a <script> element, whatever the survey's text contains. */
function scriptJson(v) {
  return JSON.stringify(v)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function fill(html, values) {
  // A function replacer, so a "$&" in a business name is text, not a pattern.
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(values, k) ? values[k] : m));
}

const STATE_TITLE = {
  not_found: 'Survey not found', draft: 'This survey is not open yet', paused: 'This survey is paused', closed: 'This survey has closed',
};

// Link previews. A survey link sent on WhatsApp with previews on is fetched
// by Meta (facebookexternalhit) to draw the card, and apps fetch links pasted
// into chats the same way. That is not the customer opening it: it must not
// mark their invite opened, nor count as a view. Only the fetchers themselves
// are matched — WhatsApp's previewer sends "WhatsApp/2.x", while a page opened
// inside WhatsApp's browser is an ordinary browser user agent.
const LINK_PREVIEW = /^WhatsApp\/|facebookexternalhit|facebookcatalog|meta-externalagent|Twitterbot|Slackbot|TelegramBot|Discordbot|LinkedInBot|SkypeUriPreview|Googlebot|bingbot|Applebot|redditbot|Pinterestbot|Embedly|vkShare/i;

/**
 * GET /s/_template/:key[?business=&lang=] — a library template in the survey
 * app, as a respondent would see it, for the studio's Preview before any
 * survey exists. Always a preview: nothing is recorded, counted or saved.
 * The "_" keeps the path clear of every survey address, which cannot use one.
 */
router.get('/_template/:key', (req, res) => {
  const pub = S.templatePreview(req.params.key, { business: req.query.business });
  const title = pub ? `${pub.display_name} — ${pub.template.name} survey (preview)` : 'Survey template not found';
  const html = fill(surveyTemplate(), {
    LANG: 'en',
    DIR: 'ltr',
    TITLE: S.escapeHtml(title),
    DESCRIPTION: S.escapeHtml('A Vantriq Echo survey template, as your customers would see it.'),
    THEME: '#2f56d9',
    URL: S.escapeHtml(`${S.publicBase(req)}/s/_template/${encodeURIComponent(req.params.key)}`),
    OG_IMAGE: '',
    KIOSK_APP: '',
    DATA: scriptJson({ state: pub ? 'ok' : 'not_found', preview: true, survey: pub, invite: null, slug: null }),
  });
  res.status(pub ? 200 : 404)
    .set('Cache-Control', 'no-store')
    .set('X-Content-Type-Options', 'nosniff')
    .set('X-Robots-Tag', 'noindex')
    .set('Referrer-Policy', 'strict-origin-when-cross-origin')
    .type('html').send(html);
});

router.get('/:slug', async (req, res) => {
  const survey = await S.getSurveyBySlug(req.params.slug);
  const preview = req.query.preview === '1';
  const fetcher = LINK_PREVIEW.test(String(req.get('user-agent') || ''));
  let state = 'ok';
  if (!survey) state = 'not_found';
  else if (survey.status === 'draft' && !preview) state = 'draft';
  else if ((survey.status === 'paused' || survey.client_surveys_enabled === false) && !preview) state = 'paused';
  else if (S.isClosed(survey) && !preview) state = 'closed';

  let invite = null;
  if (survey && state === 'ok' && req.query.i) {
    const inv = await S.findInvite(survey, String(req.query.i));
    if (inv) {
      invite = { token: inv.token, answered: !!inv.response_id };
      if (!fetcher) S.markInviteOpened(inv).catch(() => {});
    }
  }
  if (survey && state === 'ok' && !preview && !fetcher) S.countView(survey, clientIp(req)).catch(() => {});

  const pub = survey && state === 'ok' ? S.publicSurvey(survey) : null;
  const name = survey ? (survey.display_name || survey.company || '') : '';
  const lang = pub ? pub.default_language : 'en';
  const intro = pub && pub.content.intro ? String(pub.content.intro.en || Object.values(pub.content.intro)[0] || '') : '';
  const title = state === 'ok'
    ? `${name ? `${name} — ` : ''}Tell us how we did`
    : `${STATE_TITLE[state]}${name ? ` — ${name}` : ''}`;
  const description = state === 'ok'
    ? (intro.replace(/\{business\}/g, name) || `Share your feedback with ${name}. It takes about a minute.`)
    : 'Customer feedback, powered by VantriqAI.';
  const base = S.publicBase(req);

  const html = fill(surveyTemplate(), {
    LANG: S.escapeHtml(lang),
    DIR: lang === 'ur' ? 'rtl' : 'ltr',
    TITLE: S.escapeHtml(title),
    DESCRIPTION: S.escapeHtml(description.slice(0, 300)),
    THEME: S.escapeHtml((survey && survey.brand_color) || '#2f56d9'),
    URL: S.escapeHtml(survey ? `${base}/s/${survey.slug}` : base),
    OG_IMAGE: survey && survey.logo_url ? `<meta property="og:image" content="${S.escapeHtml(survey.logo_url)}">` : '',
    KIOSK_APP: kioskApp(req, survey, state),
    DATA: scriptJson({ state, preview, survey: pub, invite, slug: survey ? survey.slug : null }),
  });
  res.status(state === 'not_found' ? 404 : 200)
    .set('Cache-Control', 'no-store')
    .set('X-Content-Type-Options', 'nosniff')
    .set('Referrer-Policy', 'strict-origin-when-cross-origin')
    .type('html').send(html);
});

/**
 * A kiosk can be installed on the tablet it runs on, as its own full-screen
 * app ("Add to Home screen" / "Install app"): the survey's kiosk link, in the
 * business's name and colour, opening straight into the kiosk. Only the kiosk
 * link offers it — a customer answering on their own phone is never asked to
 * install anything.
 */
function kioskApp(req, survey, state) {
  if (!survey || state !== 'ok' || req.query.kiosk !== '1') return '';
  const loc = locationOf(survey, req.query.loc);
  const href = `/s/${encodeURIComponent(survey.slug)}/app.webmanifest${loc ? `?loc=${encodeURIComponent(loc.id)}` : ''}`;
  return `<link rel="manifest" href="${S.escapeHtml(href)}">
<link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${S.escapeHtml((survey.display_name || survey.company || 'Feedback').slice(0, 30))}">
<script>if('serviceWorker' in navigator) addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); });</script>`;
}

/** The kiosk's app manifest: it opens full screen, straight into this survey's kiosk. */
router.get('/:slug/app.webmanifest', async (req, res) => {
  const survey = await S.getSurveyBySlug(req.params.slug);
  if (!survey) return res.status(404).type('text/plain').send('Survey not found');
  const loc = locationOf(survey, req.query.loc);
  const name = survey.display_name || survey.company || 'Feedback';
  const start = `/s/${survey.slug}?kiosk=1${loc ? `&loc=${encodeURIComponent(loc.id)}` : ''}`;
  res.set('Cache-Control', 'no-cache').type('application/manifest+json').send(JSON.stringify({
    id: start,
    name: `${name} — feedback${loc ? ` (${loc.name})` : ''}`,
    short_name: name.slice(0, 12),
    description: `Tell ${name} how they did.`,
    start_url: start,
    scope: `/s/${survey.slug}`,
    display: 'fullscreen',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: /^#[0-9a-f]{6}$/i.test(survey.brand_color) ? survey.brand_color : '#2f56d9',
    icons: [
      { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2));
});

function locationOf(survey, id) {
  return (survey.locations || []).find((l) => l.id === String(id || '')) || null;
}

/** The QR code a printed card carries — always the ?ch=qr address, so scans are counted as scans. */
router.get('/:slug/qr.svg', async (req, res) => {
  const survey = await S.getSurveyBySlug(req.params.slug);
  if (!survey) return res.status(404).type('text/plain').send('Survey not found');
  const loc = locationOf(survey, req.query.loc);
  const url = `${S.publicBase(req)}/s/${survey.slug}?ch=qr${loc ? `&loc=${encodeURIComponent(loc.id)}` : ''}`;
  const size = Math.min(2000, Math.max(120, Number(req.query.size) || 480));
  res.set('Cache-Control', 'public, max-age=3600');
  if (req.query.download === '1') {
    res.set('Content-Disposition', `attachment; filename="${survey.slug}${loc ? `-${loc.id}` : ''}-qr.svg"`);
  }
  res.type('image/svg+xml').send(S.qrSvg(url, { size }));
});

/**
 * A printable poster — or, with layout=cards, four table cards to an A4
 * sheet — in the survey's colours and both languages, with the QR code big
 * enough to scan from across a table.
 */
router.get('/:slug/poster', async (req, res) => {
  const survey = await S.getSurveyBySlug(req.params.slug);
  if (!survey) return res.status(404).type('text/plain').send('Survey not found');
  const loc = locationOf(survey, req.query.loc);
  const base = S.publicBase(req);
  const url = `${base}/s/${survey.slug}?ch=qr${loc ? `&loc=${encodeURIComponent(loc.id)}` : ''}`;
  const shortUrl = `${base.replace(/^https?:\/\//, '')}/s/${survey.slug}`;
  const name = survey.display_name || survey.company || '';
  const brand = /^#[0-9a-f]{6}$/i.test(survey.brand_color) ? survey.brand_color : '#2f56d9';
  const cards = req.query.layout === 'cards';
  const e = S.escapeHtml;
  const qr = S.qrSvg(url, { size: 600 });
  const bilingual = (survey.languages || []).includes('ur');

  const card = (small) => `
  <section class="card${small ? ' small' : ''}">
    <header>
      ${survey.logo_url ? `<img class="logo" src="${e(survey.logo_url)}" alt="">` : `<div class="mono">${e((name || '?').trim().charAt(0).toUpperCase())}</div>`}
      <div class="name">${e(name)}</div>
      ${loc ? `<div class="loc">${e(loc.name)}</div>` : ''}
    </header>
    <h1>How did we do?</h1>
    ${bilingual ? '<h2 lang="ur" dir="rtl">ہماری کارکردگی کیسی رہی؟</h2>' : ''}
    <div class="qr">${qr}</div>
    <p class="how">Scan with your phone camera — it takes under a minute.</p>
    ${bilingual ? '<p class="how ur" lang="ur" dir="rtl">اپنے فون کے کیمرے سے اسکین کریں — ایک منٹ سے بھی کم وقت لگتا ہے۔</p>' : ''}
    <p class="url">${e(shortUrl)}</p>
    <footer>Your feedback goes straight to our team · Powered by VantriqAI</footer>
  </section>`;

  res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(name)} — feedback ${cards ? 'cards' : 'poster'}</title>
${bilingual ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@600&display=swap" rel="stylesheet">' : ''}
<style>
:root{--brand:${brand};}
*{box-sizing:border-box;}
html,body{margin:0;background:#eeeae4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#16151a;}
.bar{display:flex;gap:10px;justify-content:center;align-items:center;padding:14px;flex-wrap:wrap;font-size:14px;}
.bar button,.bar a{font:inherit;font-weight:600;border:0;border-radius:999px;padding:10px 18px;cursor:pointer;text-decoration:none;}
.bar button{background:var(--brand);color:#fff;}
.bar a{background:#fff;color:#16151a;border:1px solid #d9d3ca;}
.sheet{width:210mm;min-height:297mm;margin:0 auto 24px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.12);display:flex;flex-wrap:wrap;}
.card{width:100%;min-height:297mm;padding:18mm 16mm;display:flex;flex-direction:column;align-items:center;text-align:center;border-top:14mm solid var(--brand);}
.card.small{width:50%;min-height:148.5mm;padding:7mm 6mm;border-top-width:6mm;border-right:1px dashed #cfc9bf;border-bottom:1px dashed #cfc9bf;}
header{display:flex;flex-direction:column;align-items:center;gap:4mm;}
.logo{max-height:24mm;max-width:70mm;object-fit:contain;}
.small .logo{max-height:10mm;max-width:36mm;}
.mono{width:22mm;height:22mm;border-radius:6mm;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12mm;font-weight:700;}
.small .mono{width:10mm;height:10mm;border-radius:3mm;font-size:5.5mm;}
.name{font-size:9mm;font-weight:700;letter-spacing:-.02em;}
.small .name{font-size:4.6mm;}
.loc{font-size:5mm;color:#6b645b;font-weight:600;}
.small .loc{font-size:3.2mm;}
h1{font-size:16mm;line-height:1.05;margin:10mm 0 2mm;letter-spacing:-.03em;}
.small h1{font-size:7.5mm;margin:3mm 0 1mm;}
h2{font-family:"Noto Nastaliq Urdu",serif;font-size:9mm;font-weight:600;line-height:2;margin:0;color:#3a3640;}
.small h2{font-size:4.4mm;}
.qr{width:110mm;height:110mm;margin:8mm 0 6mm;padding:5mm;border:1.2mm solid var(--brand);border-radius:8mm;}
.small .qr{width:58mm;height:58mm;margin:3mm 0 2mm;padding:2.5mm;border-width:.7mm;border-radius:4mm;}
.qr svg{width:100%;height:100%;display:block;}
.how{font-size:5.4mm;margin:0 0 2mm;font-weight:600;}
.small .how{font-size:3mm;margin:0 0 1mm;}
.how.ur{font-family:"Noto Nastaliq Urdu",serif;font-size:4.6mm;line-height:2.1;font-weight:600;color:#3a3640;}
.small .how.ur{font-size:2.8mm;}
.url{font-family:ui-monospace,Menlo,monospace;font-size:4.4mm;color:#6b645b;margin:3mm 0 0;}
.small .url{font-size:2.6mm;margin-top:1mm;}
footer{margin-top:auto;padding-top:6mm;font-size:3.6mm;color:#8d857a;}
.small footer{font-size:2.2mm;padding-top:2mm;}
@page{size:A4;margin:0;}
@media print{html,body{background:#fff;}.bar{display:none;}.sheet{box-shadow:none;margin:0;}}
@media screen and (max-width:820px){body{overflow-x:auto;}.sheet{margin:0 12px 24px;}}
</style></head>
<body>
<div class="bar">
  <button onclick="window.print()">Print</button>
  <a href="?${loc ? `loc=${encodeURIComponent(loc.id)}&` : ''}layout=${cards ? 'poster' : 'cards'}">${cards ? 'One A4 poster instead' : 'Four table cards instead'}</a>
</div>
<div class="sheet">${cards ? card(true) + card(true) + card(true) + card(true) : card(false)}</div>
</body></html>`);
});

module.exports = router;
