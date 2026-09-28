/*
 * VantriqAI surveys — the studio behind the portal's Surveys tab and the
 * CRM's Surveys view. One set of screens, like analytics-view.js, so a
 * customer and the staff member looking after them see the same survey the
 * same way: the list, the results, every response, the question builder,
 * sharing, and settings.
 *
 * Plain script, no build step. Exposes one global, VQS. The host page mounts
 * it into an element and hands it an adapter — how to call the API with the
 * host's own credentials, how to download a file, and in the CRM the list of
 * clients — and it draws itself inside that element, keeping its own state
 * between the host's re-renders. It reads the host's CSS variables (--teal,
 * --muted, --border, …) so it wears whichever page it sits in.
 *
 * Every string that came from a user or a respondent is escaped before it
 * touches innerHTML. Validation is the server's; this only makes it pleasant.
 */
(function(){
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */
  var SCORE = ['#b4402f', '#d98676', '#bdb7ad', '#7f9bf2', '#2f56d9'];
  var NPS_C = { det: '#b4402f', pas: '#bdb7ad', pro: '#2f56d9' };
  var FACES = ['😠', '🙁', '😐', '🙂', '😍'];
  var GRAINS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']];
  var LANGS = { en: 'English', ur: 'اردو' };
  var PRESETS = ['#2f56d9', '#16151a', '#0f766e', '#15803d', '#b45309', '#c2410c', '#b91c1c', '#be185d', '#7c3aed', '#0369a1'];
  var QTYPES = {
    csat: { label: 'Satisfaction (CSAT)', icon: '😊', hint: 'Five faces or stars. Your headline satisfaction score.' },
    nps: { label: 'Likely to recommend (NPS)', icon: '📣', hint: '0 to 10. Gives your Net Promoter Score.' },
    ces: { label: 'Effort (CES)', icon: '🧭', hint: '1 to 7, from very difficult to very easy.' },
    rating: { label: 'Star rating', icon: '⭐', hint: 'One to five stars for a single thing.' },
    rating_grid: { label: 'Rate several things', icon: '▦', hint: 'Stars for each row — food, service, value…' },
    single: { label: 'One choice', icon: '◉', hint: 'Pick one option from a list.' },
    multi: { label: 'Several choices', icon: '☑', hint: 'Pick any number of options.' },
    yesno: { label: 'Yes or no', icon: '👍', hint: 'Two big buttons.' },
    text: { label: 'Written answer', icon: '✍️', hint: 'Anything they want to say.' },
    contact: { label: 'Contact details', icon: '📇', hint: 'Name, phone, email — with their consent.' },
  };
  var NEW_TITLES = {
    csat: ['Overall, how satisfied are you with {business}?', 'مجموعی طور پر آپ {business} سے کتنے مطمئن ہیں؟'],
    nps: ['How likely are you to recommend {business} to a friend or family member?', 'اس بات کا کتنا امکان ہے کہ آپ {business} کی سفارش کسی دوست یا رشتہ دار سے کریں گے؟'],
    ces: ['How easy was it to get what you needed?', 'آپ کے لیے اپنا کام کروانا کتنا آسان تھا؟'],
    rating: ['How would you rate us?', 'آپ ہمیں کیسی ریٹنگ دیں گے؟'],
    rating_grid: ['Please rate us on…', 'ان پہلوؤں پر ہمیں ریٹ کریں'],
    single: ['Which of these best describes your visit?', 'ان میں سے کون سا آپ کے دورے کو بہتر بیان کرتا ہے؟'],
    multi: ['What did you use today?', 'آج آپ نے کیا استعمال کیا؟'],
    yesno: ['Did we sort out what you needed?', 'کیا آپ کا کام ہو گیا؟'],
    text: ['Is there anything else you would like to tell us?', 'کیا آپ ہمیں کچھ اور بتانا چاہیں گے؟'],
    contact: ['Would you like us to get back to you?', 'کیا آپ چاہتے ہیں کہ ہم آپ سے رابطہ کریں؟'],
  };
  var RANGE = { csat: [1, 5], rating: [1, 5], nps: [0, 10], ces: [1, 7] };
  var OTHER = '__other';
  var STATUS = {
    live: ['Live', 'vqs-pill live'], draft: ['Draft', 'vqs-pill draft'], paused: ['Paused', 'vqs-pill paused'], closed: ['Closed', 'vqs-pill closed'],
  };
  var CHANNELS = { link: 'Survey link', qr: 'QR code', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', kiosk: 'Kiosk', embed: 'Website', web: 'Web' };
  var EDITABLE = ['title', 'status', 'languages', 'default_language', 'display_name', 'brand_color', 'logo_url', 'content',
    'questions', 'locations', 'review_url', 'alert_emails', 'closes_at', 'response_limit', 'slug'];

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var host = null, root = null, charts = [];
  var st = {
    loaded: false,
    view: 'home',            // home | new | survey
    tab: 'results',          // results | responses | questions | share | settings
    list: null, overview: null, templates: null, clientFilter: '',
    newTpl: null, newForm: {}, creating: false,
    survey: null, draft: null, saved: '', saving: false, justCreated: false,
    openQ: null, addingQ: false,
    grain: 'month', analytics: null,
    resp: null, rFilter: 'all', rLoc: '', rQ: '', rBusy: false, openResp: null,
    invites: null,
  };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v){ return v == null ? '—' : Math.round(v).toLocaleString('en-US'); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function tx(o, lang){ if (!o) return ''; if (typeof o === 'string') return o; return o[lang || 'en'] || o.en || o.ur || Object.keys(o).map(function(k){ return o[k]; })[0] || ''; }
  function biz(s){ return (s && (s.display_name || s.company)) || ''; }
  function fill(str, s){ return String(str || '').replace(/\{business\}/g, biz(s || st.survey)); }
  function ago(d){
    if (!d) return '—';
    var sec = (Date.now() - new Date(d).getTime()) / 1000;
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
    if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
    if (sec < 7 * 86400) return Math.floor(sec / 86400) + ' d ago';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function when(d){ return d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function sign(v){ return v == null ? '—' : (v > 0 ? '+' : '') + v; }
  function rid(p){ return p + '_' + Math.random().toString(36).slice(2, 8); }
  function toast(msg, warn){ if (host && host.toast) host.toast(msg, warn); }
  function isPortal(){ return host && host.audience === 'portal'; }
  function status(s){ var x = STATUS[s.closed && s.status === 'live' ? 'closed' : s.status] || STATUS.draft; return '<span class="' + x[1] + '">' + x[0] + '</span>'; }
  function npsColor(v){ return v <= 6 ? NPS_C.det : v <= 8 ? NPS_C.pas : NPS_C.pro; }
  function waLink(phone){
    var d = String(phone || '').replace(/\D/g, '');
    if (/^0\d{10}$/.test(d)) d = '92' + d.slice(1); // a Pakistani mobile written the local way
    return d.length >= 8 ? 'https://wa.me/' + d : '';
  }
  function copy(text, label){
    var done = function(){ toast((label || 'Copied') + ' ✓'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback(){
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy — select the text and copy it yourself.', true); }
      ta.remove();
    }
  }
  function api(method, path, body){ return host.api(method, path, body); }

  /* ------------------------------------------------------------------ */
  /* Loading                                                             */
  /* ------------------------------------------------------------------ */
  function loadHome(){
    var q = st.clientFilter ? '?client_id=' + encodeURIComponent(st.clientFilter) : '';
    return Promise.all([api('GET', q), api('GET', '/overview' + q)]).then(function(r){
      st.list = r[0]; st.overview = r[1];
      // Repaint only the list. A survey open in the builder must not be
      // redrawn under someone's cursor because a background refresh landed.
      if (st.view === 'home') render();
    }).catch(function(e){ st.list = { error: e.message || 'Could not load your surveys.' }; if (st.view === 'home') render(); });
  }
  function loadTemplates(){
    if (st.templates) return Promise.resolve(st.templates);
    return api('GET', '/templates').then(function(t){ st.templates = t; return t; });
  }
  function openSurvey(id, tab){
    st.view = 'survey'; st.tab = tab || 'results';
    st.survey = null; st.draft = null; st.analytics = null; st.resp = null; st.invites = null; st.openQ = null; st.openResp = null;
    st.rFilter = 'all'; st.rLoc = ''; st.rQ = '';
    render();
    return api('GET', '/' + id).then(function(s){
      setSurvey(s);
      render();
      if (st.tab === 'results') loadAnalytics();
      if (st.tab === 'responses') loadResponses(true);
    }).catch(function(e){ toast(e.message || 'Could not open that survey.', true); st.view = 'home'; render(); });
  }
  function setSurvey(s){
    st.survey = s;
    var d = {};
    EDITABLE.forEach(function(k){ d[k] = s[k] === undefined ? null : clone(s[k]); });
    d.closes_at = s.closes_at ? String(s.closes_at).slice(0, 10) : '';
    d.response_limit = s.response_limit == null ? '' : s.response_limit;
    st.draft = d;
    st.saved = JSON.stringify(d);
  }
  function dirty(){ return !!st.draft && JSON.stringify(st.draft) !== st.saved; }
  function loadAnalytics(){
    if (!st.survey) return;
    var id = st.survey.id;
    st.analytics = null; render();
    api('GET', '/' + id + '/analytics?grain=' + st.grain).then(function(a){
      if (!st.survey || st.survey.id !== id) return;
      st.analytics = a; render();
    }).catch(function(e){ st.analytics = { error: e.message || 'Could not load the results.' }; render(); });
  }
  function loadResponses(reset){
    if (!st.survey) return;
    var id = st.survey.id;
    var offset = reset || !st.resp ? 0 : st.resp.items.length;
    var qs = '?limit=25&offset=' + offset + '&filter=' + st.rFilter + (st.rLoc ? '&location=' + encodeURIComponent(st.rLoc) : '') + (st.rQ ? '&q=' + encodeURIComponent(st.rQ) : '');
    st.rBusy = true; if (reset) st.resp = null; render();
    api('GET', '/' + id + '/responses' + qs).then(function(r){
      if (!st.survey || st.survey.id !== id) return;
      st.rBusy = false;
      st.resp = reset || !st.resp ? r : { total: r.total, items: st.resp.items.concat(r.items) };
      render();
    }).catch(function(e){ st.rBusy = false; st.resp = { error: e.message || 'Could not load the responses.' }; render(); });
  }

  /* ------------------------------------------------------------------ */
  /* Styles                                                              */
  /* ------------------------------------------------------------------ */
  function injectStyles(){
    if (document.getElementById('vqs-styles')) return;
    var css = [
      '.vqs{display:block;color:var(--text,#16151a);}',
      '.vqs *{box-sizing:border-box;}',
      '.vqs h2{font-family:var(--f-head,inherit);font-size:20px;margin:0 0 4px;letter-spacing:-.02em;}',
      '.vqs h3{font-family:var(--f-head,inherit);font-size:14.5px;font-weight:700;margin:0 0 2px;}',
      '.vqs .sub{font-size:12.5px;color:var(--muted,#6b645b);margin:0 0 12px;line-height:1.5;}',
      '.vqs-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin:0 0 16px;flex-wrap:wrap;}',
      '.vqs-top p{margin:0;font-size:13px;color:var(--muted,#6b645b);max-width:560px;line-height:1.55;}',
      '.vqs-card{background:var(--card,#fff);border:1px solid var(--border,#e7e2da);border-radius:var(--radius,14px);padding:18px;box-shadow:var(--shadow-sm,none);min-width:0;}',
      '.vqs-card+.vqs-card{margin-top:14px;}',
      '.vqs-grid>.vqs-card,.vqs-grid>.vqs-card+.vqs-card{margin-top:0;}',
      '.vqs-grid{display:grid;gap:14px;}',
      '.vqs-g2{grid-template-columns:repeat(auto-fit,minmax(290px,1fr));}',
      '.vqs-g3{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));}',
      '.vqs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:0 0 14px;}',
      '.vqs-kpi{background:var(--card,#fff);border:1px solid var(--border,#e7e2da);border-radius:var(--radius,14px);padding:14px 16px;box-shadow:var(--shadow-sm,none);}',
      '.vqs-kpi .l{font-size:12px;color:var(--muted,#6b645b);font-weight:600;}',
      '.vqs-kpi .v{font-family:var(--f-head,inherit);font-size:26px;font-weight:700;letter-spacing:-.02em;margin:4px 0 2px;line-height:1.1;}',
      '.vqs-kpi .v small{font-size:13px;color:var(--muted,#6b645b);font-weight:600;margin-left:2px;}',
      '.vqs-kpi .f{font-size:11.5px;color:var(--muted,#6b645b);}',
      '.vqs-chip{display:inline-flex;align-items:center;gap:3px;font-weight:700;border-radius:6px;padding:1px 6px;font-size:11.5px;}',
      '.vqs-chip.good{color:#2f7d5f;background:#e4f2eb;}.vqs-chip.bad{color:#b4402f;background:#fbe8e4;}.vqs-chip.flat{color:var(--muted,#6b645b);background:var(--border-2,#f0ece5);}',
      '.vqs-btn{border:1px solid var(--border,#e7e2da);background:var(--card,#fff);font:inherit;font-size:13px;font-weight:600;color:var(--text,#16151a);padding:8px 14px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;white-space:nowrap;line-height:1.2;}',
      '.vqs-btn:hover{border-color:var(--teal,#2f56d9);color:var(--teal-dark,#1f3a95);}',
      '.vqs-btn.primary{background:var(--teal,#2f56d9);border-color:var(--teal,#2f56d9);color:#fff;}',
      '.vqs-btn.primary:hover{background:var(--teal-dark,#1f3a95);color:#fff;}',
      '.vqs-btn.danger{color:#b4402f;border-color:#f0c7bf;}.vqs-btn.danger:hover{background:#fbe8e4;color:#8f3527;}',
      '.vqs-btn.sm{padding:5px 10px;font-size:12px;}',
      '.vqs-btn:disabled{opacity:.5;cursor:not-allowed;}',
      '.vqs-link{background:none;border:0;padding:0;font:inherit;font-size:13px;color:var(--teal-dark,#1f3a95);font-weight:600;cursor:pointer;text-decoration:none;}',
      '.vqs-link:hover{text-decoration:underline;}',
      '.vqs-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:.02em;}',
      '.vqs-pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;}',
      '.vqs-pill.live{background:#e4f2eb;color:#2f7d5f;}.vqs-pill.draft{background:#f0ece5;color:#6b645b;}',
      '.vqs-pill.paused{background:#fbeee4;color:#94512b;}.vqs-pill.closed{background:#f0ece5;color:#8d857a;}',
      '.vqs-seg{display:inline-flex;background:var(--card,#fff);border:1px solid var(--border,#e7e2da);border-radius:999px;padding:3px;gap:2px;flex-wrap:wrap;}',
      '.vqs-seg button{border:0;background:transparent;font:inherit;font-size:12.5px;font-weight:600;color:var(--muted,#6b645b);padding:6px 12px;border-radius:999px;cursor:pointer;}',
      '.vqs-seg button:hover{background:var(--border-2,#f0ece5);color:var(--text,#16151a);}',
      '.vqs-seg button.on{background:var(--teal,#2f56d9);color:#fff;}',
      '.vqs-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border,#e7e2da);margin:14px 0 16px;overflow-x:auto;scrollbar-width:none;}',
      '.vqs-tabs::-webkit-scrollbar{display:none;}',
      '.vqs-tabs button{border:0;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--muted,#6b645b);padding:10px 12px;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;margin-bottom:-1px;}',
      '.vqs-tabs button.on{color:var(--text,#16151a);border-bottom-color:var(--teal,#2f56d9);}',
      '.vqs-tabs .ct{display:inline-block;min-width:18px;padding:0 6px;border-radius:99px;background:var(--border-2,#f0ece5);font-size:11px;margin-left:5px;}',
      '.vqs-empty{text-align:center;padding:30px 16px;color:var(--muted,#6b645b);font-size:13px;line-height:1.6;}',
      '.vqs-loading{text-align:center;padding:40px;color:var(--muted,#6b645b);font-size:13px;}',
      '.vqs-loading::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--teal,#2f56d9);margin-right:8px;animation:vqsP 1.2s infinite;vertical-align:1px;}',
      '@keyframes vqsP{0%,100%{opacity:.25}50%{opacity:1}}',
      /* survey cards */
      '.vqs-scard{display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .15s;}',
      '.vqs-scard:hover{border-color:var(--teal-300,#a9bbf7);box-shadow:var(--shadow-md,0 8px 24px rgba(0,0,0,.08));transform:translateY(-1px);}',
      '.vqs-scard .t{font-family:var(--f-head,inherit);font-weight:700;font-size:15px;line-height:1.3;}',
      '.vqs-scard .co{font-size:12px;color:var(--muted,#6b645b);}',
      '.vqs-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid var(--border-2,#f0ece5);padding-top:10px;}',
      '.vqs-stats div{font-size:11px;color:var(--muted,#6b645b);font-weight:600;}',
      '.vqs-stats b{display:block;font-family:var(--f-head,inherit);font-size:17px;color:var(--text,#16151a);margin-top:2px;}',
      '.vqs-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.vqs-spread{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}',
      '.vqs-swatch{width:14px;height:14px;border-radius:5px;display:inline-block;flex:0 0 14px;}',
      '.vqs-ic{font-size:20px;line-height:1;}',
      /* templates */
      '.vqs-tpl{cursor:pointer;display:flex;flex-direction:column;gap:6px;transition:border-color .15s, box-shadow .15s;}',
      '.vqs-tpl:hover{border-color:var(--teal-300,#a9bbf7);}',
      '.vqs-tpl.on{border-color:var(--teal,#2f56d9);box-shadow:0 0 0 3px var(--teal-light,#e8ecfd);}',
      '.vqs-tpl .nm{font-weight:700;font-size:14px;}',
      '.vqs-tpl .ds{font-size:12px;color:var(--muted,#6b645b);line-height:1.45;flex:1;}',
      '.vqs-tag{display:inline-block;font-size:10.5px;font-weight:700;color:var(--teal-dark,#1f3a95);background:var(--teal-light,#e8ecfd);border-radius:6px;padding:1px 6px;margin:0 4px 0 0;}',
      /* forms */
      '.vqs-f{display:block;margin:0 0 14px;}',
      '.vqs-f>span{display:block;font-size:12px;font-weight:700;color:var(--muted,#6b645b);margin:0 0 5px;}',
      '.vqs-f em{font-style:normal;font-weight:500;color:var(--muted-2,#8d857a);}',
      '.vqs input[type=text],.vqs input[type=email],.vqs input[type=url],.vqs input[type=number],.vqs input[type=date],.vqs input[type=search],.vqs select,.vqs textarea{width:100%;padding:9px 11px;border:1px solid var(--border,#e7e2da);border-radius:10px;font:inherit;font-size:13.5px;background:var(--card,#fff);color:inherit;}',
      '.vqs textarea{min-height:70px;resize:vertical;line-height:1.5;}',
      '.vqs input:focus,.vqs select:focus,.vqs textarea:focus{outline:none;border-color:var(--teal,#2f56d9);box-shadow:0 0 0 3px var(--teal-light,#e8ecfd);}',
      '.vqs [dir=rtl]{font-family:"Noto Nastaliq Urdu","Jameel Noori Nastaleeq","Noto Naskh Arabic",serif;line-height:2;}',
      '.vqs-two{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '@media (max-width:560px){.vqs-two{grid-template-columns:1fr;}}',
      '.vqs-check{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;margin:0 14px 6px 0;cursor:pointer;}',
      '.vqs-check input{width:16px;height:16px;accent-color:var(--teal,#2f56d9);}',
      '.vqs-colors{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}',
      '.vqs-colors button{width:26px;height:26px;border-radius:8px;border:2px solid #fff;box-shadow:0 0 0 1px var(--border,#e7e2da);cursor:pointer;}',
      '.vqs-colors button.on{box-shadow:0 0 0 2px var(--text,#16151a);}',
      '.vqs-colors input[type=color]{width:34px;height:30px;padding:0;border:1px solid var(--border,#e7e2da);border-radius:8px;background:none;}',
      '.vqs-savebar{position:sticky;bottom:12px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--ink,#16151a);color:#fff;border-radius:14px;padding:10px 12px 10px 16px;margin-top:16px;box-shadow:0 14px 34px rgba(0,0,0,.2);font-size:13px;flex-wrap:wrap;}',
      '.vqs-savebar .vqs-btn{border-color:rgba(255,255,255,.25);background:transparent;color:#fff;}',
      '.vqs-savebar .vqs-btn.primary{background:#fff;color:var(--ink,#16151a);border-color:#fff;}',
      '.vqs-banner{border-radius:14px;padding:14px 16px;font-size:13.5px;line-height:1.55;margin:0 0 14px;}',
      '.vqs-banner.ok{background:#e4f2eb;color:#1f5c45;}.vqs-banner.warn{background:#fbeee4;color:#7a4b21;}.vqs-banner.info{background:var(--teal-light,#e8ecfd);color:var(--teal-dark,#1f3a95);}',
      /* results */
      '.vqs-bars{display:grid;gap:8px;}',
      '.vqs-bar{display:grid;grid-template-columns:minmax(80px,40%) 1fr auto;gap:10px;align-items:center;font-size:12.5px;}',
      '.vqs-bar .nm{font-weight:600;overflow:hidden;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;}',
      '.vqs-bar .tr{height:10px;background:var(--border-2,#f0ece5);border-radius:0 4px 4px 0;overflow:hidden;}',
      '.vqs-bar .fl{height:100%;border-radius:0 4px 4px 0;min-width:2px;}',
      '.vqs-bar .vl{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;}',
      '.vqs-bar .vl span{color:var(--muted,#6b645b);font-weight:500;margin-left:4px;}',
      '.vqs-stack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--border-2,#f0ece5);margin:8px 0;}',
      '.vqs-stack div{height:100%;}',
      '.vqs-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--muted,#6b645b);}',
      '.vqs-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;vertical-align:-1px;}',
      '.vqs-big{font-family:var(--f-head,inherit);font-size:30px;font-weight:700;letter-spacing:-.02em;}',
      '.vqs-insights{list-style:none;margin:0;padding:0;display:grid;gap:8px;}',
      '.vqs-insights li{display:flex;gap:10px;font-size:13px;line-height:1.45;}',
      '.vqs-insights .ic{flex:0 0 20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}',
      '.vqs-insights .up{background:#e4f2eb;color:#2f7d5f;}.vqs-insights .down{background:#fbe8e4;color:#b4402f;}',
      '.vqs-insights .warn{background:#fbeee4;color:#94512b;}.vqs-insights .info{background:#e8ecfd;color:#1f3a95;}',
      '.vqs-plot{position:relative;height:200px;}',
      '.vqs-themes{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;}',
      '.vqs-themes span{font-size:12px;font-weight:600;border-radius:99px;padding:3px 10px;background:var(--border-2,#f0ece5);}',
      '.vqs-themes span b{font-weight:700;color:var(--muted,#6b645b);margin-left:4px;}',
      '.vqs-quote{border-left:3px solid var(--border,#e7e2da);padding:4px 0 4px 10px;margin:8px 0;font-size:13px;line-height:1.5;}',
      '.vqs-quote .m{font-size:11.5px;color:var(--muted,#6b645b);margin-top:2px;}',
      '.vqs-table{width:100%;border-collapse:collapse;font-size:12.5px;}',
      '.vqs-table th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#6b645b);padding:8px;border-bottom:1px solid var(--border,#e7e2da);}',
      '.vqs-table td{padding:9px 8px;border-bottom:1px solid var(--border-2,#f0ece5);}',
      '.vqs-table td.n,.vqs-table th.n{text-align:right;font-variant-numeric:tabular-nums;}',
      /* responses */
      '.vqs-resp{padding:14px 16px;}',
      '.vqs-resp .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--muted,#6b645b);}',
      '.vqs-score{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;border-radius:8px;padding:3px 8px;color:#fff;}',
      '.vqs-resp .cm{font-size:14px;line-height:1.55;margin:10px 0 4px;white-space:pre-wrap;word-break:break-word;}',
      '.vqs-resp .ct{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;margin-top:8px;align-items:center;}',
      '.vqs-kv{display:grid;grid-template-columns:minmax(120px,40%) 1fr;gap:6px 12px;font-size:12.5px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border,#e7e2da);}',
      '.vqs-kv div:nth-child(odd){color:var(--muted,#6b645b);}',
      '.vqs-fu{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border-2,#f0ece5);font-size:12px;}',
      '.vqs-fu textarea{min-height:38px;flex:1 1 220px;font-size:12.5px;}',
      /* builder */
      '.vqs-build{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start;}',
      '@media (max-width:1180px){.vqs-build{grid-template-columns:minmax(0,1fr);}.vqs-phone-wrap{display:none;}}',
      '.vqs-q{padding:0;overflow:hidden;}',
      '.vqs-q .qh{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;}',
      '.vqs-q .qh:hover{background:var(--border-2,#f0ece5);}',
      '.vqs-q .num{font-size:11px;font-weight:700;color:var(--muted,#6b645b);min-width:18px;}',
      '.vqs-q .qt{flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.vqs-q .ty{font-size:11px;color:var(--muted,#6b645b);white-space:nowrap;}',
      '.vqs-q .qb{padding:14px;border-top:1px solid var(--border,#e7e2da);background:var(--paper,#fbf9f6);}',
      '.vqs-q.on{border-color:var(--teal,#2f56d9);}',
      '.vqs-mini{border:0;background:none;cursor:pointer;color:var(--muted,#6b645b);font-size:14px;padding:4px 6px;border-radius:6px;line-height:1;}',
      '.vqs-mini:hover{background:var(--card,#fff);color:var(--text,#16151a);}',
      '.vqs-mini:disabled{opacity:.3;cursor:default;}',
      '.vqs-item{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px;}',
      '.vqs-item.one{grid-template-columns:1fr auto;}',
      '.vqs-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;}',
      '.vqs-types button{display:flex;gap:10px;align-items:flex-start;text-align:left;border:1px solid var(--border,#e7e2da);background:var(--card,#fff);border-radius:12px;padding:10px 12px;cursor:pointer;font:inherit;}',
      '.vqs-types button:hover{border-color:var(--teal,#2f56d9);}',
      '.vqs-types b{display:block;font-size:13px;}',
      '.vqs-types span{font-size:11.5px;color:var(--muted,#6b645b);line-height:1.35;}',
      '.vqs-logic{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px;}',
      '.vqs-logic select{width:auto;min-width:120px;flex:1 1 140px;}',
      '.vqs-phone-wrap{position:sticky;top:14px;}',
      '.vqs-phone{width:100%;max-width:340px;height:640px;border-radius:38px;border:10px solid #16151a;background:#16151a;overflow:hidden;box-shadow:0 30px 60px -30px rgba(22,21,26,.5);margin:0 auto;}',
      '.vqs-phone iframe{width:100%;height:100%;border:0;border-radius:28px;background:#fff;}',
      '.vqs-phone-cap{text-align:center;font-size:11.5px;color:var(--muted,#6b645b);margin-top:8px;}',
      /* share */
      '.vqs-url{display:flex;gap:8px;align-items:center;background:var(--border-2,#f0ece5);border-radius:12px;padding:8px 8px 8px 12px;}',
      '.vqs-url code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--f-mono,monospace);font-size:12.5px;}',
      '.vqs-qr{display:flex;gap:18px;align-items:center;flex-wrap:wrap;}',
      '.vqs-qr img{width:168px;height:168px;border-radius:14px;border:1px solid var(--border,#e7e2da);background:#fff;padding:8px;}',
      '.vqs-code{font-family:var(--f-mono,monospace);font-size:11.5px;background:var(--border-2,#f0ece5);border-radius:10px;padding:10px 12px;white-space:pre-wrap;word-break:break-all;margin:8px 0;}',
      '.vqs-hero{display:grid;grid-template-columns:1.1fr 1fr;gap:18px;align-items:center;}',
      '@media (max-width:720px){.vqs-hero{grid-template-columns:1fr;}}',
      '.vqs-hero ul{margin:10px 0 0;padding:0 0 0 18px;font-size:13px;line-height:1.8;}',
      '.vqs-danger{border-color:#f0c7bf;}',
    ].join('\n');
    var el = document.createElement('style');
    el.id = 'vqs-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ------------------------------------------------------------------ */
  /* Small building blocks                                               */
  /* ------------------------------------------------------------------ */
  function loading(msg){ return '<div class="vqs-card"><div class="vqs-loading">' + esc(msg || 'Loading…') + '</div></div>'; }
  function errorCard(msg, act){ return '<div class="vqs-card"><div class="vqs-empty">' + esc(msg) + '<br><br><button class="vqs-btn" data-a="' + act + '">Try again</button></div></div>'; }
  function chip(delta, unit, goodWhenUp){
    if (delta == null) return '<span class="vqs-chip flat">new</span>';
    if (delta === 0) return '<span class="vqs-chip flat">no change</span>';
    var up = delta > 0, good = up === (goodWhenUp !== false);
    return '<span class="vqs-chip ' + (good ? 'good' : 'bad') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(delta) + (unit || '%') + '</span>';
  }
  function kpi(label, value, unit, foot, deltaHtml){
    return '<div class="vqs-kpi"><div class="l">' + esc(label) + '</div><div class="v">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>'
      + '<div class="f">' + (deltaHtml ? deltaHtml + ' ' : '') + (foot || '') + '</div></div>';
  }
  function bars(rows, opts){
    opts = opts || {};
    if (!rows.length) return '<div class="vqs-empty">Nothing yet.</div>';
    var max = Math.max.apply(null, rows.map(function(r){ return r.value; }).concat([1]));
    return '<div class="vqs-bars">' + rows.map(function(r, i){
      var color = r.color || (opts.colors ? opts.colors[i] : 'var(--teal,#2f56d9)');
      return '<div class="vqs-bar" title="' + esc(r.name) + ': ' + esc(r.label || r.value) + '"><div class="nm">' + esc(r.name) + '</div>'
        + '<div class="tr"><div class="fl" style="width:' + (r.value / max * 100) + '%;background:' + color + '"></div></div>'
        + '<div class="vl">' + esc(r.label != null ? r.label : n(r.value)) + (r.share != null ? '<span>' + r.share + '%</span>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function scoreChips(r){
    var out = '';
    if (r.score != null) out += '<span class="vqs-score" style="background:' + SCORE[r.score - 1] + '">' + FACES[r.score - 1] + ' ' + r.score + '/5</span>';
    if (r.nps != null) out += '<span class="vqs-score" style="background:' + npsColor(r.nps) + '">NPS ' + r.nps + '</span>';
    if (r.ces != null) out += '<span class="vqs-score" style="background:#6b645b">Effort ' + r.ces + '/7</span>';
    if (r.resolved != null) out += '<span class="vqs-score" style="background:' + (r.resolved ? '#2f7d5f' : '#b4402f') + '">' + (r.resolved ? '✓ Resolved' : '✗ Not resolved') + '</span>';
    return out;
  }
  function contactLine(c){
    if (!c) return '';
    var bits = [];
    if (c.name) bits.push('<b>' + esc(c.name) + '</b>');
    var wa = waLink(c.phone);
    if (c.phone) bits.push((wa ? '<a class="vqs-link" href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp ' + esc(c.phone) + '</a>' : esc(c.phone)));
    if (c.email) bits.push('<a class="vqs-link" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>');
    return '<div class="ct">📇 ' + bits.join(' · ') + (c.consent ? ' <span class="vqs-tag">Asked to be contacted</span>' : '') + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Home: every survey, the 30-day picture, the follow-up queue         */
  /* ------------------------------------------------------------------ */
  function viewHome(){
    var listed = st.list && st.list.surveys ? st.list.surveys : [];
    var clients = (!isPortal() && host.clients ? host.clients() : []).filter(function(c){
      return c.surveys_enabled !== false || listed.some(function(s){ return s.client_id === c.id; });
    });
    var head = '<div class="vqs-top"><div><h2>Customer-satisfaction surveys</h2>'
      + '<p>Ask customers how you did — by QR code on the table, a link on WhatsApp, a tablet at the counter or your website — and see every answer here the moment it arrives. Unhappy answers raise a follow-up so nobody slips through.</p></div>'
      + '<div class="vqs-row">'
      + (clients.length ? '<select data-a-change="client-filter" style="width:auto;min-width:180px;"><option value="">All clients</option>' + clients.map(function(c){ return '<option value="' + esc(c.id) + '"' + (st.clientFilter === c.id ? ' selected' : '') + '>' + esc(c.company) + '</option>'; }).join('') + '</select>' : '')
      + '<button class="vqs-btn primary" data-a="new">＋ New survey</button></div></div>';
    if (!st.list) return head + loading('Loading surveys…');
    if (st.list.error) return head + errorCard(st.list.error, 'reload-home');
    var surveys = st.list.surveys || [];
    if (!surveys.length) return head + emptyHome();
    var o = st.overview || {};
    var trend = o.responses_prev_30d ? Math.round(((o.responses_30d - o.responses_prev_30d) / o.responses_prev_30d) * 100) : null;
    return head
      + '<div class="vqs-kpis">'
      + kpi('Responses, last 30 days', n(o.responses_30d), '', 'vs the 30 days before', o.responses_prev_30d ? chip(trend, '%') : '')
      + kpi('Satisfied (4–5 of 5)', o.csat_30d == null ? '—' : o.csat_30d, o.csat_30d == null ? '' : '%', o.csat_responses_30d ? n(o.csat_responses_30d) + ' answers' : 'No answers yet')
      + kpi('Net Promoter Score', sign(o.nps_30d), '', o.nps_responses_30d ? n(o.nps_responses_30d) + ' answers' : 'No answers yet')
      + kpi('Waiting for follow-up', n((o.followups || {}).open), '', ((o.followups || {}).contacted ? n(o.followups.contacted) + ' contacted, not yet resolved' : 'Unhappy customers nobody has contacted'))
      + kpi('Live surveys', n(o.live), '', n(o.surveys) + ' in total')
      + '</div>'
      + (o.followup_queue && o.followup_queue.length ? followupQueue(o.followup_queue) : '')
      + '<div class="vqs-grid vqs-g3" style="margin-top:14px;">' + surveys.map(surveyCard).join('') + '</div>';
  }

  function surveyCard(s){
    return '<div class="vqs-card vqs-scard" data-a="open" data-id="' + esc(s.id) + '" role="button" tabindex="0">'
      + '<div class="vqs-spread">' + status(s) + '<span class="vqs-row"><span class="vqs-swatch" style="background:' + esc(s.brand_color) + '"></span>'
      + (s.client_surveys_enabled === false && !isPortal() ? '<span class="vqs-tag" title="Vantriq Echo is switched off for this client, so it is paused for respondents">Echo off</span>' : '')
      + (s.open_followups ? '<span class="vqs-tag" style="background:#fbe8e4;color:#8f3527;">' + s.open_followups + ' to follow up</span>' : '') + '</span></div>'
      + '<div><div class="t">' + esc(s.title) + '</div>'
      + '<div class="co">' + (isPortal() ? esc(s.display_name) : esc(s.company)) + ' · ' + s.question_count + ' questions' + (s.location_count ? ' · ' + s.location_count + ' locations' : '') + '</div></div>'
      + '<div class="vqs-stats"><div>Responses<b>' + n(s.responses_30d) + '</b></div><div>Satisfied<b>' + (s.csat_30d == null ? '—' : s.csat_30d + '%') + '</b></div><div>NPS<b>' + sign(s.nps_30d) + '</b></div></div>'
      + '<div class="vqs-spread" style="font-size:11.5px;color:var(--muted,#6b645b);"><span>Last 30 days · ' + n(s.responses) + ' all time</span><span>' + (s.last_response_at ? 'Last answer ' + ago(s.last_response_at) : 'No answers yet') + '</span></div>'
      + '</div>';
  }

  function followupQueue(list){
    return '<div class="vqs-card"><div class="vqs-spread"><div><h3>Unhappy customers waiting for a reply</h3>'
      + '<div class="sub">Every low score opens a follow-up. Get in touch, then mark it contacted and resolved — the loop closes here.</div></div></div>'
      + list.slice(0, 6).map(function(r){
        var c = (r.contact_name || r.contact_phone || r.contact_email) ? { name: r.contact_name, phone: r.contact_phone, email: r.contact_email, consent: r.contact_consent } : null;
        return '<div class="vqs-resp" style="border-top:1px solid var(--border-2,#f0ece5);padding:12px 0;">'
          + '<div class="hd">' + scoreChips(r) + '<span>' + esc(ago(r.submitted_at)) + '</span>' + (r.location_name ? '<span>· ' + esc(r.location_name) + '</span>' : '')
          + '<span>· <button class="vqs-link" data-a="open" data-id="' + esc(r.survey_id) + '" data-tab="responses">' + esc(r.survey_title) + '</button>' + (!isPortal() ? ' (' + esc(r.company) + ')' : '') + '</span>'
          + '<span class="vqs-pill ' + (r.followup_status === 'open' ? 'paused' : 'draft') + '" style="margin-left:auto;">' + (r.followup_status === 'open' ? 'Open' : 'Contacted') + '</span></div>'
          + (r.comment ? '<div class="cm" style="margin:6px 0 0;">“' + esc(r.comment) + '”</div>' : '')
          + contactLine(c)
          + '<div class="vqs-row" style="margin-top:8px;">'
          + (r.followup_status === 'open' ? '<button class="vqs-btn sm" data-a="fu-quick" data-sid="' + esc(r.survey_id) + '" data-rid="' + esc(r.id) + '" data-st="contacted">Mark contacted</button>' : '')
          + '<button class="vqs-btn sm" data-a="fu-quick" data-sid="' + esc(r.survey_id) + '" data-rid="' + esc(r.id) + '" data-st="resolved">✓ Resolved</button></div>'
          + '</div>';
      }).join('')
      + (list.length > 6 ? '<div class="sub" style="margin:8px 0 0;">' + (list.length - 6) + ' more in each survey’s Responses tab, under “Needs follow-up”.</div>' : '')
      + '</div>';
  }

  function emptyHome(){
    var t = st.templates;
    if (!t) loadTemplates().then(render).catch(function(){});
    var picks = t ? ['restaurant', 'fmcg_consumer', 'telecom', 'healthcare', 'retail', 'support_chat'].map(function(k){ return t.find(function(x){ return x.key === k; }); }).filter(Boolean) : [];
    return '<div class="vqs-card"><div class="vqs-hero"><div>'
      + '<h2>Start hearing from every customer</h2>'
      + '<p class="sub" style="font-size:13.5px;">Pick your industry and a ready-made survey is live in a minute — in English and Urdu, in your colours, with a QR code to print.</p>'
      + '<ul><li><b>Link, QR code, WhatsApp, kiosk or website</b> — one survey, every channel</li>'
      + '<li><b>CSAT, NPS and effort</b> scores, with trends and plain-English findings</li>'
      + '<li><b>Unhappy answers raise a follow-up</b> and can email you the moment they arrive</li>'
      + '<li><b>Happy customers</b> are invited to leave a Google review</li></ul>'
      + '<div style="margin-top:16px;"><button class="vqs-btn primary" data-a="new">＋ Create your first survey</button></div></div>'
      + '<div class="vqs-grid vqs-g2" style="grid-template-columns:1fr 1fr;">' + picks.map(function(p){
        return '<div class="vqs-card vqs-tpl" data-a="new" data-tpl="' + esc(p.key) + '"><div class="vqs-ic">' + esc(p.icon) + '</div><div class="nm">' + esc(p.name) + '</div></div>';
      }).join('') + '</div></div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* New survey: the template gallery and the few things worth asking    */
  /* ------------------------------------------------------------------ */
  function viewNew(){
    var t = st.templates;
    if (!t) { loadTemplates().then(render).catch(function(e){ toast(e.message, true); }); return back() + loading('Loading templates…'); }
    var f = st.newForm;
    var tpl = st.newTpl ? t.find(function(x){ return x.key === st.newTpl; }) : null;
    var all = !isPortal() && host.clients ? host.clients() : [];
    var clients = all.filter(function(c){ return c.surveys_enabled !== false; });
    var hint = host.enableHint ? host.enableHint() : '';
    var noneOn = !isPortal() && all.length && !clients.length;
    return back()
      + (noneOn ? '<div class="vqs-banner warn"><b>No client has Vantriq Echo switched on yet.</b> ' + esc(hint) + '</div>' : '')
      + '<div class="vqs-top"><div><h2>New survey</h2><p>Choose the template closest to your business. Every question can be reworded, reordered or removed afterwards.</p></div></div>'
      + '<div class="vqs-grid vqs-g3">' + t.map(function(x){
        return '<div class="vqs-card vqs-tpl' + (x.key === st.newTpl ? ' on' : '') + '" data-a="pick-tpl" data-tpl="' + esc(x.key) + '" role="button" tabindex="0">'
          + '<div class="vqs-spread"><span class="vqs-ic">' + esc(x.icon) + '</span><span style="font-size:11px;color:var(--muted,#6b645b);">' + x.question_count + ' questions</span></div>'
          + '<div class="nm">' + esc(x.name) + '</div><div class="ds">' + esc(x.description) + '</div>'
          + '<div>' + x.measures.map(function(m){ return '<span class="vqs-tag">' + esc(m) + '</span>'; }).join('') + '</div></div>';
      }).join('') + '</div>'
      + (tpl ? '<div class="vqs-card" id="vqs-setup" style="margin-top:16px;">'
        + '<h3>' + esc(tpl.icon + ' ' + tpl.name) + '</h3>'
        + '<div class="sub">The questions: ' + tpl.preview.map(esc).join(' · ') + '</div>'
        + (tpl.setup_hint ? '<div class="vqs-banner warn">' + esc(tpl.setup_hint) + '</div>' : '')
        + (clients.length ? '<label class="vqs-f"><span>Client <em>— clients with Vantriq Echo switched on</em></span><select data-nf="client_id"><option value="">Choose a client…</option>'
          + clients.map(function(c){ return '<option value="' + esc(c.id) + '"' + (f.client_id === c.id ? ' selected' : '') + '>' + esc(c.company) + '</option>'; }).join('') + '</select></label>'
          + (all.length > clients.length && hint ? '<div class="sub" style="margin:-4px 0 10px;">Not listed? ' + esc(hint) + '</div>' : '') : '')
        + '<div class="vqs-two">'
        + '<label class="vqs-f"><span>Survey name <em>— only you see this</em></span><input type="text" data-nf="title" maxlength="160" value="' + esc(f.title || tpl.name + ' survey') + '"></label>'
        + '<label class="vqs-f"><span>Business name customers see</span><input type="text" data-nf="display_name" maxlength="120" placeholder="' + esc(defaultBusinessName()) + '" value="' + esc(f.display_name || '') + '"></label>'
        + '</div>'
        + '<div class="vqs-f"><span>Languages</span>'
        + ['en', 'ur'].map(function(l){ return '<label class="vqs-check"><input type="checkbox" data-nf-lang="' + l + '"' + ((f.languages || ['en', 'ur']).indexOf(l) >= 0 ? ' checked' : '') + '>' + LANGS[l] + '</label>'; }).join('')
        + '<div class="sub" style="margin:2px 0 0;">With both on, customers switch with one tap. Urdu reads right to left.</div></div>'
        + '<div class="vqs-f"><span>Brand colour</span>' + colorPicker(f.brand_color || '#2f56d9', 'nf') + '</div>'
        + '<label class="vqs-f"><span>Branches or locations <em>— optional, one per line; each gets its own QR code</em></span><textarea data-nf="locations" rows="3" placeholder="Gulberg&#10;DHA Phase 5">' + esc(f.locations || '') + '</textarea></label>'
        + '<div class="vqs-two">'
        + '<label class="vqs-f"><span>Google review link <em>— optional; shown to delighted customers</em></span><input type="url" data-nf="review_url" placeholder="https://g.page/r/…/review" value="' + esc(f.review_url || '') + '"></label>'
        + '<label class="vqs-f"><span>Email unhappy answers to <em>— optional</em></span><input type="text" data-nf="alert_emails" placeholder="' + esc(defaultAlertEmail() || 'manager@yourbusiness.com') + '" value="' + esc(f.alert_emails != null ? f.alert_emails : '') + '"></label>'
        + '</div>'
        + '<div class="vqs-row" style="margin-top:6px;"><button class="vqs-btn primary" data-a="create" data-status="live"' + (st.creating || noneOn ? ' disabled' : '') + '>' + (st.creating ? 'Creating…' : 'Create and go live') + '</button>'
        + '<button class="vqs-btn" data-a="create" data-status="draft"' + (st.creating || noneOn ? ' disabled' : '') + '>Save as a draft</button></div>'
        + '</div>' : '');
  }
  function defaultBusinessName(){
    if (isPortal()) return (host.company && host.company()) || '';
    var c = (host.clients ? host.clients() : []).find(function(x){ return x.id === st.newForm.client_id; });
    return c ? c.company : 'Your business name';
  }
  function defaultAlertEmail(){
    if (isPortal()) return (host.email && host.email()) || '';
    var c = (host.clients ? host.clients() : []).find(function(x){ return x.id === st.newForm.client_id; });
    return c ? (c.email || '') : '';
  }
  function colorPicker(value, scope){
    return '<div class="vqs-colors">' + PRESETS.map(function(c){
      return '<button type="button" style="background:' + c + '" class="' + (c === String(value).toLowerCase() ? 'on' : '') + '" data-a="color" data-scope="' + scope + '" data-color="' + c + '" aria-label="' + c + '"></button>';
    }).join('') + '<input type="color" data-color-input="' + scope + '" value="' + esc(value) + '" aria-label="Any colour"></div>';
  }
  function back(){ return '<div style="margin:0 0 10px;"><button class="vqs-link" data-a="home">← All surveys</button></div>'; }

  function createSurvey(statusVal){
    var f = st.newForm;
    if (!isPortal() && !f.client_id) { toast('Choose which client this survey is for.', true); return; }
    var langs = f.languages || ['en', 'ur'];
    if (!langs.length) { toast('Keep at least one language.', true); return; }
    var body = {
      template: st.newTpl,
      title: f.title || undefined,
      display_name: f.display_name || undefined,
      languages: langs,
      default_language: langs[0],
      brand_color: f.brand_color || '#2f56d9',
      locations: String(f.locations || '').split('\n').map(function(s){ return s.trim(); }).filter(Boolean),
      review_url: f.review_url || '',
      status: statusVal,
    };
    if (!isPortal()) body.client_id = f.client_id;
    if (f.alert_emails != null && f.alert_emails !== '') body.alert_emails = f.alert_emails;
    st.creating = true; render();
    api('POST', '', body).then(function(s){
      st.creating = false; st.newForm = {}; st.newTpl = null; st.list = null;
      st.view = 'survey'; st.tab = 'share'; st.justCreated = true;
      setSurvey(s); render();
      loadHome();
    }).catch(function(e){ st.creating = false; render(); toast(e.message || 'Could not create the survey.', true); });
  }

  /* ------------------------------------------------------------------ */
  /* One survey                                                          */
  /* ------------------------------------------------------------------ */
  function viewSurvey(){
    var s = st.survey;
    if (!s) return back() + loading('Opening the survey…');
    var fu = st.overview && st.overview.followup_queue ? st.overview.followup_queue.filter(function(r){ return r.survey_id === s.id && r.followup_status === 'open'; }).length : 0;
    var tabs = [['results', 'Results'], ['responses', 'Responses'], ['questions', 'Questions'], ['share', 'Share'], ['settings', 'Settings']];
    return back()
      + '<div class="vqs-top"><div>'
      + '<div class="vqs-row">' + status(s) + '<span style="font-size:12px;color:var(--muted,#6b645b);">' + esc(s.template ? s.template.icon + ' ' + s.template.name : '') + (!isPortal() ? ' · ' + esc(s.company) : '') + '</span></div>'
      + '<h2 style="margin-top:6px;">' + esc(s.title) + '</h2>'
      + '<p>' + esc(biz(s)) + ' · ' + s.questions.length + ' questions · about ' + s.estimated_minutes + ' min · ' + s.languages.map(function(l){ return LANGS[l]; }).join(' + ') + '</p></div>'
      + '<div class="vqs-row">'
      + '<button class="vqs-btn" data-a="copy" data-text="' + esc(s.links.url) + '">Copy link</button>'
      + '<a class="vqs-btn" href="' + esc(s.status === 'live' ? s.links.url : s.links.preview) + '" target="_blank" rel="noopener">Open survey ↗</a>'
      + '</div></div>'
      + (s.client_surveys_enabled === false && !isPortal()
        ? '<div class="vqs-banner warn"><b>Vantriq Echo is switched off for ' + esc(s.company) + ',</b> so this survey is paused for respondents and no new links can be made. '
          + 'Its answers are kept. ' + esc(host.enableHint ? host.enableHint() : '') + '</div>' : '')
      + '<div class="vqs-tabs" role="tablist">' + tabs.map(function(t){
        return '<button role="tab" aria-selected="' + (st.tab === t[0]) + '" class="' + (st.tab === t[0] ? 'on' : '') + '" data-a="tab" data-tab="' + t[0] + '">' + t[1]
          + (t[0] === 'responses' && fu ? '<span class="ct" style="background:#fbe8e4;color:#8f3527;">' + fu + '</span>' : '') + '</button>';
      }).join('') + '</div>'
      + (st.tab === 'results' ? tabResults() : st.tab === 'responses' ? tabResponses() : st.tab === 'questions' ? tabQuestions() : st.tab === 'share' ? tabShare() : tabSettings())
      + (dirty() && (st.tab === 'questions' || st.tab === 'settings') ? saveBar() : '');
  }

  function saveBar(){
    return '<div class="vqs-savebar" id="vqs-savebar"><span>You have unsaved changes.</span><span class="vqs-row">'
      + '<button class="vqs-btn" data-a="discard">Discard</button><button class="vqs-btn primary" data-a="save"' + (st.saving ? ' disabled' : '') + '>' + (st.saving ? 'Saving…' : 'Save changes') + '</button></span></div>';
  }

  /* ---------------------------- Results ---------------------------- */
  function tabResults(){
    var a = st.analytics;
    var filters = '<div class="vqs-spread" style="margin:0 0 14px;"><div class="vqs-seg" role="group" aria-label="Period">'
      + GRAINS.map(function(g){ return '<button class="' + (g[0] === st.grain ? 'on' : '') + '" data-a="grain" data-grain="' + g[0] + '">' + g[1] + '</button>'; }).join('')
      + '</div>' + (a && !a.error ? '<span style="font-size:12px;color:var(--muted,#6b645b);">' + esc(a.period.current_label) + ' so far (' + a.period.elapsed_pct + '% through) vs ' + esc(a.period.previous_label) + ' to the same point</span>' : '')
      + '<button class="vqs-btn sm" data-a="export">⬇ Excel</button></div>';
    if (!a) return filters + loading('Working out the results…');
    if (a.error) return filters + errorCard(a.error, 'reload-analytics');
    if (!a.window.responses) {
      return filters + '<div class="vqs-card"><div class="vqs-empty"><div style="font-size:30px;">📭</div><b>No answers in the ' + esc(a.period.window_label.toLowerCase()) + ' yet.</b><br>'
        + 'Share the survey — the results appear here the moment the first customer answers.<br><br><button class="vqs-btn primary" data-a="tab" data-tab="share">Share the survey</button></div></div>';
    }
    var k = a.kpis, w = a.window;
    var tiles = [
      kpi('Responses', n(k.responses.current), '', 'this ' + a.grain, chip(k.responses.delta_pct, '%')),
      kpi('Satisfied (4–5 of 5)', k.csat.current == null ? '—' : k.csat.current, k.csat.current == null ? '' : '%', k.csat.average != null ? 'avg ' + k.csat.average + ' / 5' : 'no answers this ' + a.grain, k.csat.current == null ? '' : chip(k.csat.delta_pts, ' pts')),
      kpi('Net Promoter Score', sign(k.nps.current), '', k.nps.responses ? n(k.nps.responses) + ' answers' : 'no answers this ' + a.grain, k.nps.current == null ? '' : chip(k.nps.delta_pts, ' pts')),
    ];
    if (w.ces_average != null) tiles.push(kpi('Customer effort', k.ces.average == null ? '—' : k.ces.average, k.ces.average == null ? '' : ' / 7', 'higher is easier'));
    if (w.resolution != null) tiles.push(kpi('Resolved', k.resolution.current == null ? '—' : k.resolution.current, k.resolution.current == null ? '' : '%', k.resolution.responses ? n(k.resolution.responses) + ' answers' : '', k.resolution.current == null ? '' : chip(k.resolution.delta_pts, ' pts')));
    // Only when opens outnumber answers: a kiosk, or answers posted by an
    // integration, arrive without a page open each, and "100% of 1" would mislead.
    if (w.views && w.views >= w.responses) tiles.push(kpi('Completed', w.completion_rate == null ? '—' : w.completion_rate, w.completion_rate == null ? '' : '%', 'of ' + n(w.views) + ' who opened it'));
    if (a.invites.sent) tiles.push(kpi('Invites answered', a.invites.response_rate == null ? '—' : a.invites.response_rate, '%', n(a.invites.answered) + ' of ' + n(a.invites.sent) + ' sent'));
    var npsTotal = w.promoters + w.passives + w.detractors;
    var seg = function(v){ return npsTotal ? (v / npsTotal * 100) : 0; };
    return filters
      + '<div class="vqs-kpis">' + tiles.join('') + '</div>'
      + (a.insights.length ? '<div class="vqs-card" style="margin-bottom:14px;"><h3>What stands out</h3><div class="sub">Worked out from the answers below — nothing here is guessed.</div><ul class="vqs-insights">'
        + a.insights.map(function(i){ return '<li><span class="ic ' + esc(i.tone) + '">' + ({ up: '▲', down: '▼', warn: '!', info: '•' }[i.tone] || '•') + '</span><span>' + esc(i.text) + '</span></li>'; }).join('') + '</ul></div>' : '')
      + '<div class="vqs-grid vqs-g2">'
      + '<div class="vqs-card"><h3>Responses</h3><div class="sub">' + esc(a.period.window_label) + '</div><div class="vqs-plot"><canvas id="vqsResp" aria-label="Responses over time"></canvas></div></div>'
      + '<div class="vqs-card"><h3>Satisfaction</h3><div class="sub">Share answering 4 or 5 · ' + esc(a.period.window_label) + '</div><div class="vqs-plot"><canvas id="vqsCsat" aria-label="Satisfaction over time"></canvas></div></div>'
      + '</div>'
      + (w.nps_responses ? '<div class="vqs-card" style="margin-top:14px;"><div class="vqs-spread"><div><h3>Net Promoter Score</h3><div class="sub">' + n(w.nps_responses) + ' answers · ' + esc(a.period.window_label) + '</div></div><div class="vqs-big">' + sign(w.nps) + '</div></div>'
        + '<div class="vqs-stack" role="img" aria-label="' + w.detractors + ' detractors, ' + w.passives + ' passives, ' + w.promoters + ' promoters">'
        + (w.detractors ? '<div style="width:' + seg(w.detractors) + '%;background:' + NPS_C.det + '"></div>' : '') + (w.passives ? '<div style="width:' + seg(w.passives) + '%;background:' + NPS_C.pas + '"></div>' : '') + (w.promoters ? '<div style="width:' + seg(w.promoters) + '%;background:' + NPS_C.pro + '"></div>' : '') + '</div>'
        + '<div class="vqs-legend"><span><i style="background:' + NPS_C.det + '"></i>Detractors 0–6 · ' + w.detractors + '</span><span><i style="background:' + NPS_C.pas + '"></i>Passives 7–8 · ' + w.passives + '</span><span><i style="background:' + NPS_C.pro + '"></i>Promoters 9–10 · ' + w.promoters + '</span></div></div>' : '')
      + (a.locations.length ? locationsCard(a) : '')
      + '<div class="vqs-grid vqs-g2" style="margin-top:14px;">' + a.questions.map(questionResult).join('') + (a.channels.length > 1 ? '<div class="vqs-card"><h3>Where answers came from</h3><div class="sub">' + esc(a.period.window_label) + '</div>' + bars(a.channels.map(function(c){ return { name: c.name, value: c.responses, share: Math.round(c.responses / w.responses * 100) }; })) + '</div>' : '') + '</div>'
      + (a.sampled ? '<p class="sub" style="margin-top:10px;">Question breakdowns use the latest 20,000 answers in the period; the headline figures use all of them.</p>' : '');
  }

  function locationsCard(a){
    return '<div class="vqs-card" style="margin-top:14px;"><h3>By location</h3><div class="sub">' + esc(a.period.window_label) + ' · lowest satisfaction first matters most</div>'
      + '<div style="overflow-x:auto;"><table class="vqs-table"><thead><tr><th>Location</th><th class="n">Responses</th><th class="n">Satisfied</th><th class="n">Average</th><th class="n">NPS</th></tr></thead><tbody>'
      + a.locations.map(function(l){
        return '<tr><td><b>' + esc(l.name) + '</b></td><td class="n">' + n(l.responses) + '</td><td class="n">' + (l.csat == null ? '—' : l.csat + '%') + '</td><td class="n">' + (l.csat_average == null ? '—' : l.csat_average + ' / 5') + '</td><td class="n">' + sign(l.nps) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function questionResult(q){
    var title = fill(tx(q.title));
    var headq = '<h3>' + esc(title) + '</h3><div class="sub">' + esc((QTYPES[q.type] || {}).label || q.type) + ' · ' + n(q.answered) + ' answers</div>';
    if (!q.answered) return '<div class="vqs-card">' + headq + '<div class="vqs-empty" style="padding:14px;">No answers in this period.</div></div>';
    var body = '';
    if (q.type === 'csat' || q.type === 'rating') {
      body = '<div class="vqs-spread" style="margin:-4px 0 10px;"><span class="vqs-big">' + q.average + '<small style="font-size:14px;color:var(--muted,#6b645b);"> / 5</small></span><span style="font-size:12.5px;font-weight:700;">' + (q.satisfied_pct == null ? '' : q.satisfied_pct + '% satisfied') + '</span></div>'
        + bars(q.distribution.slice().reverse().map(function(d){ return { name: (q.type === 'csat' ? FACES[d.value - 1] + ' ' : '★ ') + d.value, value: d.n, share: Math.round(d.n / q.answered * 100), color: SCORE[d.value - 1] }; }));
    } else if (q.type === 'nps') {
      body = '<div class="vqs-spread" style="margin:-4px 0 10px;"><span class="vqs-big">' + sign(q.nps) + '</span><span style="font-size:12px;color:var(--muted,#6b645b);">avg ' + q.average + ' / 10</span></div>'
        + bars(q.distribution.slice().reverse().map(function(d){ return { name: String(d.value), value: d.n, share: Math.round(d.n / q.answered * 100), color: npsColor(d.value) }; }));
    } else if (q.type === 'ces') {
      body = '<div class="vqs-spread" style="margin:-4px 0 10px;"><span class="vqs-big">' + q.average + '<small style="font-size:14px;color:var(--muted,#6b645b);"> / 7</small></span><span style="font-size:12px;color:var(--muted,#6b645b);">7 = very easy</span></div>'
        + bars(q.distribution.slice().reverse().map(function(d){ return { name: String(d.value), value: d.n, share: Math.round(d.n / q.answered * 100), color: d.value >= 5 ? '#2f56d9' : d.value >= 4 ? '#bdb7ad' : '#b4402f' }; }));
    } else if (q.type === 'rating_grid') {
      var rows = q.rows.filter(function(r){ return r.answered; }).slice().sort(function(x, y){ return x.average - y.average; });
      body = bars(rows.map(function(r){ return { name: tx(r.label), value: r.average, label: r.average + ' / 5', color: SCORE[Math.max(0, Math.min(4, Math.round(r.average) - 1))] }; }))
        + '<div class="sub" style="margin:8px 0 0;">Weakest first. Each is the average of the stars given.</div>';
    } else if (q.type === 'single' || q.type === 'multi') {
      body = bars(q.options.slice().sort(function(x, y){ return y.n - x.n; }).map(function(o){ return { name: tx(o.label), value: o.n, share: o.pct == null ? 0 : Math.round(o.pct) }; }))
        + (q.other_samples && q.other_samples.length ? '<div class="sub" style="margin:10px 0 0;">“Other” answers: ' + q.other_samples.map(function(x){ return '“' + esc(x) + '”'; }).join(', ') + '</div>' : '');
    } else if (q.type === 'yesno') {
      body = '<div class="vqs-spread"><span class="vqs-big">' + (q.yes_pct == null ? '—' : q.yes_pct + '%') + '</span><span style="font-size:12px;color:var(--muted,#6b645b);">said yes</span></div>'
        + '<div class="vqs-stack"><div style="width:' + (q.yes_pct || 0) + '%;background:#2f7d5f"></div><div style="width:' + (100 - (q.yes_pct || 0)) + '%;background:#b4402f"></div></div>'
        + '<div class="vqs-legend"><span><i style="background:#2f7d5f"></i>Yes · ' + q.yes + '</span><span><i style="background:#b4402f"></i>No · ' + q.no + '</span></div>';
    } else if (q.type === 'text') {
      body = (q.themes.length ? '<div class="sub" style="margin:0;">Words people use most</div><div class="vqs-themes">' + q.themes.map(function(t){ return '<span>' + esc(t.word) + '<b>' + t.n + '</b></span>'; }).join('') + '</div>' : '')
        + q.samples.map(function(x){ return '<div class="vqs-quote">“' + esc(x.text) + '”<div class="m">' + (x.score != null ? FACES[x.score - 1] + ' ' + x.score + '/5 · ' : '') + (x.nps != null ? 'NPS ' + x.nps + ' · ' : '') + esc(ago(x.submitted_at)) + '</div></div>'; }).join('');
    } else if (q.type === 'contact') {
      body = '<div class="vqs-big">' + n(q.answered) + '</div><div class="sub">left their details · ' + n(q.consented) + ' asked to be contacted</div>'
        + '<button class="vqs-btn sm" data-a="resp-filter" data-f="contact">See who</button>';
    }
    return '<div class="vqs-card">' + headq + body + '</div>';
  }

  function drawCharts(){
    destroyCharts();
    var a = st.analytics;
    if (!a || a.error || typeof Chart === 'undefined') return;
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var label = function(b){
      var p = b.split('-').map(Number);
      if (a.grain === 'day' || a.grain === 'week') return p[2] + ' ' + MONTHS[p[1] - 1];
      if (a.grain === 'month') return MONTHS[p[1] - 1] + ' ’' + String(p[0]).slice(2);
      if (a.grain === 'quarter') return 'Q' + (Math.floor((p[1] - 1) / 3) + 1) + ' ' + p[0];
      return String(p[0]);
    };
    var labels = a.series.map(function(s){ return label(s.bucket); });
    var base = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#16151a', padding: 10, cornerRadius: 8 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8d857a', maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: '#efece6' }, border: { display: false }, ticks: { color: '#8d857a', precision: 0, font: { size: 11 } } },
      },
    };
    var r = document.getElementById('vqsResp');
    if (r) charts.push(new Chart(r, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Responses', data: a.series.map(function(s){ return s.responses; }),
      backgroundColor: a.series.map(function(s, i){ return i === a.series.length - 1 ? '#a9bbf7' : '#2f56d9'; }), borderRadius: 4, maxBarThickness: 28 }] }, options: base }));
    var c = document.getElementById('vqsCsat');
    if (c) charts.push(new Chart(c, { type: 'line', data: { labels: labels, datasets: [{ label: 'Satisfied %', data: a.series.map(function(s){ return s.csat; }),
      borderColor: '#2f56d9', backgroundColor: 'rgba(47,86,217,.08)', fill: true, tension: .3, spanGaps: true, pointRadius: 3, pointBackgroundColor: '#2f56d9' }] },
      options: Object.assign({}, base, { scales: { x: base.scales.x, y: { min: 0, max: 100, grid: { color: '#efece6' }, border: { display: false }, ticks: { color: '#8d857a', callback: function(v){ return v + '%'; }, font: { size: 11 } } } } }) }));
  }
  function destroyCharts(){ charts.forEach(function(c){ try { c.destroy(); } catch (e) {} }); charts = []; }

  /* ---------------------------- Responses ---------------------------- */
  var FILTERS = [['all', 'All'], ['followup', 'Needs follow-up'], ['unhappy', 'Unhappy'], ['happy', 'Happy'], ['comments', 'With comments'], ['contact', 'Left contact details']];
  function tabResponses(){
    var s = st.survey, r = st.resp;
    if (!r && !st.rBusy) { loadResponses(true); }
    var bar = '<div class="vqs-spread" style="margin:0 0 12px;"><div class="vqs-seg" role="group" aria-label="Filter">'
      + FILTERS.map(function(f){ return '<button class="' + (st.rFilter === f[0] ? 'on' : '') + '" data-a="resp-filter" data-f="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>'
      + '<div class="vqs-row">'
      + (s.locations.length ? '<select data-a-change="resp-loc" style="width:auto;"><option value="">All locations</option>' + s.locations.map(function(l){ return '<option value="' + esc(l.id) + '"' + (st.rLoc === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select>' : '')
      + '<input type="search" placeholder="Search answers…" value="' + esc(st.rQ) + '" data-a-search="1" style="width:180px;">'
      + '<button class="vqs-btn sm" data-a="export">⬇ Excel</button></div></div>';
    if (!r) return bar + loading('Loading responses…');
    if (r.error) return bar + errorCard(r.error, 'reload-resp');
    if (!r.items.length) return bar + '<div class="vqs-card"><div class="vqs-empty">' + (st.rFilter === 'all' && !st.rQ && !st.rLoc ? 'No responses yet. Share the survey and they will appear here as they arrive.' : 'Nothing matches that filter.') + '</div></div>';
    return bar
      + '<div class="sub">' + n(r.total) + ' response' + (r.total === 1 ? '' : 's') + '</div>'
      + r.items.map(responseCard).join('')
      + (r.items.length < r.total ? '<div style="text-align:center;margin-top:12px;"><button class="vqs-btn" data-a="more"' + (st.rBusy ? ' disabled' : '') + '>' + (st.rBusy ? 'Loading…' : 'Show more') + '</button></div>' : '');
  }

  function responseCard(r){
    var open = st.openResp === r.id;
    var fu = r.followup || { status: 'none' };
    return '<div class="vqs-card vqs-resp" style="margin-top:10px;">'
      + '<div class="hd">' + scoreChips(r) + '<span>' + esc(when(r.submitted_at)) + '</span>'
      + (r.location ? '<span>· ' + esc(r.location.name) + '</span>' : '') + '<span>· ' + esc(r.channel_name || CHANNELS[r.channel] || r.channel) + '</span>'
      + (r.language === 'ur' ? '<span>· اردو</span>' : '')
      + (fu.status !== 'none' ? '<span class="vqs-pill ' + (fu.status === 'resolved' ? 'live' : fu.status === 'open' ? 'paused' : 'draft') + '" style="margin-left:auto;">' + ({ open: 'Needs follow-up', contacted: 'Contacted', resolved: 'Resolved' }[fu.status]) + '</span>' : '')
      + '</div>'
      + (r.comment ? '<div class="cm">“' + esc(r.comment) + '”</div>' : '')
      + contactLine(r.contact)
      + '<div style="margin-top:8px;"><button class="vqs-link" data-a="toggle-resp" data-id="' + esc(r.id) + '">' + (open ? 'Hide answers' : 'All answers') + '</button></div>'
      + (open ? '<div class="vqs-kv">' + r.readable.map(function(x){ return '<div>' + esc(x.question) + '</div><div><b>' + esc(x.answer) + '</b></div>'; }).join('')
        + (r.duration_sec != null ? '<div>Time taken</div><div>' + (r.duration_sec < 60 ? r.duration_sec + ' sec' : Math.round(r.duration_sec / 60) + ' min') + '</div>' : '') + '</div>' : '')
      + '<div class="vqs-fu"><span style="font-weight:700;">Follow-up</span><div class="vqs-seg">'
      + [['none', 'None'], ['open', 'Open'], ['contacted', 'Contacted'], ['resolved', 'Resolved']].map(function(x){
        return '<button class="' + (fu.status === x[0] ? 'on' : '') + '" data-a="fu" data-id="' + esc(r.id) + '" data-st="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div>'
      + '<textarea placeholder="What was done — only your team sees this" data-note="' + esc(r.id) + '" maxlength="2000">' + esc(fu.note || '') + '</textarea>'
      + '<button class="vqs-btn sm" data-a="note" data-id="' + esc(r.id) + '">Save note</button>'
      + (fu.by ? '<span style="color:var(--muted,#6b645b);">' + esc(fu.by) + ' · ' + esc(ago(fu.at)) + '</span>' : '')
      + '</div></div>';
  }

  function setFollowUp(surveyId, responseId, body, after){
    return api('PATCH', '/' + surveyId + '/responses/' + responseId, body).then(function(updated){
      if (st.resp && st.resp.items) st.resp.items = st.resp.items.map(function(x){ return x.id === updated.id ? updated : x; });
      toast(body.followup_status ? 'Marked ' + body.followup_status : 'Note saved');
      if (after) after();
      api('GET', '/overview' + (st.clientFilter ? '?client_id=' + encodeURIComponent(st.clientFilter) : '')).then(function(o){ st.overview = o; render(); }).catch(function(){});
      render();
    }).catch(function(e){ toast(e.message || 'Could not save that.', true); });
  }

  /* ---------------------------- Questions (the builder) ---------------------------- */
  function langs(){ return (st.draft && st.draft.languages && st.draft.languages.length ? st.draft.languages : ['en']); }
  function textPair(label, obj, path, opts){
    opts = opts || {};
    var ls = langs();
    return '<div class="vqs-f"><span>' + label + '</span><div class="' + (ls.length > 1 ? 'vqs-two' : '') + '">' + ls.map(function(l){
      var v = (obj && obj[l]) || '';
      var common = ' data-path="' + esc(path + '.' + l) + '" maxlength="' + (opts.max || 300) + '" placeholder="' + esc(LANGS[l] + (opts.ph ? ' — ' + opts.ph : '')) + '"' + (l === 'ur' ? ' dir="rtl" lang="ur"' : '');
      return opts.area ? '<textarea' + common + ' rows="2">' + esc(v) + '</textarea>' : '<input type="text"' + common + ' value="' + esc(v) + '">';
    }).join('') + '</div></div>';
  }

  function tabQuestions(){
    var d = st.draft, qs = d.questions;
    var responses = st.survey.responses_total;
    return '<div class="vqs-build"><div>'
      + '<div class="vqs-banner info">Tap a question to edit it. Changes show in the phone on the right as you type, and reach customers when you save. '
      + 'Rewording is always safe; <b>deleting a question</b> keeps the answers already given but leaves them out of the results.</div>'
      + qs.map(function(q, i){ return questionEditor(q, i, qs); }).join('')
      + (st.addingQ ? '<div class="vqs-card" style="margin-top:10px;"><div class="vqs-spread" style="margin-bottom:10px;"><h3>Add a question</h3><button class="vqs-link" data-a="add-cancel">Cancel</button></div><div class="vqs-types">'
        + Object.keys(QTYPES).map(function(t){ return '<button data-a="add-q" data-type="' + t + '"><span style="font-size:18px;">' + QTYPES[t].icon + '</span><span><b>' + esc(QTYPES[t].label) + '</b><span>' + esc(QTYPES[t].hint) + '</span></span></button>'; }).join('')
        + '</div></div>'
        : '<div style="margin-top:12px;"><button class="vqs-btn" data-a="add-open"' + (qs.length >= 40 ? ' disabled' : '') + '>＋ Add a question</button></div>')
      + '</div>' + phone() + '</div>';
  }

  function questionEditor(q, i, qs){
    var open = st.openQ === q.id;
    var t = QTYPES[q.type] || { icon: '?', label: q.type };
    var title = fill(tx(q.title, langs()[0])) || '(no question text yet)';
    var head = '<div class="qh" data-a="open-q" data-id="' + esc(q.id) + '">'
      + '<span class="num">' + (i + 1) + '</span><span style="font-size:16px;">' + t.icon + '</span>'
      + '<span class="qt">' + esc(title) + '</span>'
      + (q.show_if ? '<span class="vqs-tag" title="Only shown to some people">⑂ logic</span>' : '')
      + (q.required ? '<span class="vqs-tag" style="background:#fbeee4;color:#94512b;">required</span>' : '')
      + '<span class="ty">' + esc(t.label) + '</span>'
      + '<button class="vqs-mini" data-a="move-q" data-i="' + i + '" data-d="-1" title="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button class="vqs-mini" data-a="move-q" data-i="' + i + '" data-d="1" title="Move down"' + (i === qs.length - 1 ? ' disabled' : '') + '>↓</button>'
      + '</div>';
    if (!open) return '<div class="vqs-card vqs-q" style="margin-top:8px;">' + head + '</div>';
    var p = 'questions.' + i;
    var body = textPair('Question', q.title, p + '.title', { max: 300 })
      + textPair('Help text <em>— optional, shown under the question</em>', q.help || {}, p + '.help', { max: 300 });
    if (q.type === 'csat') {
      body += '<div class="vqs-f"><span>Show as</span><div class="vqs-seg">'
        + [['emoji', '😊 Faces'], ['stars', '★ Stars']].map(function(x){ return '<button class="' + ((q.style || 'emoji') === x[0] ? 'on' : '') + '" data-a="q-set" data-i="' + i + '" data-k="style" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    }
    if (q.type === 'rating_grid') body += itemsEditor(q.rows, i, 'rows', 'Rows to rate', 12);
    if (q.type === 'single' || q.type === 'multi') {
      body += itemsEditor(q.options, i, 'options', 'Options', 20)
        + '<label class="vqs-check"><input type="checkbox" data-q-bool="' + i + '" data-k="allow_other"' + (q.allow_other ? ' checked' : '') + '>Add an “Other” option they can type into</label>';
    }
    if (q.type === 'yesno') {
      body += '<label class="vqs-check"><input type="checkbox" data-q-bool="' + i + '" data-k="metric_resolved"' + (q.metric === 'resolved' ? ' checked' : '') + '>Counts towards “Resolved” — “No” opens a follow-up</label>';
    }
    if (q.type === 'contact') {
      body += '<div class="vqs-f"><span>Ask for</span>' + ['name', 'phone', 'email', 'company'].map(function(f){
        return '<label class="vqs-check"><input type="checkbox" data-q-field="' + i + '" data-field="' + f + '"' + ((q.fields || []).indexOf(f) >= 0 ? ' checked' : '') + '>' + { name: 'Name', phone: 'Phone / WhatsApp', email: 'Email', company: 'Business name' }[f] + '</label>';
      }).join('') + '<div class="sub" style="margin:4px 0 0;">Respondents also tick whether you may contact them.</div></div>';
    }
    body += logicEditor(q, i, qs)
      + '<div class="vqs-spread" style="margin-top:6px;">'
      + '<label class="vqs-check"><input type="checkbox" data-q-bool="' + i + '" data-k="required"' + (q.required ? ' checked' : '') + '>Required</label>'
      + '<span class="vqs-row"><button class="vqs-btn sm" data-a="dup-q" data-i="' + i + '">Duplicate</button>'
      + '<button class="vqs-btn sm danger" data-a="del-q" data-i="' + i + '"' + (qs.length <= 1 ? ' disabled' : '') + '>Delete</button></span></div>';
    return '<div class="vqs-card vqs-q on" style="margin-top:8px;">' + head + '<div class="qb">' + body + '</div></div>';
  }

  function itemsEditor(items, qi, key, label, max){
    var ls = langs();
    return '<div class="vqs-f"><span>' + label + '</span>' + (items || []).map(function(it, j){
      return '<div class="vqs-item' + (ls.length > 1 ? '' : ' one') + '">' + ls.map(function(l){
        return '<input type="text" data-path="questions.' + qi + '.' + key + '.' + j + '.label.' + l + '" maxlength="160" value="' + esc((it.label && it.label[l]) || '') + '" placeholder="' + esc(LANGS[l]) + '"' + (l === 'ur' ? ' dir="rtl" lang="ur"' : '') + '>';
      }).join('') + '<span class="vqs-row" style="gap:0;flex-wrap:nowrap;">'
        + '<button class="vqs-mini" data-a="move-item" data-i="' + qi + '" data-key="' + key + '" data-j="' + j + '" data-d="-1" title="Up"' + (j === 0 ? ' disabled' : '') + '>↑</button>'
        + '<button class="vqs-mini" data-a="del-item" data-i="' + qi + '" data-key="' + key + '" data-j="' + j + '" title="Remove"' + (items.length <= 1 ? ' disabled' : '') + '>✕</button></span></div>';
    }).join('') + (items.length < max ? '<button class="vqs-btn sm" data-a="add-item" data-i="' + qi + '" data-key="' + key + '">＋ Add</button>' : '') + '</div>';
  }

  /** "Show this question only if…" — the rules the server and the survey app both apply. */
  function logicEditor(q, i, qs){
    var sources = qs.slice(0, i).filter(function(x){ return ['csat', 'nps', 'ces', 'rating', 'yesno', 'single', 'multi', 'text', 'contact', 'rating_grid'].indexOf(x.type) >= 0; });
    if (!sources.length) return '';
    var c = q.show_if;
    var src = c ? qs.find(function(x){ return x.id === c.q; }) : null;
    var out = '<div class="vqs-f"><span>Logic <em>— ask this only to some people</em></span><div class="vqs-logic">'
      + '<select data-logic="' + i + '" data-part="q"><option value="">Always ask this question</option>'
      + sources.map(function(x){ return '<option value="' + esc(x.id) + '"' + (c && c.q === x.id ? ' selected' : '') + '>Only if: ' + esc(fill(tx(x.title)).slice(0, 60)) + '</option>'; }).join('') + '</select>';
    if (src) {
      var ops = RANGE[src.type] ? [['lte', 'is at most'], ['gte', 'is at least'], ['eq', 'is exactly'], ['answered', 'is answered']]
        : src.type === 'yesno' ? [['eq', 'is'], ['answered', 'is answered']]
        : src.type === 'single' ? [['eq', 'is'], ['neq', 'is not'], ['answered', 'is answered']]
        : src.type === 'multi' ? [['includes', 'includes'], ['answered', 'is answered']]
        : [['answered', 'is answered']];
      out += '<select data-logic="' + i + '" data-part="op">' + ops.map(function(o){ return '<option value="' + o[0] + '"' + (c.op === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
      if (c.op !== 'answered') {
        var vals = [];
        if (RANGE[src.type]) for (var v = RANGE[src.type][0]; v <= RANGE[src.type][1]; v++) vals.push([String(v), String(v)]);
        else if (src.type === 'yesno') vals = [['true', 'Yes'], ['false', 'No']];
        else if (src.options) vals = src.options.map(function(o){ return [o.id, tx(o.label)]; }).concat(src.allow_other && src.type === 'single' ? [[OTHER, 'Other']] : []);
        out += '<select data-logic="' + i + '" data-part="v">' + vals.map(function(x){ return '<option value="' + esc(x[0]) + '"' + (String(c.v) === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
      }
    }
    return out + '</div></div>';
  }

  function newQuestion(type){
    var t = NEW_TITLES[type];
    var q = { id: rid('q'), type: type, required: type === 'csat' || type === 'nps', title: { en: t[0], ur: t[1] } };
    if (type === 'csat') q.style = 'emoji';
    if (type === 'rating_grid') q.rows = [['quality', 'Quality', 'معیار'], ['service', 'Service', 'سروس'], ['value', 'Value for money', 'قیمت کے لحاظ سے معیار']].map(function(r){ return { id: r[0], label: { en: r[1], ur: r[2] } }; });
    if (type === 'single' || type === 'multi') q.options = [{ id: rid('o'), label: { en: 'First option' } }, { id: rid('o'), label: { en: 'Second option' } }];
    if (type === 'text') q.multiline = true;
    if (type === 'contact') q.fields = ['name', 'phone'];
    return q;
  }

  /* ---------------------------- Live phone preview ---------------------------- */
  function phone(){
    var s = st.survey;
    return '<div class="vqs-phone-wrap"><div class="vqs-phone"><iframe id="vqs-preview" title="Live preview" src="/s/' + encodeURIComponent(s.slug) + '?preview=1"></iframe></div>'
      + '<div class="vqs-phone-cap">Live preview — nothing you do here is recorded</div></div>';
  }
  var previewTimer = null, pendingGoto = null;
  function pushPreview(goto){
    // An edit arriving while a "show this question" is still queued must not
    // cancel it: the jump is kept and sent with the next update.
    if (goto) pendingGoto = goto;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function(){
      var f = document.getElementById('vqs-preview');
      if (!f || !f.contentWindow || !st.draft) return;
      goto = pendingGoto; pendingGoto = null;
      var d = st.draft;
      try {
        f.contentWindow.postMessage({ type: 'vqs:survey', survey: {
          display_name: d.display_name || st.survey.company, brand_color: d.brand_color, logo_url: d.logo_url,
          languages: d.languages, default_language: d.default_language, content: d.content, questions: d.questions,
          locations: d.locations, review_url: d.review_url,
        } }, location.origin);
        if (goto) f.contentWindow.postMessage({ type: 'vqs:goto', id: goto }, location.origin);
      } catch (e) { /* the preview is a nicety; never let it break the editor */ }
    }, pendingGoto ? 30 : 250);
  }

  /* ---------------------------- Share ---------------------------- */
  function tabShare(){
    var s = st.survey, L = s.links;
    var justMade = st.justCreated;
    var notLive = s.status !== 'live';
    return (justMade ? '<div class="vqs-banner ok"><b>' + (s.status === 'live' ? 'Your survey is live. 🎉' : 'Your draft is saved.') + '</b> ' + (s.status === 'live' ? 'Share it below — print the QR code for your counter or tables, or send the link on WhatsApp. Answers appear under Results the moment they arrive.' : 'Set it live under Settings when you are ready to share it.') + '</div>' : '')
      + (notLive ? '<div class="vqs-banner warn">This survey is <b>' + esc(s.status) + '</b> — customers who open the link see a “not open” page. <button class="vqs-link" data-a="go-live">Set it live now</button></div>' : '')
      + '<div class="vqs-grid vqs-g2">'
      + '<div class="vqs-card"><h3>Survey link</h3><div class="sub">Works on any phone. Paste it in WhatsApp, SMS, email or on a receipt.</div>'
      + '<div class="vqs-url"><code>' + esc(L.url) + '</code><button class="vqs-btn sm primary" data-a="copy" data-text="' + esc(L.url) + '">Copy</button></div>'
      + '<div class="vqs-row" style="margin-top:12px;">'
      + '<a class="vqs-btn sm" href="' + esc(L.whatsapp) + '" target="_blank" rel="noopener">🟢 Share on WhatsApp</a>'
      + '<a class="vqs-btn sm" href="' + esc(L.preview) + '" target="_blank" rel="noopener">👁 Preview</a>'
      + '<button class="vqs-btn sm" data-a="copy" data-text="' + esc(L.kiosk) + '" title="For a tablet at the counter: it starts over after each customer">🖥 Copy kiosk link</button></div></div>'
      + '<div class="vqs-card"><h3>QR code</h3><div class="sub">For tables, the counter, receipts, bags and delivery boxes. Scans are counted separately.</div>'
      + '<div class="vqs-qr"><img src="/s/' + encodeURIComponent(s.slug) + '/qr.svg?size=336" alt="QR code for the survey" width="168" height="168">'
      + '<div class="vqs-row" style="flex-direction:column;align-items:flex-start;">'
      + '<a class="vqs-btn sm primary" href="' + esc(L.poster) + '" target="_blank" rel="noopener">🖨 Print a poster</a>'
      + '<a class="vqs-btn sm" href="' + esc(L.poster) + '?layout=cards" target="_blank" rel="noopener">🃏 Print table cards</a>'
      + '<a class="vqs-btn sm" href="/s/' + encodeURIComponent(s.slug) + '/qr.svg?download=1&size=1200" download>⬇ Download QR (SVG)</a></div></div></div>'
      + '</div>'
      + (L.locations.length ? '<div class="vqs-card" style="margin-top:14px;"><h3>One QR code per location</h3><div class="sub">Each branch’s code tags its answers, so Results can compare them.</div>'
        + '<div style="overflow-x:auto;"><table class="vqs-table"><thead><tr><th>Location</th><th>Link</th><th></th></tr></thead><tbody>'
        + L.locations.map(function(l){
          return '<tr><td><b>' + esc(l.name) + '</b></td><td><code style="font-size:11.5px;">' + esc(l.url) + '</code></td><td style="white-space:nowrap;">'
            + '<button class="vqs-btn sm" data-a="copy" data-text="' + esc(l.url) + '">Copy</button> '
            + '<a class="vqs-btn sm" href="' + esc(l.poster) + '" target="_blank" rel="noopener">Poster</a> '
            + '<a class="vqs-btn sm" href="' + esc(l.poster) + '&layout=cards" target="_blank" rel="noopener">Cards</a> '
            + '<a class="vqs-btn sm" href="/s/' + encodeURIComponent(s.slug) + '/qr.svg?download=1&size=1200&loc=' + encodeURIComponent(l.id) + '" download>QR</a></td></tr>';
        }).join('') + '</tbody></table></div></div>'
        : '<div class="vqs-card" style="margin-top:14px;"><h3>Several branches?</h3><div class="sub" style="margin:0;">Add them under Settings → Locations and each gets its own QR code and its own line in the results.</div></div>')
      + '<div class="vqs-grid vqs-g2" style="margin-top:14px;">'
      + '<div class="vqs-card"><h3>On your website</h3><div class="sub">Paste this where the survey should appear.</div><div class="vqs-code">' + esc(L.embed) + '</div><button class="vqs-btn sm" data-a="copy" data-text="' + esc(L.embed) + '">Copy the code</button></div>'
      + '<div class="vqs-card"><h3>Personal one-time links</h3><div class="sub">One link per customer, each answerable once — for sending to a list. The response rate shows under Results.</div>'
      + '<div class="vqs-row"><input type="number" min="1" max="500" value="10" id="vqs-inv-n" style="width:90px;"><button class="vqs-btn sm" data-a="invites">Create links</button>'
      + (st.invites ? '<button class="vqs-btn sm" data-a="copy" data-text="' + esc(st.invites.map(function(x){ return x.url; }).join('\n')) + '">Copy all ' + st.invites.length + '</button>' : '') + '</div>'
      + (st.invites ? '<div class="vqs-code" style="max-height:140px;overflow:auto;">' + esc(st.invites.map(function(x){ return x.url; }).join('\n')) + '</div>' : '') + '</div>'
      + '</div>'
      + '<div class="vqs-card" style="margin-top:14px;"><h3>After every WhatsApp conversation</h3>'
      + (isPortal()
        ? '<div class="sub" style="margin:0;">Your VantriqAI agent can send this survey automatically when each chat ends, so every conversation gets rated. <a class="vqs-link" href="https://wa.me/923006789807?text=' + encodeURIComponent('Please switch on the after-chat survey "' + s.title + '" for ' + biz(s) + '.') + '" target="_blank" rel="noopener">Ask us to switch it on</a> — it takes a few minutes.</div>'
        : '<div class="sub">The agent’s n8n flow calls this when a conversation closes, then sends <code>message</code> back to the customer. Each answer is tied to the conversation it rates.</div>'
          + '<div class="vqs-code">POST /api/webhooks/survey-invite\nx-api-key: &lt;webhook key&gt;\n\n' + esc(JSON.stringify({ external_ref: '<the client’s or agent’s ref>', session_id: '<the conversation’s session id>', channel: 'whatsapp', survey_slug: s.slug }, null, 2)) + '</div>')
      + '</div>';
  }

  /* ---------------------------- Settings ---------------------------- */
  function tabSettings(){
    var d = st.draft, s = st.survey;
    return '<div class="vqs-build"><div>'
      + '<div class="vqs-card"><h3>Status</h3><div class="sub">Only a live survey accepts answers. Paused and closed surveys show customers a polite notice instead.</div><div class="vqs-seg">'
      + [['live', 'Live'], ['paused', 'Paused'], ['closed', 'Closed'], ['draft', 'Draft']].map(function(x){ return '<button class="' + (d.status === x[0] ? 'on' : '') + '" data-a="set" data-k="status" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>'
      + '<div class="vqs-card"><h3>Look and feel</h3>'
      + '<div class="vqs-two"><label class="vqs-f"><span>Survey name <em>— only you see this</em></span><input type="text" data-path="title" maxlength="160" value="' + esc(d.title) + '"></label>'
      + '<label class="vqs-f"><span>Business name customers see</span><input type="text" data-path="display_name" maxlength="120" placeholder="' + esc(s.company) + '" value="' + esc(d.display_name) + '"></label></div>'
      + '<div class="vqs-f"><span>Brand colour</span>' + colorPicker(d.brand_color, 'draft') + '</div>'
      + '<label class="vqs-f"><span>Logo address <em>— optional, an https:// link to your logo image</em></span><input type="url" data-path="logo_url" placeholder="https://yourbusiness.com/logo.png" value="' + esc(d.logo_url) + '"></label>'
      + '<div class="vqs-f"><span>Languages</span>' + ['en', 'ur'].map(function(l){ return '<label class="vqs-check"><input type="checkbox" data-lang-toggle="' + l + '"' + (d.languages.indexOf(l) >= 0 ? ' checked' : '') + '>' + LANGS[l] + '</label>'; }).join('')
      + (d.languages.length > 1 ? '<span style="font-size:12.5px;margin-left:6px;">Start in <select data-path-select="default_language" style="width:auto;display:inline-block;">' + d.languages.map(function(l){ return '<option value="' + l + '"' + (d.default_language === l ? ' selected' : '') + '>' + LANGS[l] + '</option>'; }).join('') + '</select></span>' : '')
      + '<div class="sub" style="margin:4px 0 0;">A customer’s phone set to Urdu starts in Urdu automatically.</div></div>'
      + '</div>'
      + '<div class="vqs-card"><h3>Welcome and thank-you</h3>'
      + textPair('Welcome message', (d.content || {}).intro || {}, 'content.intro', { area: true, max: 600 })
      + textPair('Thank-you message', (d.content || {}).thanks || {}, 'content.thanks', { area: true, max: 600 })
      + '<label class="vqs-check"><input type="checkbox" data-content-bool="skip_intro"' + ((d.content || {}).skip_intro ? ' checked' : '') + '>Skip the welcome screen and start at the first question <span style="color:var(--muted,#6b645b);font-weight:500;">— best for WhatsApp</span></label>'
      + '<div class="sub" style="margin-top:6px;">Write {business} anywhere to insert the business name.</div></div>'
      + '<div class="vqs-card"><h3>Locations</h3><div class="sub">Branches, outlets or sites. Each gets its own QR code; with more than one, customers who scan the general code are asked which they visited.</div>'
      + (d.locations || []).map(function(l, j){
        return '<div class="vqs-item one"><input type="text" data-path="locations.' + j + '.name" maxlength="120" value="' + esc(l.name) + '" placeholder="Branch name">'
          + '<button class="vqs-mini" data-a="del-loc" data-j="' + j + '" title="Remove">✕</button></div>';
      }).join('') + '<button class="vqs-btn sm" data-a="add-loc">＋ Add a location</button></div>'
      + '<div class="vqs-card"><h3>When answers arrive</h3>'
      + '<label class="vqs-f"><span>Email unhappy answers to <em>— comma-separated; leave empty for none</em></span><input type="text" data-path="alert_emails" value="' + esc(d.alert_emails) + '" placeholder="manager@yourbusiness.com"></label>'
      + '<label class="vqs-f"><span>Google review link <em>— delighted customers are invited to leave a review</em></span><input type="url" data-path="review_url" value="' + esc(d.review_url) + '" placeholder="https://g.page/r/…/review"></label>'
      + '<div class="vqs-two"><label class="vqs-f"><span>Close on <em>— optional</em></span><input type="date" data-path="closes_at" value="' + esc(d.closes_at || '') + '"></label>'
      + '<label class="vqs-f"><span>Stop after this many answers <em>— optional</em></span><input type="number" min="1" data-path="response_limit" value="' + esc(d.response_limit) + '"></label></div>'
      + '<label class="vqs-f"><span>Survey address</span><div class="vqs-row" style="flex-wrap:nowrap;"><span style="font-size:12.5px;color:var(--muted,#6b645b);white-space:nowrap;">…/s/</span><input type="text" data-path="slug" maxlength="63" value="' + esc(d.slug) + '"></div>'
      + '<div class="sub" style="margin:4px 0 0;">Changing it breaks QR codes you have already printed.</div></label>'
      + '</div>'
      + '<div class="vqs-card vqs-danger"><h3>More</h3><div class="vqs-row" style="margin-top:8px;"><button class="vqs-btn" data-a="duplicate">Duplicate this survey</button>'
      + '<button class="vqs-btn danger" data-a="delete">Delete survey and all its answers</button></div></div>'
      + '</div>' + phone() + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Draft editing                                                       */
  /* ------------------------------------------------------------------ */
  function setPath(obj, path, value){
    var parts = path.split('.'), o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i], next = parts[i + 1];
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(next) ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = value;
  }
  function touched(){
    // Only the save bar changes as someone types; the page is left alone so focus and caret stay put.
    var bar = document.getElementById('vqs-savebar');
    if (dirty() && !bar) {
      var wrap = document.createElement('div');
      wrap.innerHTML = saveBar();
      root.querySelector('.vqs').appendChild(wrap.firstChild);
    } else if (!dirty() && bar) bar.remove();
    pushPreview();
  }
  function save(){
    var d = clone(st.draft);
    // Empty strings are "not set" for the server; objects lose empty languages.
    d.closes_at = d.closes_at ? new Date(d.closes_at + 'T23:59:59').toISOString() : null;
    d.response_limit = d.response_limit === '' || d.response_limit == null ? null : Number(d.response_limit);
    st.saving = true; render();
    return api('PATCH', '/' + st.survey.id, d).then(function(s){
      st.saving = false; setSurvey(s); toast('Saved — customers see the change now'); render(); pushPreview();
      st.list = null; loadHome();
    }).catch(function(e){ st.saving = false; render(); toast(e.message || 'Could not save.', true); });
  }
  function leaveCheck(){
    if (!dirty()) return true;
    return window.confirm('You have unsaved changes. Leave without saving?');
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  function onClick(e){
    var b = e.target.closest('[data-a]');
    if (!b || !root.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-a'), ds = b.dataset;
    if (a === 'tab' || a === 'home' || a === 'open' || a === 'new') st.justCreated = false;
    var d = st.draft;
    switch (a) {
      case 'home': if (!leaveCheck()) return; st.view = 'home'; st.survey = null; st.draft = null; destroyCharts(); render(); if (!st.list) loadHome(); break;
      case 'reload-home': st.list = null; render(); loadHome(); break;
      case 'new': st.view = 'new'; st.newTpl = ds.tpl || null; st.newForm = {}; render(); if (ds.tpl) setTimeout(scrollSetup, 50); break;
      case 'pick-tpl': st.newTpl = ds.tpl; render(); setTimeout(scrollSetup, 50); break;
      case 'create': createSurvey(ds.status); break;
      case 'open': e.preventDefault(); openSurvey(ds.id, ds.tab); break;
      case 'tab':
        if ((st.tab === 'questions' || st.tab === 'settings') && ds.tab !== 'questions' && ds.tab !== 'settings' && !leaveCheck()) return;
        if ((st.tab === 'questions' || st.tab === 'settings') && ds.tab !== st.tab && ds.tab !== 'questions' && ds.tab !== 'settings') setSurvey(st.survey);
        st.tab = ds.tab; render();
        if (st.tab === 'results' && !st.analytics) loadAnalytics();
        if (st.tab === 'responses' && !st.resp) loadResponses(true);
        break;
      case 'grain': st.grain = ds.grain; loadAnalytics(); break;
      case 'reload-analytics': loadAnalytics(); break;
      case 'export':
        host.download('/' + st.survey.id + '/responses.xlsx', st.survey.slug + '-responses.xlsx').catch(function(err){ toast(err.message || 'Could not download.', true); });
        break;
      case 'copy': copy(ds.text); break;
      case 'resp-filter': st.tab = 'responses'; st.rFilter = ds.f; loadResponses(true); break;
      case 'reload-resp': case 'more': loadResponses(a !== 'more'); break;
      case 'toggle-resp': st.openResp = st.openResp === ds.id ? null : ds.id; render(); break;
      case 'fu': setFollowUp(st.survey.id, ds.id, { followup_status: ds.st }); break;
      case 'fu-quick': setFollowUp(ds.sid, ds.rid, { followup_status: ds.st }); break;
      case 'note':
        var ta = root.querySelector('[data-note="' + ds.id + '"]');
        setFollowUp(st.survey.id, ds.id, { followup_note: ta ? ta.value : '' });
        break;
      case 'invites':
        var inp = document.getElementById('vqs-inv-n');
        api('POST', '/' + st.survey.id + '/invites', { count: Number(inp && inp.value) || 1 }).then(function(r){ st.invites = r.invites; render(); })
          .catch(function(err){ toast(err.message, true); });
        break;
      case 'go-live': d.status = 'live'; save(); break;
      /* builder */
      case 'open-q':
        if (e.target.closest('[data-a="move-q"]')) return;
        st.openQ = st.openQ === ds.id ? null : ds.id; st.addingQ = false; render(); pushPreview(st.openQ || null); break;
      case 'move-q':
        var i = Number(ds.i), j = i + Number(ds.d);
        if (j < 0 || j >= d.questions.length) return;
        var tmp = d.questions[i]; d.questions[i] = d.questions[j]; d.questions[j] = tmp;
        render(); pushPreview(); break;
      case 'add-open': st.addingQ = true; render(); break;
      case 'add-cancel': st.addingQ = false; render(); break;
      case 'add-q':
        var q = newQuestion(ds.type); d.questions.push(q); st.addingQ = false; st.openQ = q.id; render(); pushPreview(q.id); break;
      case 'dup-q':
        var copyQ = clone(d.questions[Number(ds.i)]); copyQ.id = rid('q'); delete copyQ.show_if;
        d.questions.splice(Number(ds.i) + 1, 0, copyQ); st.openQ = copyQ.id; render(); pushPreview(copyQ.id); break;
      case 'del-q':
        var gone = d.questions[Number(ds.i)];
        if (!window.confirm('Delete “' + fill(tx(gone.title)).slice(0, 80) + '”? Answers already given are kept but no longer shown in the results.')) return;
        d.questions.splice(Number(ds.i), 1);
        d.questions.forEach(function(x){ if (x.show_if && x.show_if.q === gone.id) delete x.show_if; });
        st.openQ = null; render(); pushPreview(); break;
      case 'q-set': d.questions[Number(ds.i)][ds.k] = ds.v; render(); pushPreview(d.questions[Number(ds.i)].id); break;
      case 'add-item':
        var list = d.questions[Number(ds.i)][ds.key];
        list.push({ id: rid(ds.key === 'rows' ? 'r' : 'o'), label: { en: '' } }); render();
        setTimeout(function(){ var ins = root.querySelectorAll('[data-path^="questions.' + ds.i + '.' + ds.key + '."]'); if (ins.length) ins[ins.length - (langs().length)].focus(); }, 20);
        break;
      case 'del-item':
        d.questions[Number(ds.i)][ds.key].splice(Number(ds.j), 1); render(); pushPreview(); break;
      case 'move-item':
        var arr = d.questions[Number(ds.i)][ds.key], a1 = Number(ds.j), a2 = a1 - 1;
        if (a2 < 0) return; var t2 = arr[a1]; arr[a1] = arr[a2]; arr[a2] = t2; render(); pushPreview(); break;
      /* settings */
      case 'set': d[ds.k] = ds.v; render(); pushPreview(); break;
      case 'color':
        if (ds.scope === 'nf') { st.newForm.brand_color = ds.color; render(); }
        else { d.brand_color = ds.color; render(); pushPreview(); }
        break;
      case 'add-loc': d.locations = d.locations || []; d.locations.push({ name: '' }); render(); setTimeout(function(){ var l = root.querySelectorAll('[data-path^="locations."]'); if (l.length) l[l.length - 1].focus(); }, 20); break;
      case 'del-loc': d.locations.splice(Number(ds.j), 1); render(); pushPreview(); break;
      case 'discard': setSurvey(st.survey); render(); pushPreview(); break;
      case 'save': save(); break;
      case 'duplicate':
        if (!leaveCheck()) return;
        api('POST', '/' + st.survey.id + '/duplicate').then(function(s){ toast('Copied — the copy is a draft'); setSurvey(s); st.tab = 'questions'; st.list = null; render(); loadHome(); })
          .catch(function(err){ toast(err.message, true); });
        break;
      case 'delete':
        var typed = window.prompt('This deletes “' + st.survey.title + '” and every answer it has received. It cannot be undone.\n\nType DELETE to confirm.');
        if (typed !== 'DELETE') return;
        api('DELETE', '/' + st.survey.id).then(function(){ toast('Survey deleted'); st.view = 'home'; st.survey = null; st.draft = null; st.list = null; render(); loadHome(); })
          .catch(function(err){ toast(err.message, true); });
        break;
    }
  }
  function scrollSetup(){ var el = document.getElementById('vqs-setup'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function onInput(e){
    var el = e.target;
    if (el.hasAttribute('data-path') && st.draft) {
      var path = el.getAttribute('data-path');
      var v = el.value;
      if (path === 'response_limit') v = v === '' ? '' : v;
      setPath(st.draft, path, v);
      touched();
      return;
    }
    if (el.hasAttribute('data-nf')) { st.newForm[el.getAttribute('data-nf')] = el.value; return; }
    if (el.hasAttribute('data-color-input')) {
      if (el.getAttribute('data-color-input') === 'nf') st.newForm.brand_color = el.value;
      else if (st.draft) { st.draft.brand_color = el.value; touched(); }
      return;
    }
    if (el.hasAttribute('data-a-search')) {
      clearTimeout(onInput.t);
      onInput.t = setTimeout(function(){ st.rQ = el.value.trim(); loadResponses(true); }, 350);
    }
  }

  function onChange(e){
    var el = e.target, d = st.draft;
    if (el.hasAttribute('data-a-change')) {
      var which = el.getAttribute('data-a-change');
      if (which === 'client-filter') { st.clientFilter = el.value; st.list = null; render(); loadHome(); }
      if (which === 'resp-loc') { st.rLoc = el.value; loadResponses(true); }
      return;
    }
    if (el.hasAttribute('data-nf-lang')) {
      var l = el.getAttribute('data-nf-lang'), ls = (st.newForm.languages || ['en', 'ur']).slice();
      if (el.checked && ls.indexOf(l) < 0) ls.push(l);
      if (!el.checked) ls = ls.filter(function(x){ return x !== l; });
      st.newForm.languages = ls.sort(function(a, b){ return a === 'en' ? -1 : b === 'en' ? 1 : 0; });
      return;
    }
    if (el.hasAttribute('data-nf') && el.tagName === 'SELECT') { st.newForm[el.getAttribute('data-nf')] = el.value; render(); return; }
    if (!d) return;
    if (el.hasAttribute('data-q-bool')) {
      var q = d.questions[Number(el.getAttribute('data-q-bool'))], k = el.getAttribute('data-k');
      if (k === 'metric_resolved') { if (el.checked) q.metric = 'resolved'; else delete q.metric; }
      else q[k] = el.checked;
      render(); pushPreview(q.id); return;
    }
    if (el.hasAttribute('data-q-field')) {
      var cq = d.questions[Number(el.getAttribute('data-q-field'))], f = el.getAttribute('data-field');
      var fields = (cq.fields || []).filter(function(x){ return x !== f; });
      if (el.checked) fields.push(f);
      cq.fields = ['name', 'phone', 'email', 'company'].filter(function(x){ return fields.indexOf(x) >= 0; });
      if (!cq.fields.length) { cq.fields = ['name']; toast('Keep at least one detail to ask for.', true); }
      render(); pushPreview(cq.id); return;
    }
    if (el.hasAttribute('data-logic')) {
      var lq = d.questions[Number(el.getAttribute('data-logic'))], part = el.getAttribute('data-part');
      if (part === 'q') {
        if (!el.value) delete lq.show_if;
        else {
          var src = d.questions.find(function(x){ return x.id === el.value; });
          var op = RANGE[src.type] ? 'lte' : src.type === 'yesno' ? 'eq' : src.type === 'single' ? 'eq' : src.type === 'multi' ? 'includes' : 'answered';
          var v = RANGE[src.type] ? (src.type === 'nps' ? 6 : src.type === 'ces' ? 3 : 2) : src.type === 'yesno' ? false : src.options ? src.options[0].id : undefined;
          lq.show_if = { q: src.id, op: op }; if (v !== undefined && op !== 'answered') lq.show_if.v = v;
        }
      } else if (part === 'op') {
        lq.show_if.op = el.value;
        if (el.value === 'answered') delete lq.show_if.v;
        else if (lq.show_if.v === undefined) {
          var s2 = d.questions.find(function(x){ return x.id === lq.show_if.q; });
          lq.show_if.v = RANGE[s2.type] ? RANGE[s2.type][0] : s2.type === 'yesno' ? true : (s2.options ? s2.options[0].id : '');
        }
      } else {
        var s3 = d.questions.find(function(x){ return x.id === lq.show_if.q; });
        lq.show_if.v = RANGE[s3.type] ? Number(el.value) : s3.type === 'yesno' ? el.value === 'true' : el.value;
      }
      render(); pushPreview(lq.id); return;
    }
    if (el.hasAttribute('data-lang-toggle')) {
      var lg = el.getAttribute('data-lang-toggle'), cur = d.languages.slice();
      if (el.checked && cur.indexOf(lg) < 0) cur.push(lg);
      if (!el.checked) cur = cur.filter(function(x){ return x !== lg; });
      if (!cur.length) { toast('Keep at least one language.', true); render(); return; }
      d.languages = ['en', 'ur'].filter(function(x){ return cur.indexOf(x) >= 0; });
      if (d.languages.indexOf(d.default_language) < 0) d.default_language = d.languages[0];
      render(); pushPreview(); return;
    }
    if (el.hasAttribute('data-path-select')) { d[el.getAttribute('data-path-select')] = el.value; render(); pushPreview(); return; }
    if (el.hasAttribute('data-content-bool')) { d.content = d.content || {}; if (el.checked) d.content[el.getAttribute('data-content-bool')] = true; else delete d.content[el.getAttribute('data-content-bool')]; touched(); render(); return; }
    // A text field's change fires on blur — which is also what a click on
    // Save does first. Re-rendering here would replace the button between
    // mousedown and click and swallow the click, so text only marks dirty.
    if (el.hasAttribute('data-path')) touched();
  }

  function onKey(e){
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-a]')) { e.preventDefault(); e.target.click(); }
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  function render(){
    if (!root || !document.body.contains(root)) return;
    destroyCharts();
    var html = st.view === 'new' ? viewNew() : st.view === 'survey' ? viewSurvey() : viewHome();
    // Keep the preview iframe alive across a re-render when it is showing the
    // same survey: reloading it on every keystroke would flash and lose its place.
    var old = document.getElementById('vqs-preview');
    root.innerHTML = '<div class="vqs">' + html + '</div>';
    var fresh = document.getElementById('vqs-preview');
    if (old && fresh && old.getAttribute('src') === fresh.getAttribute('src')) {
      fresh.parentNode.replaceChild(old, fresh);
    } else if (fresh) {
      fresh.addEventListener('load', function(){ pushPreview(st.openQ); });
    }
    if (st.view === 'survey' && st.tab === 'results' && st.analytics && !st.analytics.error) {
      if (window.requestAnimationFrame) requestAnimationFrame(drawCharts); else drawCharts();
    }
  }

  /**
   * Mount into an element. Safe to call after every host re-render: state
   * lives here, and the element's listeners are attached once.
   */
  function mount(el, adapter){
    if (!el) return;
    host = adapter; root = el;
    injectStyles();
    if (!el.__vqs) {
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      el.addEventListener('change', onChange);
      el.addEventListener('keydown', onKey);
      el.__vqs = true;
    }
    if (!st.loaded) { st.loaded = true; loadHome(); loadTemplates().catch(function(){}); }
    render();
  }

  window.VQS = {
    mount: mount,
    open: function(id, tab){ openSurvey(id, tab); },
    hasUnsaved: function(){ return dirty(); },
    reset: function(){ st.loaded = false; st.list = null; st.overview = null; st.view = 'home'; st.survey = null; st.draft = null; },
    destroyCharts: destroyCharts,
  };
})();
