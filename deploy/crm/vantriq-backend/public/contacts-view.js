/**
 * Customers — one directory, two hosts: the customer portal (a business's own
 * customers) and the CRM (any client's, or all of them). The host passes an
 * adapter; this file never knows which it is in beyond the audience flag.
 *
 *   VQC.mount(el, {
 *     audience: 'portal' | 'crm',
 *     api(method, path, body) → Promise<json>   path is relative to the directory:
 *                                                '?q=…', '/<key>' (portal) or '/<clientId>/<key>' (crm)
 *     download(path, filename) → Promise
 *     clients() → [{ id, company }]              crm only: the client picker
 *     toast(message, warn)
 *   })
 *   VQC.open(key, clientId)   jump straight to one customer
 *   VQC.reset()               forget everything (sign-out)
 */
(function(){
  'use strict';

  var SEGMENTS = [
    ['all', 'Everyone'], ['new', 'New · 30 days'], ['returning', 'Returning'], ['vip', 'Regulars · 5+'],
    ['at_risk', 'At risk'], ['unhappy', 'Unhappy'], ['no_name', 'No name yet'], ['with_email', 'With email'],
  ];
  var SEG_HINT = {
    new: 'First contact in the last 30 days', returning: 'Two conversations or more', vip: 'Five conversations or more',
    at_risk: 'Came back before, but quiet for 60+ days — worth a message', unhappy: 'Last satisfaction score 1–2 or NPS 0–6',
    no_name: 'Nobody knows their name yet', with_email: 'An email address is known',
  };
  var SEG_TAG = { new: ['New', '#1f7a4d', '#e3f3ea'], returning: ['Returning', '#1f3a95', '#e8ecfd'], vip: ['Regular', '#7a3fb0', '#f1e8fb'],
    at_risk: ['At risk', '#b36b00', '#fdf1dc'], unhappy: ['Unhappy', '#b3261e', '#fbe9e7'], survey_only: ['From a survey', '#6b645b', '#f1eee8'] };
  var FACES = ['😠', '🙁', '😐', '🙂', '😍'];
  var SCORE = ['#b4402f', '#d98676', '#bdb7ad', '#7f9bf2', '#2f56d9'];
  var GENDERS = ['', 'Male', 'Female', 'Other', 'Prefer not to say'];
  var AGES = ['', 'Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'];
  var CITIES = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot', 'Gujranwala'];
  var PAGE = 50;

  var host = null, root = null, timer = null;
  var st = fresh();
  function fresh(){
    return { clientId: '', q: '', segment: 'all', city: '', sort: 'recent', limit: PAGE, list: null, loading: false,
      view: 'list', key: null, keyClient: null, detail: null, saving: false, openConv: null };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v){ return v == null ? '—' : Math.round(v).toLocaleString('en-US'); }
  function isCrm(){ return host && host.audience === 'crm'; }
  function toast(m, w){ if (host && host.toast) host.toast(m, w); }
  function when(d){ return d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function day(d){ return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
  function ago(d){
    if (!d) return '—';
    var s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    var dd = Math.floor(s / 86400);
    if (dd < 31) return dd + (dd === 1 ? ' day ago' : ' days ago');
    if (dd < 365) { var mo = Math.floor(dd / 30.4); return mo + (mo === 1 ? ' month ago' : ' months ago'); }
    var yr = Math.floor(dd / 365); return yr + (yr === 1 ? ' year ago' : ' years ago');
  }
  function initials(c){
    var src = (c.name || '').trim();
    if (!src) return c.key && /^\d/.test(c.key) ? '#' : '?';
    var p = src.split(/\s+/);
    return ((p[0] || '')[0] + ((p[1] || '')[0] || '')).toUpperCase();
  }
  function hue(key){ var h = 0; for (var i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) % 360; return h; }
  function avatar(c, big){
    return '<span class="vqc-av' + (big ? ' big' : '') + '" style="background:hsl(' + hue(c.key) + ',45%,88%);color:hsl(' + hue(c.key) + ',45%,28%)">' + esc(initials(c)) + '</span>';
  }
  function tags(c){
    return (c.segments || []).filter(function(s){ return SEG_TAG[s]; }).map(function(s){
      var t = SEG_TAG[s]; return '<span class="vqc-tag" style="color:' + t[1] + ';background:' + t[2] + '">' + t[0] + '</span>';
    }).join('') + (c.do_not_contact ? '<span class="vqc-tag" style="color:#b3261e;background:#fbe9e7">Do not contact</span>' : '')
      + (c.tags || []).map(function(t){ return '<span class="vqc-tag">' + esc(t) + '</span>'; }).join('');
  }
  function face(score){ return score == null ? '<span class="vqc-muted">—</span>' : '<span class="vqc-score" style="background:' + SCORE[score - 1] + '">' + FACES[score - 1] + ' ' + score + '/5</span>'; }
  function waLink(c){
    if (!/^\d{8,15}$/.test(c.key || '')) return '';
    return 'https://wa.me/' + c.key;
  }
  function detailPath(c){ return isCrm() ? '/' + encodeURIComponent(c.client_id) + '/' + encodeURIComponent(c.key) : '/' + encodeURIComponent(c.key); }

  function injectStyles(){
    if (document.getElementById('vqc-styles')) return;
    var el = document.createElement('style');
    el.id = 'vqc-styles';
    el.textContent = [
      '.vqc{--vqc-ink:var(--ink,#16151a);--vqc-muted:var(--muted,#6b645b);--vqc-line:var(--line,#e7e2d8);--vqc-brand:var(--teal,#2f56d9);--vqc-card:var(--card,#fff);color:var(--vqc-ink);}',
      '.vqc h2{font-size:19px;margin:0;font-weight:650;letter-spacing:-.01em}.vqc h3{font-size:14.5px;margin:0 0 2px;font-weight:650}',
      '.vqc .sub{font-size:12.5px;color:var(--vqc-muted);margin:2px 0 10px}',
      '.vqc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}',
      '.vqc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.vqc-card{background:var(--vqc-card);border:1px solid var(--vqc-line);border-radius:14px;padding:16px;margin-bottom:14px;min-width:0}',
      '.vqc-btn{border:1px solid var(--vqc-line);background:var(--vqc-card);color:var(--vqc-ink);border-radius:10px;padding:8px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.vqc-btn:hover{border-color:var(--vqc-brand)}.vqc-btn.primary{background:var(--vqc-brand);border-color:var(--vqc-brand);color:#fff}.vqc-btn:disabled{opacity:.5;cursor:default}',
      '.vqc-link{background:none;border:0;color:var(--vqc-brand);font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0}',
      '.vqc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}',
      '.vqc-kpi{background:var(--vqc-card);border:1px solid var(--vqc-line);border-radius:12px;padding:12px 14px;cursor:pointer;text-align:left;font:inherit;color:inherit}',
      '.vqc-kpi.static{cursor:default}.vqc-kpi.on{border-color:var(--vqc-brand);box-shadow:0 0 0 2px rgba(47,86,217,.12)}',
      '.vqc-kpi .l{font-size:12px;color:var(--vqc-muted);font-weight:600}.vqc-kpi .v{font-size:22px;font-weight:700;margin-top:2px;letter-spacing:-.02em}.vqc-kpi .f{font-size:11.5px;color:var(--vqc-muted);margin-top:2px}',
      '.vqc-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
      '.vqc-chip{border:1px solid var(--vqc-line);background:var(--vqc-card);border-radius:999px;padding:6px 11px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--vqc-ink)}',
      '.vqc-chip.on{background:var(--vqc-brand);border-color:var(--vqc-brand);color:#fff}.vqc-chip span{opacity:.7;margin-left:4px}',
      '.vqc input,.vqc select,.vqc textarea{font:inherit;font-size:13.5px;border:1px solid var(--vqc-line);border-radius:10px;padding:8px 10px;background:var(--vqc-card);color:var(--vqc-ink);box-sizing:border-box;max-width:100%}',
      '.vqc-filters{display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-bottom:12px}',
      '@media (max-width:640px){.vqc-filters{grid-template-columns:1fr 1fr}.vqc-filters input{grid-column:1/-1}}',
      '.vqc-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.vqc-table th{text-align:left;font-size:11.5px;color:var(--vqc-muted);font-weight:650;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:1px solid var(--vqc-line);white-space:nowrap}',
      '.vqc-table td{padding:10px;border-bottom:1px solid var(--vqc-line);vertical-align:middle}',
      '.vqc-table tr.r{cursor:pointer}.vqc-table tr.r:hover td{background:rgba(47,86,217,.04)}.vqc-table .n{text-align:right;white-space:nowrap}',
      '.vqc-who{display:flex;gap:10px;align-items:center;min-width:180px}.vqc-who b{display:block;font-size:13.5px}.vqc-who small{color:var(--vqc-muted);font-size:12px}',
      '.vqc-av{width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:none}',
      '.vqc-av.big{width:56px;height:56px;font-size:20px}',
      '.vqc-tag{display:inline-block;font-size:11px;font-weight:650;padding:2px 8px;border-radius:999px;margin:2px 4px 2px 0;background:#f1eee8;color:#4a453e;white-space:nowrap}',
      '.vqc-score{display:inline-block;color:#fff;font-size:11.5px;font-weight:650;padding:2px 8px;border-radius:999px;white-space:nowrap}',
      '.vqc-muted{color:var(--vqc-muted)}.vqc-empty{padding:28px 12px;text-align:center;color:var(--vqc-muted);font-size:13.5px}',
      '.vqc-hide-sm{}@media (max-width:760px){.vqc-hide-sm{display:none}}',
      '.vqc-detail{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px}@media (max-width:900px){.vqc-detail{grid-template-columns:1fr}}',
      '.vqc-head{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.vqc-head .t{flex:1;min-width:200px}.vqc-head .t h2{font-size:21px}',
      '.vqc-conv{border:1px solid var(--vqc-line);border-radius:12px;margin-bottom:8px;overflow:hidden}',
      '.vqc-conv .h{display:flex;gap:10px;align-items:center;padding:10px 12px;cursor:pointer;flex-wrap:wrap}.vqc-conv .h:hover{background:rgba(47,86,217,.04)}',
      '.vqc-conv .h .when{font-weight:650;font-size:13px}.vqc-conv .h .meta{font-size:12px;color:var(--vqc-muted);flex:1}',
      '.vqc-msgs{padding:10px 12px 14px;background:#faf8f4;border-top:1px solid var(--vqc-line);display:flex;flex-direction:column;gap:6px;max-height:520px;overflow:auto}',
      '.vqc-msg{max-width:82%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
      '.vqc-msg.customer{align-self:flex-start;background:#fff;border:1px solid var(--vqc-line)}.vqc-msg.agent{align-self:flex-end;background:#e8ecfd}',
      '.vqc-msg small{display:block;font-size:10.5px;color:var(--vqc-muted);margin-top:3px}',
      '.vqc-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.vqc-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--vqc-muted);min-width:0}',
      '.vqc-form input:not([type=checkbox]),.vqc-form select,.vqc-form textarea{width:100%}',
      '.vqc-form .full{grid-column:1/-1}.vqc-form textarea{min-height:80px;resize:vertical}',
      '.vqc-kv{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--vqc-line);font-size:13px}.vqc-kv:last-child{border:0}.vqc-kv span:first-child{color:var(--vqc-muted)}',
      '.vqc-ans{border-top:1px solid var(--vqc-line);padding:10px 0}.vqc-ans:first-of-type{border:0}.vqc-ans ul{margin:6px 0 0;padding-left:18px;font-size:12.5px}',
    ].join('\n');
    document.head.appendChild(el);
  }

  /* ------------------------------------------------------------------ */
  /* Loading                                                            */
  /* ------------------------------------------------------------------ */
  function query(){
    var p = [];
    if (isCrm() && st.clientId) p.push('client_id=' + encodeURIComponent(st.clientId));
    if (st.q) p.push('q=' + encodeURIComponent(st.q));
    if (st.segment !== 'all') p.push('segment=' + st.segment);
    if (st.city) p.push('city=' + encodeURIComponent(st.city));
    p.push('sort=' + st.sort, 'limit=' + st.limit);
    return '?' + p.join('&');
  }
  function loadList(){
    st.loading = true;
    var mine = query();
    return host.api('GET', mine).then(function(r){
      if (mine !== query()) return;
      st.list = r; st.loading = false; if (st.view === 'list') render();
    }).catch(function(e){ st.loading = false; st.list = { error: e.message || 'Could not load customers.' }; if (st.view === 'list') render(); });
  }
  function loadDetail(){
    var c = { key: st.key, client_id: st.keyClient };
    st.detail = null; render();
    host.api('GET', detailPath(c)).then(function(d){ st.detail = d; render(); })
      .catch(function(e){ st.detail = { error: e.message || 'Could not load this customer.' }; render(); });
  }

  /* ------------------------------------------------------------------ */
  /* The directory                                                      */
  /* ------------------------------------------------------------------ */
  function viewList(){
    var clients = isCrm() && host.clients ? host.clients() : [];
    // The CRM's page header already names the page; the portal's does not.
    var head = '<div class="vqc-top"><div>' + (isCrm() ? '' : '<h2>Customers</h2><div class="sub" style="margin:2px 0 0;">'
      + 'Everyone who has talked to your agents or left their details in a survey — who they are, how often they come back, and what they said.</div>')
      + '</div><div class="vqc-row">'
      + (isCrm() ? '<select data-c="client"><option value="">All clients</option>' + clients.map(function(c){ return '<option value="' + esc(c.id) + '"' + (st.clientId === c.id ? ' selected' : '') + '>' + esc(c.company) + '</option>'; }).join('') + '</select>' : '')
      + '<button class="vqc-btn" data-a="export" title="Every customer ever, with every detail, every conversation and every line said — a tab for each">⬇ All customers (Excel)</button>'
      + '</div></div>';
    var L = st.list;
    if (!L) return head + '<div class="vqc-card"><div class="vqc-empty">Loading customers…</div></div>';
    if (L.error) return head + '<div class="vqc-card"><div class="vqc-empty">' + esc(L.error) + '<br><br><button class="vqc-btn" data-a="reload">Try again</button></div></div>';
    var k = L.counts || {};
    var tile = function(seg, label, foot){
      return '<button class="vqc-kpi' + (st.segment === seg ? ' on' : '') + '" data-a="seg" data-seg="' + seg + '" title="' + esc(SEG_HINT[seg] || 'Everyone') + '"><div class="l">' + label + '</div><div class="v">' + n(k[seg]) + '</div><div class="f">' + foot + '</div></button>';
    };
    var cov = L.coverage || {};
    var kpis = '<div class="vqc-kpis">'
      + tile('all', 'Customers', cov.contacts ? n(cov.with_name) + ' known by name' : 'nobody yet')
      + tile('new', 'New', 'first contact, last 30 days')
      + tile('returning', 'Returning', 'came back at least once')
      + tile('vip', 'Regulars', '5 conversations or more')
      + tile('at_risk', 'At risk', 'quiet 60+ days')
      + tile('unhappy', 'Unhappy', 'last score 1–2 or NPS 0–6')
      + '</div>';
    var chips = '<div class="vqc-chips">' + SEGMENTS.map(function(s){
      return '<button class="vqc-chip' + (st.segment === s[0] ? ' on' : '') + '" data-a="seg" data-seg="' + s[0] + '" title="' + esc(SEG_HINT[s[0]] || '') + '">' + s[1] + '<span>' + n(k[s[0]]) + '</span></button>';
    }).join('') + '</div>';
    var cities = (L.cities || []);
    var filters = '<div class="vqc-filters">'
      + '<input data-c="q" type="search" placeholder="Search name, number, email, city, tag, note…" value="' + esc(st.q) + '" aria-label="Search customers">'
      + '<select data-c="city" aria-label="City"><option value="">Every city</option>' + cities.map(function(c){ return '<option value="' + esc(c.name) + '"' + (st.city === c.name ? ' selected' : '') + '>' + esc(c.name === '—' ? 'City not known' : c.name) + ' (' + n(c.n) + ')</option>'; }).join('') + '</select>'
      + '<select data-c="sort" aria-label="Sort"><option value="recent"' + (st.sort === 'recent' ? ' selected' : '') + '>Latest contact first</option><option value="most"' + (st.sort === 'most' ? ' selected' : '') + '>Most conversations</option><option value="oldest"' + (st.sort === 'oldest' ? ' selected' : '') + '>Longest-standing</option><option value="name"' + (st.sort === 'name' ? ' selected' : '') + '>Name A–Z</option></select>'
      + '</div>';
    var rows = L.contacts || [];
    var table = !rows.length
      ? '<div class="vqc-empty">' + (L.total ? 'Nobody matches — try another search or segment.' : 'No customers yet. As soon as someone messages ' + (isCrm() ? 'an agent' : 'your agent') + ' or answers a survey, they appear here.') + '</div>'
      : '<div style="overflow-x:auto;"><table class="vqc-table"><thead><tr><th>Customer</th>' + (isCrm() && !st.clientId ? '<th class="vqc-hide-sm">Customer of</th>' : '')
        + '<th class="vqc-hide-sm">City</th><th></th><th class="n">Conversations</th><th class="n">Last contact</th><th class="n vqc-hide-sm">Satisfaction</th></tr></thead><tbody>'
        + rows.map(function(c, i){
          return '<tr class="r" data-a="open" data-i="' + i + '"><td><div class="vqc-who">' + avatar(c) + '<div><b>' + esc(c.name || c.label) + '</b><small>' + esc(c.name ? c.label : (c.email || c.country || '')) + (c.email && c.name ? ' · ' + esc(c.email) : '') + '</small></div></div></td>'
            + (isCrm() && !st.clientId ? '<td class="vqc-hide-sm">' + esc(c.client_company) + '</td>' : '')
            + '<td class="vqc-hide-sm">' + (c.city ? esc(c.city) : '<span class="vqc-muted">—</span>') + '</td>'
            + '<td>' + tags(c) + '</td>'
            + '<td class="n"><b>' + n(c.conversations) + '</b>' + (c.conversations_30d ? '<div class="vqc-muted" style="font-size:11.5px">' + n(c.conversations_30d) + ' this month</div>' : '') + '</td>'
            + '<td class="n">' + esc(ago(c.last_at)) + '</td>'
            + '<td class="n vqc-hide-sm">' + face(c.last_score) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        + (L.matching > rows.length ? '<div style="text-align:center;margin-top:12px;"><button class="vqc-btn" data-a="more">Show more (' + n(L.matching - rows.length) + ' more)</button></div>' : '');
    return head + kpis + '<div class="vqc-card">' + chips + filters
      + '<div class="sub" style="margin:0 0 6px;">' + n(L.matching) + ' of ' + n(L.total) + ' customers' + (st.loading ? ' · updating…' : '') + '</div>'
      + table + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* One customer                                                       */
  /* ------------------------------------------------------------------ */
  function viewDetail(){
    var back = '<div style="margin:0 0 12px;"><button class="vqc-link" data-a="back">← All customers</button></div>';
    var d = st.detail;
    if (!d) return back + '<div class="vqc-card"><div class="vqc-empty">Loading…</div></div>';
    if (d.error) return back + '<div class="vqc-card"><div class="vqc-empty">' + esc(d.error) + '</div></div>';
    var wa = waLink(d);
    var head = '<div class="vqc-card"><div class="vqc-head">' + avatar(d, true)
      + '<div class="t"><h2>' + esc(d.name || d.label) + '</h2><div class="sub" style="margin:2px 0 4px;">' + esc([d.name ? d.label : '', d.email, d.city, d.country].filter(Boolean).join(' · '))
      + (isCrm() ? ' · customer of <b>' + esc(d.client_company) + '</b>' : '') + '</div><div>' + tags(d) + '</div></div>'
      + '<div class="vqc-row">'
      + (wa && !d.do_not_contact ? '<a class="vqc-btn" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '')
      + (d.email && !d.do_not_contact ? '<a class="vqc-btn" href="mailto:' + esc(d.email) + '">Email</a>' : '')
      + '</div></div></div>';
    var kpi = function(l, v, f){ return '<div class="vqc-kpi static"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="f">' + (f || '') + '</div></div>'; };
    var kpis = '<div class="vqc-kpis">'
      + kpi('Conversations', n(d.conversations), d.conversations_30d ? n(d.conversations_30d) + ' in the last 30 days' : '')
      + kpi('Messages', n(d.messages), d.conversations ? 'about ' + Math.round(d.messages / d.conversations) + ' per conversation' + (d.avg_minutes ? ', ' + d.avg_minutes + ' min' : '') : '')
      + kpi('First contact', esc(day(d.first_at)), d.first_at ? esc(ago(d.first_at)) : 'from a survey')
      + kpi('Last contact', esc(ago(d.last_at)), d.avg_gap_days != null ? 'back every ' + d.avg_gap_days + ' days on average' : '')
      + kpi('Satisfaction', d.last_score != null ? FACES[d.last_score - 1] + ' ' + d.last_score + '/5' : '—', d.answers ? n(d.answers) + ' answers' + (d.avg_score != null ? ' · avg ' + d.avg_score : '') : 'no answers yet')
      + kpi('Handed to a person', n(d.handoffs), d.agent ? 'agent: ' + esc(d.agent) : '')
      + '</div>';
    var convs = d.conversations_list || [];
    var timeline = '<div class="vqc-card"><h3>Conversations</h3><div class="sub">Newest first' + (d.has_transcripts ? ' · tap one to read what was said' : ' · this agent does not send its messages to the CRM yet, so there is no transcript') + '</div>'
      + (!convs.length ? '<div class="vqc-empty">No conversations — known from a survey only.</div>' : convs.map(function(cv, i){
        var open = st.openConv === i;
        var lines = cv.transcript || [];
        return '<div class="vqc-conv"><div class="h" data-a="conv" data-i="' + i + '"><span class="when">' + esc(when(cv.started)) + '</span>'
          + '<span class="meta">' + esc([cv.visit ? (cv.visit === 1 ? 'First contact' : 'Visit ' + cv.visit) : '', cv.channel, cv.agent, n(cv.messages) + ' messages', cv.minutes ? cv.minutes + ' min' : ''].filter(Boolean).join(' · '))
          + (cv.handoff ? ' · handed to a person' : '') + '</span>'
          + (lines.length ? '<span class="vqc-tag">' + lines.length + ' lines ' + (open ? '▴' : '▾') + '</span>' : '') + '</div>'
          + (open && lines.length ? '<div class="vqc-msgs">' + lines.map(function(m){ return '<div class="vqc-msg ' + (m.role === 'agent' ? 'agent' : 'customer') + '">' + esc(m.content) + '<small>' + (m.role === 'agent' ? 'Agent' : 'Customer') + ' · ' + esc(when(m.at)) + '</small></div>'; }).join('') + '</div>' : '')
          + '</div>';
      }).join('')) + '</div>';
    var answers = (d.survey_responses || []);
    var other = (d.other_answers || []);
    var surveyCard = '<div class="vqc-card"><h3>Survey answers</h3><div class="sub">What they told you in Vantriq Echo</div>'
      + (!answers.length && !other.length ? '<div class="vqc-empty" style="padding:14px;">No survey answers yet.</div>' : '')
      + answers.map(function(r){
        return '<div class="vqc-ans"><div class="vqc-row" style="justify-content:space-between;"><b style="font-size:13px;">' + esc(r.survey) + '</b><span class="vqc-muted" style="font-size:12px;">' + esc(when(r.submitted_at)) + '</span></div>'
          + '<div style="margin-top:4px;">' + (r.score != null ? face(r.score) + ' ' : '') + (r.nps != null ? '<span class="vqc-score" style="background:' + (r.nps <= 6 ? SCORE[0] : r.nps <= 8 ? SCORE[2] : SCORE[4]) + '">NPS ' + r.nps + '</span> ' : '')
          + (r.followup && r.followup !== 'none' ? '<span class="vqc-tag">Follow-up: ' + esc(r.followup) + '</span>' : '') + '</div>'
          + '<ul>' + (r.readable || []).map(function(x){ return '<li><span class="vqc-muted">' + esc(x.question) + '</span> — ' + esc(x.answer) + '</li>'; }).join('') + '</ul></div>';
      }).join('')
      + other.map(function(r){
        return '<div class="vqc-ans"><div class="vqc-row" style="justify-content:space-between;"><b style="font-size:13px;">' + esc(r.source || 'Satisfaction answer') + '</b><span class="vqc-muted" style="font-size:12px;">' + esc(when(r.responded_at)) + '</span></div>'
          + '<div style="margin-top:4px;">' + face(r.score) + (r.nps != null ? ' <span class="vqc-score" style="background:#6b645b">NPS ' + r.nps + '</span>' : '') + '</div>' + (r.comment ? '<div style="font-size:13px;margin-top:4px;">“' + esc(r.comment) + '”</div>' : '') + '</div>';
      }).join('') + '</div>';
    var cityList = '<datalist id="vqc-cities">' + CITIES.map(function(c){ return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>';
    var profile = '<div class="vqc-card"><h3>Profile</h3><div class="sub">' + (d.edited_by ? 'Last edited by ' + esc(d.edited_by) + ' · ' + esc(ago(d.edited_at)) : 'Filled in automatically from WhatsApp, the agent and surveys — correct or add anything.') + '</div>'
      + '<form class="vqc-form" data-f="profile">'
      + '<label>Name<input name="name" maxlength="120" value="' + esc(d.name) + '"></label>'
      + '<label>Phone<input name="phone" maxlength="40" value="' + esc(d.phone) + '"></label>'
      + '<label>Email<input name="email" type="email" maxlength="200" value="' + esc(d.email) + '"></label>'
      + '<label>City<input name="city" list="vqc-cities" maxlength="60" value="' + esc(d.city) + '">' + cityList + '</label>'
      + '<label>Gender<select name="gender">' + GENDERS.map(function(g){ return '<option value="' + esc(g) + '"' + (d.gender === g ? ' selected' : '') + '>' + (g || '—') + '</option>'; }).join('') + (d.gender && GENDERS.indexOf(d.gender) < 0 ? '<option selected>' + esc(d.gender) + '</option>' : '') + '</select></label>'
      + '<label>Age group<select name="age_band">' + AGES.map(function(g){ return '<option value="' + esc(g) + '"' + (d.age_band === g ? ' selected' : '') + '>' + (g || '—') + '</option>'; }).join('') + (d.age_band && AGES.indexOf(d.age_band) < 0 ? '<option selected>' + esc(d.age_band) + '</option>' : '') + '</select></label>'
      + '<label class="full">Their company<input name="company" maxlength="160" value="' + esc(d.company) + '"></label>'
      + '<label class="full">Tags <em style="font-weight:400">— comma between each</em><input name="tags" maxlength="400" value="' + esc((d.tags || []).join(', ')) + '"></label>'
      + '<label class="full">Notes<textarea name="notes" maxlength="4000">' + esc(d.notes) + '</textarea></label>'
      + '<label class="full" style="flex-direction:row;align-items:center;gap:8px;color:inherit;font-weight:500;"><input type="checkbox" name="do_not_contact"' + (d.do_not_contact ? ' checked' : '') + '> Do not contact — they asked not to be messaged</label>'
      + '<div class="full"><button class="vqc-btn primary" type="submit"' + (st.saving ? ' disabled' : '') + '>' + (st.saving ? 'Saving…' : 'Save profile') + '</button></div>'
      + '</form></div>';
    var facts = '<div class="vqc-card"><h3>At a glance</h3>'
      + [['Status', d.status], ['Country', d.country || '—'], ['Channels', (d.channels || []).join(', ') || '—'], ['Agent', d.agent || '—'],
        ['First contact', when(d.first_at)], ['Last contact', when(d.last_at)], ['Last NPS', d.last_nps != null ? d.last_nps : '—']]
        .concat(d.in_crm ? [['In the CRM as', d.in_crm]] : [])
        .map(function(kv){ return '<div class="vqc-kv"><span>' + esc(kv[0]) + '</span><span>' + esc(kv[1]) + '</span></div>'; }).join('') + '</div>';
    return back + head + kpis + '<div class="vqc-detail"><div>' + timeline + surveyCard + '</div><div>' + profile + facts + '</div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                             */
  /* ------------------------------------------------------------------ */
  function render(){
    if (!root) return;
    injectStyles();
    var focused = document.activeElement && root.contains(document.activeElement) && document.activeElement.getAttribute('data-c') === 'q';
    var caret = focused ? document.activeElement.selectionStart : null;
    root.innerHTML = '<div class="vqc">' + (st.view === 'detail' ? viewDetail() : viewList()) + '</div>';
    if (focused) {
      var inp = root.querySelector('[data-c="q"]');
      if (inp) { inp.focus(); try { inp.setSelectionRange(caret, caret); } catch (e) {} }
    }
  }
  function onClick(e){
    var b = e.target.closest('[data-a]');
    if (!b || !root.contains(b)) return;
    var a = b.getAttribute('data-a');
    if (a === 'seg') { st.segment = b.getAttribute('data-seg'); st.limit = PAGE; loadList(); render(); }
    else if (a === 'more') { st.limit += PAGE; loadList(); }
    else if (a === 'reload') { st.list = null; render(); loadList(); }
    else if (a === 'open') {
      var c = st.list.contacts[Number(b.getAttribute('data-i'))];
      st.view = 'detail'; st.key = c.key; st.keyClient = c.client_id; st.openConv = 0; loadDetail();
      try { window.scrollTo(0, 0); } catch (err) {}
    }
    else if (a === 'back') { st.view = 'list'; st.detail = null; render(); loadList(); }
    else if (a === 'conv') { var i = Number(b.getAttribute('data-i')); st.openConv = st.openConv === i ? null : i; render(); }
    else if (a === 'export') {
      var client = isCrm() && st.clientId ? (host.clients() || []).find(function(x){ return x.id === st.clientId; }) : null;
      var tag = client ? String(client.company).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) : (isCrm() ? 'all' : 'all');
      host.download('/export.xlsx' + (isCrm() && st.clientId ? '?client_id=' + encodeURIComponent(st.clientId) : ''),
        'vantriq-customers-' + tag + '-' + new Date().toISOString().slice(0, 10) + '.xlsx')
        .catch(function(err){ toast(err.message || 'Could not build the workbook.', true); });
    }
  }
  function onInput(e){
    var el = e.target;
    if (el.getAttribute('data-c') !== 'q') return;
    st.q = el.value;
    clearTimeout(timer);
    timer = setTimeout(function(){ st.limit = PAGE; loadList(); }, 280);
  }
  function onChange(e){
    var el = e.target, c = el.getAttribute('data-c');
    if (c === 'city') { st.city = el.value; st.limit = PAGE; loadList(); }
    else if (c === 'sort') { st.sort = el.value; loadList(); }
    else if (c === 'client') { st.clientId = el.value; st.city = ''; st.list = null; render(); loadList(); }
  }
  function onSubmit(e){
    var f = e.target;
    if (f.getAttribute('data-f') !== 'profile') return;
    e.preventDefault();
    var fd = new FormData(f);
    var body = { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), city: fd.get('city'), gender: fd.get('gender'),
      age_band: fd.get('age_band'), company: fd.get('company'), notes: fd.get('notes'), do_not_contact: fd.get('do_not_contact') === 'on',
      tags: String(fd.get('tags') || '').split(',').map(function(t){ return t.trim(); }).filter(Boolean) };
    st.saving = true; render();
    host.api('PATCH', detailPath(st.detail), body).then(function(d){ st.saving = false; st.detail = d; render(); toast('Profile saved'); })
      .catch(function(err){ st.saving = false; render(); toast(err.message || 'Could not save.', true); });
  }

  function mount(el, adapter){
    host = adapter;
    if (root !== el) {
      root = el;
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      el.addEventListener('change', onChange);
      el.addEventListener('submit', onSubmit);
    }
    render();
    if (st.view === 'list') loadList();
    else if (!st.detail) loadDetail();
  }
  function open(key, clientId){
    st.view = 'detail'; st.key = key; st.keyClient = clientId || null; st.openConv = 0;
    if (root) loadDetail();
  }
  function reset(){ st = fresh(); root = null; }

  window.VQC = { mount: mount, open: open, reset: reset };
})();
