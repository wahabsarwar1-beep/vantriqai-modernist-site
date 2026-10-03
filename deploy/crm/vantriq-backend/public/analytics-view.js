/*
 * VantriqAI analytics — the one renderer behind the portal's Analytics tab
 * and the CRM's Analytics view, so a customer and the staff looking at that
 * customer see the same page drawn from the same numbers.
 *
 * Plain script, no build step, like the rest of /public. It exposes a single
 * global, VQA, and reads the host page's own CSS variables (--teal, --muted,
 * --border, …) so it wears whichever page it sits in.
 *
 * Chart rules followed throughout: one axis per chart (never two scales on
 * one plot), thin marks with 4px rounded ends, hairline grids, a legend
 * whenever there are two series, colour that follows the thing not its rank,
 * and every value reachable without hovering (labels or the table view).
 */
(function(){
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Palette                                                            */
  /* ------------------------------------------------------------------ */
  // Two-series categorical pair (brand cobalt, brand amber) — validated for
  // colour-vision deficiency on the white card surface.
  const C = {
    s1: '#2f56d9', s1soft: '#a9bbf7', s2: '#c06b3a',
    grid: '#efece6', axis: '#8d857a', ink: '#16151a', muted: '#6b645b',
    good: '#2f7d5f', bad: '#b4402f',
  };
  // Sequential ramp for the heatmap: one hue, light to dark.
  const HEAT = ['#f6f4ef', '#e3e9fc', '#c5d2f8', '#9db2f2', '#6f8de8', '#3f63dc', '#2346b8', '#1a3284'];
  // Diverging for 1–5 scores: red through a neutral grey to blue.
  const SCORE = ['#b4402f', '#d98676', '#bdb7ad', '#7f9bf2', '#2f56d9'];
  // Ordinal ramp for the funnel — lightest step still clears 2:1 on white.
  const FUNNEL = ['#7f9bf2', '#5f7fe6', '#3f63dc', '#2a4cc4', '#1f3a95'];

  const CHANNELS = { whatsapp:'WhatsApp', web:'Web chat', website:'Website', instagram:'Instagram', voice:'Voice', facebook:'Facebook', email:'Email',
    qr:'QR code', link:'Survey link', kiosk:'Kiosk', sms:'SMS', embed:'Website survey' };
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const GRAINS = [['day','Day'],['week','Week'],['month','Month'],['quarter','Quarter'],['year','Year']];

  let charts = [];
  let lastSeries = null; // what "See every figure as a table" shows

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                      */
  /* ------------------------------------------------------------------ */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function n(v){ return v == null ? '—' : Math.round(v).toLocaleString('en-US'); }
  function compact(v){
    if(v == null) return '—';
    const a = Math.abs(v);
    if(a >= 1e6) return (v/1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/,'') + 'M';
    if(a >= 1e4) return (v/1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/,'') + 'K';
    return Math.round(v).toLocaleString('en-US');
  }
  function money(v){ return 'PKR ' + compact(v); }

  function bucketLabel(bucket, grain, long){
    const [y, m, d] = bucket.split('-').map(Number);
    if(grain === 'day') return `${d} ${MONTHS[m-1]}`;
    if(grain === 'week') return long ? `Week of ${d} ${MONTHS[m-1]}` : `${d} ${MONTHS[m-1]}`;
    if(grain === 'month') return long ? `${MONTHS[m-1]} ${y}` : `${MONTHS[m-1]} ’${String(y).slice(2)}`;
    if(grain === 'quarter') return `Q${Math.floor((m-1)/3)+1} ${y}`;
    return String(y);
  }
  function hourLabel(h){ return `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`; }

  /* ------------------------------------------------------------------ */
  /* Styles                                                             */
  /* ------------------------------------------------------------------ */
  function injectStyles(){
    if(document.getElementById('vqa-styles')) return;
    const css = `
.vqa{--vqa-gap:14px;display:block;}
.vqa *{box-sizing:border-box;}
.vqa-filters{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:0 0 16px;}
.vqa-seg{display:inline-flex;background:var(--card,#fff);border:1px solid var(--border,#e7e2da);border-radius:999px;padding:3px;gap:2px;}
.vqa-seg button{border:0;background:transparent;font:inherit;font-size:12.5px;font-weight:600;color:var(--muted,#6b645b);padding:7px 13px;border-radius:999px;cursor:pointer;}
.vqa-seg button:hover{background:var(--border-2,#f0ece5);color:var(--text,#16151a);}
.vqa-seg button.on{background:var(--teal,#2f56d9);color:#fff;}
.vqa-note{font-size:12px;color:var(--muted,#6b645b);flex:1 1 220px;}
.vqa-btn{border:1px solid var(--border,#e7e2da);background:var(--card,#fff);font:inherit;font-size:12.5px;font-weight:600;color:var(--text,#16151a);padding:7px 12px;border-radius:10px;cursor:pointer;}
.vqa-btn:hover{border-color:var(--teal,#2f56d9);color:var(--teal,#2f56d9);}
.vqa-card{background:var(--card,#fff);border:1px solid var(--border,#e7e2da);border-radius:var(--radius,14px);padding:16px 18px;box-shadow:var(--shadow-sm,none);min-width:0;}
.vqa-card h3{font-family:var(--f-head,inherit);font-size:14px;font-weight:600;margin:0 0 2px;color:var(--text,#16151a);}
.vqa-card .vqa-sub{font-size:12px;color:var(--muted,#6b645b);margin:0 0 12px;}
.vqa-grid{display:grid;gap:var(--vqa-gap);margin-bottom:var(--vqa-gap);}
.vqa-kpis{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));}
.vqa-two{grid-template-columns:repeat(auto-fit,minmax(300px,1fr));}
.vqa-kpi{padding:14px 16px 12px;}
.vqa-kpi .l{font-size:12px;color:var(--muted,#6b645b);font-weight:600;}
.vqa-kpi .v{font-family:var(--f-head,inherit);font-size:26px;font-weight:600;letter-spacing:-.02em;margin:4px 0 4px;color:var(--text,#16151a);line-height:1.1;}
.vqa-kpi .v small{font-size:13px;font-weight:600;color:var(--muted,#6b645b);letter-spacing:0;margin-left:2px;}
.vqa-kpi .d{font-size:11.5px;color:var(--muted,#6b645b);display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.vqa-kpi .p{font-size:11.5px;color:var(--muted,#6b645b);margin-top:3px;}
.vqa-chip{display:inline-flex;align-items:center;gap:3px;font-weight:700;border-radius:6px;padding:1px 6px;font-size:11.5px;}
.vqa-chip.good{color:${C.good};background:#e4f2eb;}
.vqa-chip.bad{color:${C.bad};background:#fbe8e4;}
.vqa-chip.flat{color:var(--muted,#6b645b);background:var(--border-2,#f0ece5);}
.vqa-spark{display:block;width:100%;height:28px;margin-top:8px;}
.vqa-plot{position:relative;height:230px;}
.vqa-plot.sm{height:190px;}
.vqa-insights{list-style:none;margin:0;padding:0;display:grid;gap:8px;}
.vqa-insights li{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.45;color:var(--text,#16151a);}
.vqa-ic{flex:0 0 20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}
.vqa-ic.up{background:#e4f2eb;color:${C.good};}
.vqa-ic.down{background:#fbe8e4;color:${C.bad};}
.vqa-ic.warn{background:#fbeee4;color:#94512b;}
.vqa-ic.info{background:#e8ecfd;color:#1f3a95;}
.vqa-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--muted,#6b645b);margin:0 0 8px;}
.vqa-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;}
.vqa-bars{display:grid;gap:10px;}
.vqa-bar{display:grid;grid-template-columns:minmax(90px,34%) 1fr auto;gap:10px;align-items:center;font-size:12.5px;}
.vqa-bar .nm{color:var(--text,#16151a);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.vqa-bar .tr{height:10px;background:var(--border-2,#f0ece5);border-radius:0 4px 4px 0;overflow:hidden;}
.vqa-bar .fl{height:100%;border-radius:0 4px 4px 0;min-width:2px;}
.vqa-bar .vl{color:var(--text,#16151a);font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;text-align:right;}
.vqa-bar .vl span{color:var(--muted,#6b645b);font-weight:500;margin-left:4px;}
.vqa-heat{display:grid;grid-template-columns:32px repeat(24,minmax(0,1fr));gap:2px;font-size:10.5px;color:var(--muted,#6b645b);}
.vqa-heat .c{aspect-ratio:1/1;border-radius:3px;min-height:9px;}
.vqa-heat .c:hover{outline:2px solid ${C.ink};outline-offset:0;}
.vqa-heat .rl{display:flex;align-items:center;}
.vqa-heat .hl{text-align:left;white-space:nowrap;overflow:visible;}
.vqa-scale{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted,#6b645b);margin-top:10px;}
.vqa-scale i{display:inline-block;width:16px;height:10px;border-radius:2px;}
.vqa-stack{display:flex;height:14px;gap:2px;border-radius:4px;overflow:hidden;margin:6px 0 10px;}
.vqa-stack div{height:100%;}
.vqa-big{font-family:var(--f-head,inherit);font-size:34px;font-weight:600;letter-spacing:-.02em;line-height:1;}
.vqa-feedback{display:grid;gap:10px;}
.vqa-fb{border-top:1px solid var(--border-2,#f0ece5);padding-top:10px;font-size:13px;}
.vqa-fb:first-child{border-top:0;padding-top:0;}
.vqa-fb .m{font-size:11.5px;color:var(--muted,#6b645b);margin-top:3px;}
.vqa-meter{height:10px;border-radius:999px;background:#e8ecfd;overflow:hidden;margin:10px 0 6px;position:relative;}
.vqa-meter .f{height:100%;background:${C.s1};border-radius:999px;}
.vqa-meter .f.warn{background:#c06b3a;}
.vqa-meter .pace{position:absolute;top:-3px;bottom:-3px;width:2px;background:${C.ink};}
.vqa-empty{font-size:13px;color:var(--muted,#6b645b);line-height:1.55;}
.vqa-table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px;}
.vqa-table th,.vqa-table td{padding:7px 8px;border-bottom:1px solid var(--border-2,#f0ece5);text-align:right;font-variant-numeric:tabular-nums;}
.vqa-table th:first-child,.vqa-table td:first-child{text-align:left;}
.vqa-table th{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted,#6b645b);font-weight:700;}
.vqa details summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--teal,#2f56d9);}
.vqa-tablewrap{overflow-x:auto;}
.vqe-break td{vertical-align:middle;}.vqe-break td:nth-child(2){text-align:left;}.vqe-break th:nth-child(2){text-align:left;}.vqe-break tr.muted td{color:var(--muted,#6b645b);}
.vqe-mini{display:inline-block;vertical-align:middle;width:calc(100% - 64px);max-width:180px;height:8px;border-radius:4px;background:#f0ece5;overflow:hidden;margin-right:6px;}
.vqe-mini div{height:100%;border-radius:4px;}.vqe-n{font-size:11.5px;color:var(--muted,#6b645b);white-space:nowrap;}
.vqe-pill{display:inline-block;color:#fff;font-weight:700;font-size:11.5px;padding:2px 8px;border-radius:999px;min-width:38px;text-align:center;}
.vqe-words{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;}.vqe-words span{border:1px solid;border-radius:999px;padding:3px 11px;font-weight:600;background:#fff;}
.vqe-words small{opacity:.65;font-weight:500;font-size:11px;}
.vqa-section{font-family:var(--f-head,inherit);font-size:15px;font-weight:600;margin:22px 0 10px;color:var(--text,#16151a);}
@media (max-width:520px){.vqa-kpi .v{font-size:22px;}.vqa-bar{grid-template-columns:1fr auto;row-gap:5px;}.vqa-bar .tr{grid-column:1/-1;order:3;}}
`;
    const el = document.createElement('style');
    el.id = 'vqa-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ------------------------------------------------------------------ */
  /* Building blocks                                                    */
  /* ------------------------------------------------------------------ */
  /**
   * The period switch, the comparison note, and — when the page says how to
   * get it (opts.onReport, a global function's name) — the Excel report:
   * every figure here plus the people, conversations and answers behind them.
   */
  function filters(grain, onGrain, note, opts){
    opts = opts || {};
    return `<div class="vqa-filters">
      <div class="vqa-seg" role="group" aria-label="Period">
        ${GRAINS.map(([g, l]) => `<button type="button" class="${g === grain ? 'on' : ''}" aria-pressed="${g === grain}" onclick="${onGrain}('${g}')">${l}</button>`).join('')}
      </div>
      <div class="vqa-note">${note}</div>
      ${opts.onReport ? `<button type="button" class="vqa-btn" onclick="${opts.onReport}()" title="${esc(opts.reportHint || 'Every figure on this page, and the people and conversations behind them — a tab for each')}">${esc(opts.reportLabel || 'Download report (Excel)')}</button>` : ''}
    </div>`;
  }

  function compareNote(d){
    return `${esc(d.period.current_label)} so far (${d.period.elapsed_pct}% through) compared with ${esc(d.period.previous_label)} up to the same point · ${esc(d.time_zone.replace('Asia/', ''))} time`;
  }

  /** Delta chip. goodWhenUp=false for things like "lost". */
  function chip(delta, { unit = '%', goodWhenUp = true, prevLabel = '' } = {}){
    if(delta == null) return `<span class="vqa-chip flat">new</span>`;
    // goodWhenUp === null: a change that is neither good nor bad in itself.
    if(goodWhenUp === null && delta !== 0){
      const val = unit === 'pts' ? `${Math.abs(delta)} pts` : `${Math.abs(delta)}%`;
      return `<span class="vqa-chip flat">${delta > 0 ? '▲' : '▼'} ${val}</span>${prevLabel ? ` vs ${esc(prevLabel)}` : ''}`;
    }
    if(delta === 0) return `<span class="vqa-chip flat">no change</span>${prevLabel ? ` vs ${esc(prevLabel)}` : ''}`;
    const up = delta > 0;
    const good = up === goodWhenUp;
    const val = unit === 'pts' ? `${Math.abs(delta)} pts` : `${Math.abs(delta)}%`;
    return `<span class="vqa-chip ${good ? 'good' : 'bad'}" aria-label="${up ? 'up' : 'down'} ${val}">${up ? '▲' : '▼'} ${val}</span>${prevLabel ? ` vs ${esc(prevLabel)}` : ''}`;
  }

  function spark(values){
    const v = (values || []).map(x => (x == null ? null : Number(x)));
    const pts = v.filter(x => x != null);
    if(pts.length < 2) return '';
    const max = Math.max(...pts), min = Math.min(...pts, 0);
    const W = 100, H = 28, pad = 3;
    const xy = v.map((y, i) => y == null ? null : [ (i / (v.length - 1)) * W, H - pad - ((y - min) / ((max - min) || 1)) * (H - pad * 2) ]);
    const path = xy.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const last = xy.filter(Boolean).pop();
    return `<svg class="vqa-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}" fill="none" stroke="${C.s1soft}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${C.s1}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  function kpi({ label, value, unit = '', delta, deltaUnit, goodWhenUp, prevLabel, projected, sparkValues, foot }){
    return `<div class="vqa-card vqa-kpi">
      <div class="l">${esc(label)}</div>
      <div class="v">${value}${unit ? `<small>${unit}</small>` : ''}</div>
      <div class="d">${delta === undefined ? '' : chip(delta, { unit: deltaUnit, goodWhenUp, prevLabel })}</div>
      ${projected != null ? `<div class="p">On pace for ${n(projected)}</div>` : ''}
      ${foot ? `<div class="p">${foot}</div>` : ''}
      ${spark(sparkValues)}
    </div>`;
  }

  function insightsCard(list){
    if(!list || !list.length) return '';
    const icon = { up: '▲', down: '▼', warn: '!', info: '•' };
    return `<div class="vqa-card" style="margin-bottom:14px;">
      <h3>What stands out</h3>
      <div class="vqa-sub">Worked out from the figures below — nothing here is guessed.</div>
      <ul class="vqa-insights">
        ${list.map(i => `<li><span class="vqa-ic ${esc(i.tone)}" aria-label="${esc(i.tone)}">${icon[i.tone] || '•'}</span><span>${esc(i.text)}</span></li>`).join('')}
      </ul>
    </div>`;
  }

  /** Horizontal bars as HTML — labels always visible, no hover needed. */
  function barList(rows, { color = C.s1, colors, valueFmt = n, extra } = {}){
    if(!rows.length) return `<div class="vqa-empty">Nothing recorded in this period yet.</div>`;
    const max = Math.max(...rows.map(r => r.value), 1);
    return `<div class="vqa-bars">${rows.map((r, i) => `
      <div class="vqa-bar" title="${esc(r.name)}: ${esc(valueFmt(r.value))}${r.share != null ? ` (${r.share}%)` : ''}">
        <div class="nm">${esc(r.name)}</div>
        <div class="tr"><div class="fl" style="width:${(r.value / max) * 100}%;background:${colors ? colors[i] : color};"></div></div>
        <div class="vl">${esc(valueFmt(r.value))}${r.share != null ? `<span>${r.share}%</span>` : ''}${extra ? `<span>${esc(extra(r))}</span>` : ''}</div>
      </div>`).join('')}</div>`;
  }

  /** Where the people are: cities from their profiles, countries from their numbers, and how much is known. */
  function whereHTML(d, audience){
    if(!d.cities || !d.profile_coverage) return '';
    const cov = d.profile_coverage;
    const grey = '#bdb7ad';
    const rows = (list) => list.slice(0, 8).map(x => ({ name: x.name, value: x.contacts, share: x.share_pct, known: x.known }));
    const colorsOf = (list) => list.slice(0, 8).map(x => x.known ? C.s1 : grey);
    const where = audience === 'portal' ? 'on their page under Customers' : 'on their profile (Customers)';
    return `<div class="vqa-grid vqa-two">
      <div class="vqa-card">
        <h3>Where your customers are</h3>
        <div class="vqa-sub">People who messaged, by city · ${esc(d.period.window_label)} · ${n(cov.with_city)} of ${n(cov.contacts)} known</div>
        ${barList(rows(d.cities), { colors: colorsOf(d.cities) })}
        <div class="vqa-sub" style="margin:10px 0 0;">A city comes from what the customer tells your agent or a survey, or what you add ${where}.</div>
      </div>
      <div class="vqa-card">
        <h3>Countries</h3>
        <div class="vqa-sub">From the number they wrote from · ${esc(d.period.window_label)}</div>
        ${barList(rows(d.countries), { colors: colorsOf(d.countries) })}
        <div class="vqa-sub" style="margin:10px 0 0;">Known about them: name ${n(cov.with_name)} · email ${n(cov.with_email)} · city ${n(cov.with_city)} — of ${n(cov.contacts)} people.</div>
      </div>
    </div>`;
  }

  function heatmap(grid, windowLabel){
    const max = Math.max(...grid.flat(), 0);
    const step = (v) => v === 0 ? HEAT[0] : HEAT[Math.min(HEAT.length - 1, 1 + Math.floor((v / max) * (HEAT.length - 1.001)))];
    let html = `<div class="vqa-heat" role="img" aria-label="Conversations started by day of week and hour, ${esc(windowLabel)}"><div></div>`;
    for(let h = 0; h < 24; h++) html += `<div class="hl">${h % 6 === 0 ? hourLabel(h) : ''}</div>`;
    grid.forEach((row, d) => {
      html += `<div class="rl">${DAYS[d]}</div>`;
      row.forEach((v, h) => { html += `<div class="c" style="background:${step(v)}" title="${DAYS[d]} ${hourLabel(h)}–${hourLabel((h + 1) % 24)}: ${n(v)} conversation${v === 1 ? '' : 's'}"></div>`; });
    });
    html += `</div><div class="vqa-scale">Fewer ${HEAT.map(c => `<i style="background:${c}"></i>`).join('')} More${max ? ` · busiest hour: ${n(max)}` : ''}</div>`;
    return html;
  }

  function table(headers, rows){
    return `<div class="vqa-tablewrap"><table class="vqa-table">
      <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function legend(items){
    return `<div class="vqa-legend">${items.map(([label, color]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join('')}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Chart.js                                                           */
  /* ------------------------------------------------------------------ */
  function chartReady(){
    if(typeof Chart !== 'undefined') return true;
    document.querySelectorAll('.vqa canvas').forEach(el => {
      const note = document.createElement('div');
      note.className = 'vqa-empty';
      note.textContent = 'This browser blocked the chart library — every figure is still in the table below.';
      el.parentNode.replaceWith(note);
    });
    return false;
  }

  function baseOptions(extra){
    return Object.assign({
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#16151a', padding: 10, cornerRadius: 8, titleFont: { weight: '600' }, boxPadding: 4 },
      },
      scales: {
        x: { grid: { display: false }, border: { color: '#ddd8cf' }, ticks: { color: C.axis, maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: C.grid, drawTicks: false }, border: { display: false },
             ticks: { color: C.axis, padding: 8, precision: 0, font: { size: 11 }, callback: v => compact(v) } },
      },
    }, extra || {});
  }

  function mount(id, cfg){
    const el = document.getElementById(id);
    if(!el) return;
    charts.push(new Chart(el, cfg));
  }

  function destroyCharts(){ charts.forEach(c => c.destroy()); charts = []; }

  /** Columns over time; the current, unfinished period is drawn lighter. */
  function columnChart(id, series, key, label, grain){
    const labels = series.map(s => bucketLabel(s.bucket, grain));
    const last = series.length - 1;
    mount(id, {
      type: 'bar',
      data: { labels, datasets: [{
        label, data: series.map(s => s[key]),
        backgroundColor: series.map((_, i) => i === last ? C.s1soft : C.s1),
        borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24,
      }] },
      options: baseOptions({
        plugins: { legend: { display: false }, tooltip: Object.assign(baseOptions().plugins.tooltip, {
          callbacks: {
            title: (items) => bucketLabel(series[items[0].dataIndex].bucket, grain, true) + (items[0].dataIndex === last ? ' (so far)' : ''),
            label: (ctx) => ` ${n(ctx.raw)} ${label.toLowerCase()}`,
          } }) },
      }),
    });
  }

  function stackedChart(id, series, a, b, grain){
    const labels = series.map(s => bucketLabel(s.bucket, grain));
    mount(id, {
      type: 'bar',
      data: { labels, datasets: [
        { label: a.label, data: series.map(s => s[a.key]), backgroundColor: a.color, borderRadius: 0, borderSkipped: 'start', maxBarThickness: 24, stack: 's' },
        // The upper segment carries the rounded end, and a 2px white edge
        // along its base is the gap between the two.
        { label: b.label, data: series.map(s => s[b.key]), backgroundColor: b.color,
          borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false,
          borderWidth: { top: 0, left: 0, right: 0, bottom: 2 }, borderColor: '#fff', maxBarThickness: 24, stack: 's' },
      ] },
      options: baseOptions({
        scales: Object.assign(baseOptions().scales, { x: Object.assign(baseOptions().scales.x, { stacked: true }), y: Object.assign(baseOptions().scales.y, { stacked: true }) }),
        plugins: { legend: { display: false }, tooltip: Object.assign(baseOptions().plugins.tooltip, {
          callbacks: {
            title: (items) => bucketLabel(series[items[0].dataIndex].bucket, grain, true),
            label: (ctx) => ` ${ctx.dataset.label}: ${n(ctx.raw)}`,
          } }) },
      }),
    });
  }

  function groupedChart(id, series, a, b, grain){
    const labels = series.map(s => bucketLabel(s.bucket, grain));
    const ds = (x) => ({ label: x.label, data: series.map(s => s[x.key]), backgroundColor: x.color, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 14, categoryPercentage: .7, barPercentage: .9 });
    mount(id, {
      type: 'bar',
      data: { labels, datasets: [ds(a), ds(b)] },
      options: baseOptions({
        plugins: { legend: { display: false }, tooltip: Object.assign(baseOptions().plugins.tooltip, {
          callbacks: { title: (items) => bucketLabel(series[items[0].dataIndex].bucket, grain, true), label: (ctx) => ` ${ctx.dataset.label}: ${n(ctx.raw)}` } }) },
      }),
    });
  }

  function lineChart(id, series, key, grain, { min = 0, max = 100, suffix = '%', label = '' } = {}){
    const labels = series.map(s => bucketLabel(s.bucket, grain));
    mount(id, {
      type: 'line',
      data: { labels, datasets: [{
        label, data: series.map(s => s[key]), borderColor: C.s1, backgroundColor: 'rgba(47,86,217,.10)', fill: true,
        borderWidth: 2, tension: .3, spanGaps: true, pointRadius: series.map(s => s[key] == null ? 0 : 3),
        pointBackgroundColor: C.s1, pointBorderColor: '#fff', pointBorderWidth: 2, pointHoverRadius: 6,
      }] },
      options: baseOptions({
        scales: Object.assign(baseOptions().scales, { y: Object.assign(baseOptions().scales.y, { beginAtZero: false, min, max, ticks: Object.assign(baseOptions().scales.y.ticks, { callback: v => v + suffix }) }) }),
        plugins: { legend: { display: false }, tooltip: Object.assign(baseOptions().plugins.tooltip, {
          callbacks: {
            title: (items) => bucketLabel(series[items[0].dataIndex].bucket, grain, true),
            label: (ctx) => ctx.raw == null ? ' No answers' : ` ${ctx.raw}${suffix} ${label}`,
            afterLabel: (ctx) => series[ctx.dataIndex].responses != null ? ` ${n(series[ctx.dataIndex].responses)} answers` : '',
          } }) },
      }),
    });
  }

  function setChartFont(){
    if(typeof Chart === 'undefined') return;
    const fam = getComputedStyle(document.body).fontFamily || 'system-ui';
    Chart.defaults.font.family = fam;
    Chart.defaults.color = C.axis;
  }

  /* ------------------------------------------------------------------ */
  /* Satisfaction block (shared by the customer and platform views)     */
  /* ------------------------------------------------------------------ */
  function satisfactionHTML(d, { audience, surveysEnabled }){
    const s = d.satisfaction;
    if(!s || !s.responses_window){
      // Surveys are an add-on switched on per account; an account without
      // them is not sent to a Surveys tab it does not have.
      const off = surveysEnabled === false;
      return `<div class="vqa-section">Customer satisfaction <span style="font-size:12px;font-weight:500;color:var(--muted,#6b645b);">· from Vantriq Echo</span></div>
      <div class="vqa-card"><div class="vqa-empty">
        No survey answers yet in the ${esc(d.period.window_label.toLowerCase())}.
        ${audience === 'portal'
          ? (off
            ? 'Customer-satisfaction surveys are not part of your account yet. Ask Vantriq AI to switch them on: you get Vantriq Echo, an Echo tab to ask your customers how you did — by QR code, link or WhatsApp — and the satisfaction score, NPS and what people wrote show up here.'
            : 'Create a survey under the <b>Echo</b> tab — share it by QR code, link or WhatsApp, and the answers show up here the moment they arrive: the satisfaction score, NPS, how often problems were resolved, and what people wrote.')
          : (off
            ? 'Vantriq Echo is switched off for this client. An admin switches it on from the client\'s page (Vantriq Echo); answers posted to <code>POST /api/webhooks/csat</code> by anything else still appear here.'
            : 'Create a survey for this client under <b>Vantriq Echo</b>, or post answers from anything else that asks the question to <code>POST /api/webhooks/csat</code>. Either way they appear here straight away.')}
      </div></div>`;
    }
    const k = s.kpis, w = s.window;
    const npsTotal = w.promoters + w.passives + w.detractors;
    const seg = (v) => npsTotal ? (v / npsTotal) * 100 : 0;
    const distMax = Math.max(...s.distribution.map(x => x.n), 1);
    return `
    <div class="vqa-section">Customer satisfaction <span style="font-size:12px;font-weight:500;color:var(--muted,#6b645b);">· from Vantriq Echo</span></div>
    <div class="vqa-grid vqa-kpis">
      ${kpi({ label: 'Satisfied (4–5 of 5)', value: k.csat.current == null ? '—' : k.csat.current, unit: k.csat.current == null ? '' : '%',
              delta: k.csat.current == null ? undefined : k.csat.delta_pts, deltaUnit: 'pts', prevLabel: d.period.previous_label,
              foot: k.csat.responses ? `Average ${k.csat.average} / 5 · ${n(k.csat.responses)} answers` : 'No answers in this period',
              sparkValues: s.series.map(x => x.csat) })}
      ${kpi({ label: 'Net Promoter Score', value: k.nps.current == null ? '—' : (k.nps.current > 0 ? '+' : '') + k.nps.current,
              delta: k.nps.current == null ? undefined : k.nps.delta_pts, deltaUnit: 'pts', prevLabel: d.period.previous_label,
              foot: k.nps.responses ? `${n(k.nps.responses)} answers` : 'No answers in this period', sparkValues: s.series.map(x => x.nps) })}
      ${kpi({ label: 'Problems resolved', value: k.resolution.current == null ? '—' : k.resolution.current, unit: k.resolution.current == null ? '' : '%',
              delta: k.resolution.current == null ? undefined : k.resolution.delta_pts, deltaUnit: 'pts', prevLabel: d.period.previous_label,
              foot: k.resolution.responses ? `${n(k.resolution.responses)} answers` : 'No answers in this period' })}
    </div>
    <div class="vqa-grid vqa-two">
      <div class="vqa-card">
        <h3>Satisfaction over time</h3>
        <div class="vqa-sub">Share of answers scoring 4 or 5 · ${esc(d.period.window_label)}</div>
        <div class="vqa-plot sm"><canvas id="vqaCsatTrend" aria-label="Satisfaction trend"></canvas></div>
      </div>
      <div class="vqa-card">
        <h3>How people scored us</h3>
        <div class="vqa-sub">${n(w.csat_responses)} answers · ${esc(d.period.window_label)}${w.csat_average != null ? ` · average ${w.csat_average} / 5` : ''}</div>
        ${barList(s.distribution.slice().reverse().map(x => ({ name: `${x.score} of 5`, value: x.n, share: w.csat_responses ? Math.round((x.n / w.csat_responses) * 100) : 0 })),
          { colors: SCORE.slice().reverse() })}
        ${w.nps_responses ? `
          <div style="margin-top:18px;display:flex;align-items:baseline;gap:10px;">
            <div class="vqa-big">${w.nps > 0 ? '+' : ''}${w.nps}</div><div class="vqa-sub" style="margin:0;">NPS from ${n(w.nps_responses)} answers</div>
          </div>
          <div class="vqa-stack" role="img" aria-label="${w.detractors} detractors, ${w.passives} passives, ${w.promoters} promoters">
            ${w.detractors ? `<div style="width:${seg(w.detractors)}%;background:${SCORE[0]}"></div>` : ''}
            ${w.passives ? `<div style="width:${seg(w.passives)}%;background:${SCORE[2]}"></div>` : ''}
            ${w.promoters ? `<div style="width:${seg(w.promoters)}%;background:${SCORE[4]}"></div>` : ''}
          </div>
          ${legend([[`Detractors 0–6 · ${n(w.detractors)}`, SCORE[0]], [`Passives 7–8 · ${n(w.passives)}`, SCORE[2]], [`Promoters 9–10 · ${n(w.promoters)}`, SCORE[4]]])}` : ''}
      </div>
    </div>
    ${s.recent_feedback.length ? `
    <div class="vqa-card" style="margin-bottom:14px;">
      <h3>What people wrote</h3>
      <div class="vqa-sub">Latest comments left with a survey answer</div>
      <div class="vqa-feedback">
        ${s.recent_feedback.map(f => `<div class="vqa-fb">
          <div>“${esc(f.comment)}”</div>
          <div class="m">${f.score != null ? `${'★'.repeat(f.score)}${'☆'.repeat(5 - f.score)} · ` : ''}${f.nps != null ? `NPS ${f.nps} · ` : ''}${f.resolved != null ? (f.resolved ? 'Resolved · ' : 'Not resolved · ') : ''}${esc(CHANNELS[f.channel] || f.channel)} · ${esc(new Date(f.responded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))}${f.company ? ` · ${esc(f.company)}` : ''}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}`;
  }

  /* ------------------------------------------------------------------ */
  /* Conversations view — one customer, or every customer               */
  /* ------------------------------------------------------------------ */
  function conversationsHTML(d, opts){
    opts = opts || {};
    const audience = opts.audience || 'portal';
    const k = d.kpis, g = d.grain, series = d.series;
    const prev = d.period.previous_label;
    const hasAny = d.window_totals.conversations > 0;
    const q = d.quota;

    lastSeries = {
      headers: ['Period', 'Conversations', 'Messages', 'Contacts', 'New contacts', 'Returning contacts', 'Satisfied %', 'Survey answers', 'NPS'],
      rows: series.map((s, i) => {
        const sat = (d.satisfaction && d.satisfaction.series[i]) || {};
        return [bucketLabel(s.bucket, g, true), s.conversations, s.messages, s.contacts, s.new_contacts, s.returning_contacts,
          sat.csat == null ? '' : sat.csat, sat.responses || 0, sat.nps == null ? '' : sat.nps];
      }),
    };

    const channelRows = d.channels.map(c => ({ name: CHANNELS[c.channel] || c.channel, value: c.conversations, share: c.share_pct }));
    const agentRows = d.agents.map(a => ({ name: a.name, value: a.conversations, share: a.share_pct }));

    return `<div class="vqa">
      ${filters(g, opts.onGrain, compareNote(d), opts)}
      ${insightsCard(d.insights)}
      <div class="vqa-grid vqa-kpis">
        ${kpi({ label: 'Conversations', value: n(k.conversations.current), delta: k.conversations.delta_pct, prevLabel: prev,
                projected: k.conversations.projected, sparkValues: series.map(s => s.conversations) })}
        ${kpi({ label: 'New contacts (leads)', value: n(k.new_contacts.current), delta: k.new_contacts.delta_pct, prevLabel: prev,
                projected: k.new_contacts.projected, sparkValues: series.map(s => s.new_contacts) })}
        ${kpi({ label: 'Returning contacts', value: n(k.returning_contacts.current), delta: k.returning_contacts.delta_pct, prevLabel: prev,
                sparkValues: series.map(s => s.returning_contacts) })}
        ${kpi({ label: 'Messages handled', value: compact(k.messages.current), delta: k.messages.delta_pct, prevLabel: prev,
                projected: k.messages.projected, sparkValues: series.map(s => s.messages) })}
        ${kpi({ label: 'Messages per conversation', value: k.messages_per_conversation.current == null ? '—' : k.messages_per_conversation.current,
                delta: k.messages_per_conversation.current == null ? undefined : k.messages_per_conversation.delta_pct, goodWhenUp: null, prevLabel: prev,
                sparkValues: series.map(s => s.conversations ? s.messages / s.conversations : null) })}
        ${k.containment ? kpi({ label: 'Handled fully by AI', value: k.containment.current == null ? '—' : k.containment.current, unit: k.containment.current == null ? '' : '%',
                delta: k.containment.current == null ? undefined : k.containment.delta_pct, deltaUnit: 'pts', prevLabel: prev,
                foot: `${n(k.containment.handed_off)} of ${n(k.containment.reported_conversations)} passed to a person` }) : ''}
      </div>

      ${q ? `<div class="vqa-card" style="margin-bottom:14px;">
        <h3>This month against your package</h3>
        <div class="vqa-sub">${n(q.used)} of ${n(q.quota)} included conversations used${q.projected_month_end != null ? ` · on pace for about ${n(q.projected_month_end)} by month end` : ''}</div>
        <div class="vqa-meter" role="img" aria-label="${q.used_pct}% of included conversations used">
          <div class="f ${q.used_pct >= 80 ? 'warn' : ''}" style="width:${Math.min(100, q.used_pct)}%"></div>
          ${q.projected_month_end != null ? `<div class="pace" style="left:calc(${Math.min(100, (q.projected_month_end / q.quota) * 100)}% - 1px)" title="Projected month end"></div>` : ''}
        </div>
        <div class="vqa-sub" style="margin:0;">${q.used_pct}% used${q.projected_month_end != null ? ' · the dark mark is where this month is heading' : ''}</div>
      </div>` : ''}

      ${!hasAny ? `<div class="vqa-card"><div class="vqa-empty">No conversations recorded in the ${esc(d.period.window_label.toLowerCase())} yet. As soon as the agent starts answering, this page fills in on its own.</div></div>` : `
      <div class="vqa-grid vqa-two">
        <div class="vqa-card">
          <h3>Conversations</h3>
          <div class="vqa-sub">${esc(d.period.window_label)} · ${n(d.window_totals.conversations)} in total · the pale bar is the period still under way</div>
          <div class="vqa-plot"><canvas id="vqaConv" aria-label="Conversations per period"></canvas></div>
        </div>
        <div class="vqa-card">
          <h3>New and returning contacts</h3>
          <div class="vqa-sub">People who messaged, by whether it was their first time · ${n(d.window_totals.new_contacts)} new in the window</div>
          ${legend([['New contacts', C.s1], ['Returning', C.s2]])}
          <div class="vqa-plot" style="height:206px;"><canvas id="vqaContacts" aria-label="New and returning contacts per period"></canvas></div>
        </div>
      </div>

      ${d.top_clients ? `<div class="vqa-card" style="margin-bottom:14px;">
        <h3>Busiest customers</h3>
        <div class="vqa-sub">Conversations across ${esc(d.period.window_label.toLowerCase())} · ${esc(d.period.current_label.toLowerCase())} in brackets</div>
        ${barList(d.top_clients.map(c => ({ name: c.company + (c.is_internal ? ' (us)' : ''), value: c.conversations, cur: c.conversations_current })),
          { extra: r => `(${n(r.cur)})` })}
      </div>` : ''}

      <div class="vqa-grid vqa-two">
        <div class="vqa-card">
          <h3>Channels</h3>
          <div class="vqa-sub">Where conversations came in · ${esc(d.period.window_label)}</div>
          ${barList(channelRows)}
        </div>
        <div class="vqa-card">
          <h3>${audience === 'platform' ? 'Agents' : 'Your agents'}</h3>
          <div class="vqa-sub">Which agent handled them · ${esc(d.period.window_label)}</div>
          ${barList(agentRows)}
        </div>
      </div>

      ${whereHTML(d, audience)}

      <div class="vqa-card" style="margin-bottom:14px;">
        <h3>When people message</h3>
        <div class="vqa-sub">Conversations started, by day and hour (${esc(d.time_zone.replace('Asia/', ''))} time) · ${esc(d.period.window_label)}</div>
        ${heatmap(d.heatmap, d.period.window_label)}
      </div>`}

      ${satisfactionHTML(d, { audience, surveysEnabled: opts.surveysEnabled })}

      <div class="vqa-card" style="margin-top:14px;">
        <details>
          <summary>See every figure as a table</summary>
          ${table(lastSeries.headers, lastSeries.rows)}
        </details>
      </div>
    </div>`;
  }

  function drawConversations(d){
    destroyCharts();
    if(!chartReady()) return;
    setChartFont();
    columnChart('vqaConv', d.series, 'conversations', 'Conversations', d.grain);
    stackedChart('vqaContacts', d.series,
      { key: 'new_contacts', label: 'New contacts', color: C.s1 },
      { key: 'returning_contacts', label: 'Returning', color: C.s2 }, d.grain);
    if(d.satisfaction && d.satisfaction.responses_window) lineChart('vqaCsatTrend', d.satisfaction.series, 'csat', d.grain, { label: 'satisfied' });
  }

  /* ------------------------------------------------------------------ */
  /* Sales view — VantriqAI's own leads (CRM only)                      */
  /* ------------------------------------------------------------------ */
  const STAGE_LABEL = { lead: 'New lead', contacted: 'Contacted', proposal: 'Proposal sent', negotiation: 'Negotiation', active: 'Won — customer' };

  function salesHTML(d, opts){
    opts = opts || {};
    const k = d.kpis, g = d.grain, prev = d.period.previous_label;
    lastSeries = {
      headers: ['Period', 'New leads', 'Won', 'Lost', 'Prospect conversations'],
      rows: d.series.map((s, i) => [bucketLabel(s.bucket, g, true), s.new_leads, s.won, s.lost, (d.prospect_series[i] || {}).conversations || 0]),
    };
    const top = d.funnel[0] ? d.funnel[0].n : 0;
    const topics = d.topics.filter(t => t.conversations > 0);
    return `<div class="vqa">
      ${filters(g, opts.onGrain, compareNote(d), opts)}
      ${insightsCard(d.insights)}
      <div class="vqa-grid vqa-kpis">
        ${kpi({ label: 'New leads', value: n(k.new_leads.current), delta: k.new_leads.delta_pct, prevLabel: prev, projected: k.new_leads.projected, sparkValues: d.series.map(s => s.new_leads) })}
        ${kpi({ label: 'Won', value: n(k.won.current), delta: k.won.delta_pct, prevLabel: prev, projected: k.won.projected, sparkValues: d.series.map(s => s.won) })}
        ${kpi({ label: 'Lost', value: n(k.lost.current), delta: k.lost.delta_pct, goodWhenUp: false, prevLabel: prev, sparkValues: d.series.map(s => s.lost) })}
        ${kpi({ label: 'Win rate', value: k.win_rate == null ? '—' : k.win_rate, unit: k.win_rate == null ? '' : '%', foot: `Won ÷ (won + lost) · ${esc(d.period.window_label.toLowerCase())}` })}
        ${kpi({ label: 'Lead to customer', value: k.avg_days_to_win == null ? '—' : (k.avg_days_to_win < 1 ? '<1' : k.avg_days_to_win), unit: k.avg_days_to_win == null ? '' : (k.avg_days_to_win <= 1 ? ' day' : ' days'), foot: 'Average time, deals won in the window' })}
        ${kpi({ label: 'Open deals', value: n(k.open_deals), foot: `${money(k.open_value)} estimated value` })}
        ${kpi({ label: 'Prospect conversations', value: n(k.prospect_conversations.current), delta: k.prospect_conversations.delta_pct, prevLabel: prev, sparkValues: d.prospect_series.map(s => s.conversations), foot: 'With our own sales agent' })}
      </div>
      <div class="vqa-grid vqa-two">
        <div class="vqa-card">
          <h3>New leads</h3>
          <div class="vqa-sub">${esc(d.period.window_label)} · the pale bar is the period still under way</div>
          <div class="vqa-plot"><canvas id="vqaLeads" aria-label="New leads per period"></canvas></div>
        </div>
        <div class="vqa-card">
          <h3>Won and lost</h3>
          <div class="vqa-sub">Deals closed each period</div>
          ${legend([['Won', C.s1], ['Lost', C.s2]])}
          <div class="vqa-plot" style="height:206px;"><canvas id="vqaWonLost" aria-label="Deals won and lost per period"></canvas></div>
        </div>
      </div>
      <div class="vqa-grid vqa-two">
        <div class="vqa-card">
          <h3>Funnel</h3>
          <div class="vqa-sub">Of the ${n(top)} leads that came in over the ${esc(d.period.window_label.toLowerCase())}, how many got at least this far</div>
          ${barList(d.funnel.map((f, i) => ({ name: STAGE_LABEL[f.stage] || f.stage, value: f.n, share: top ? Math.round((f.n / top) * 100) : 0 })), { colors: FUNNEL })}
        </div>
        <div class="vqa-card">
          <h3>Lead sources</h3>
          <div class="vqa-sub">Where leads came from, and how many of them became customers</div>
          ${barList(d.sources.map(s => ({ name: s.name, value: s.n, won: s.won })), { extra: r => r.won != null ? `${n(r.won)} won` : '' })}
        </div>
      </div>
      <div class="vqa-grid vqa-two">
        <div class="vqa-card">
          <h3>What prospects ask about</h3>
          <div class="vqa-sub">Conversations with our sales agent mentioning each topic · keyword-matched, English and Roman Urdu</div>
          ${topics.length ? barList(topics.map(t => ({ name: t.label, value: t.conversations }))) : `<div class="vqa-empty">No prospect conversations in the ${esc(d.period.window_label.toLowerCase())}.</div>`}
        </div>
        <div class="vqa-card">
          <h3>Leads by owner</h3>
          <div class="vqa-sub">Sales rep who brought each lead in — “House” is ours directly</div>
          ${barList(d.reps.map(r => ({ name: r.name, value: r.n })))}
        </div>
      </div>
      <div class="vqa-card">
        <details>
          <summary>See every figure as a table</summary>
          ${table(lastSeries.headers, lastSeries.rows)}
        </details>
      </div>
    </div>`;
  }

  function drawSales(d){
    destroyCharts();
    if(!chartReady()) return;
    setChartFont();
    columnChart('vqaLeads', d.series, 'new_leads', 'New leads', d.grain);
    groupedChart('vqaWonLost', d.series, { key: 'won', label: 'Won', color: C.s1 }, { key: 'lost', label: 'Lost', color: C.s2 }, d.grain);
  }

  /* ------------------------------------------------------------------ */
  /* Echo view — every survey together (portal and CRM)                 */
  /* ------------------------------------------------------------------ */
  function satColor(v){ return v == null ? '#bdb7ad' : v >= 80 ? '#2f7d5f' : v >= 60 ? '#7f9bf2' : v >= 40 ? '#d9a441' : '#b4402f'; }
  function sign(v){ return v == null ? '—' : (v > 0 ? '+' : '') + v; }

  /** One row per group: how many answered (bar), satisfied %, average, NPS. */
  function breakdown(list, first){
    if(!list || !list.length) return `<div class="vqa-empty">Nothing yet.</div>`;
    const max = Math.max(...list.map(x => x.responses), 1);
    return `<div style="overflow-x:auto;"><table class="vqa-table vqe-break"><thead><tr><th>${esc(first)}</th><th style="width:34%">Answers</th><th class="r">Satisfied</th><th class="r">Avg</th><th class="r">NPS</th></tr></thead><tbody>
      ${list.slice(0, 10).map(x => `<tr${x.known === false ? ' class="muted"' : ''}><td><b>${esc(x.name)}</b></td>
        <td><div class="vqe-mini"><div style="width:${(x.responses / max) * 100}%;background:${x.known === false ? '#bdb7ad' : C.s1}"></div></div><span class="vqe-n">${n(x.responses)}${x.share != null ? ` · ${x.share}%` : ''}</span></td>
        <td class="r"><span class="vqe-pill" style="background:${satColor(x.csat)}">${x.csat == null ? '—' : x.csat + '%'}</span></td>
        <td class="r">${x.csat_average == null ? '—' : x.csat_average}</td><td class="r">${sign(x.nps)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  function words(list, color){
    if(!list || !list.length) return `<div class="vqa-empty" style="padding:10px;">Not enough comments yet.</div>`;
    const max = Math.max(...list.map(w => w.n));
    return `<div class="vqe-words">${list.map(w => `<span style="font-size:${12 + Math.round((w.n / max) * 8)}px;border-color:${color};color:${color}">${esc(w.word)} <small>${w.n}</small></span>`).join('')}</div>`;
  }

  function echoAdvancedHTML(d){
    const a=d.advanced;
    if(!a) return '';
    const service=a.service;
    const hours=v=>v==null?'—':v<1?Math.round(v*60)+' min':v+' h';
    return `<section aria-label="Advanced Echo insights">
      <div class="vqa-section">Advanced insights</div>
      ${d.sampled?'<div class="vqa-card"><b>Response limit reached.</b><div class="vqa-sub">These insights use the latest 50,000 responses in the window and may omit earlier responses.</div></div>':''}
      <div class="vqa-card" style="margin-bottom:14px;"><h3>Complaint topic trends</h3>
        <div class="vqa-sub">${esc(d.period.window_label)} · ${n(a.topics.comment_count)} comments from low scores or unresolved answers. English, Urdu and Roman Urdu keyword matching; topics can overlap. This is not AI sentiment analysis.</div>
        ${a.topics.rows.length?a.topics.rows.map(t=>`<details style="padding:12px 0;border-bottom:1px solid var(--border,#e7e2da);"><summary style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;"><b>${esc(t.label)}</b><span>${n(t.count)} comments · ${t.share}%</span></summary>
          <div style="max-width:240px;margin-top:8px;">${spark(t.series.map(x=>x.count))}</div>
          <div class="vqa-sub">Open the period table and supporting comments to inspect this classification.</div>
          ${table(['Period','Matching comments'],t.series.map(x=>[bucketLabel(x.bucket,d.grain,true),x.count]))}
          ${t.samples.map(x=>`<div class="vqa-fb"><div>“${esc(x.comment)}”</div><div class="m">${esc(x.survey)}${x.location?' · '+esc(x.location):''} · ${esc(new Date(x.submitted_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:d.time_zone}))}</div></div>`).join('')}
        </details>`).join(''):'<div class="vqa-empty">Not enough data yet. Topics appear when an unhappy or unresolved response includes a comment.</div>'}
      </div>
      <div class="vqa-card" style="margin-bottom:14px;"><h3>Branch performance matrix</h3>
        <div class="vqa-sub">${esc(d.period.current_label)} · open complaints first. Change compares satisfaction with ${esc(d.period.previous_label)} up to the same point. Fewer than five scored answers is labelled low sample; changes require five in both periods and are descriptive, not significance tests.</div>
        ${a.branches.length?`<div style="overflow-x:auto;"><table class="vqa-table"><thead><tr><th>Branch / customer</th><th>Answers</th><th>Satisfied</th><th>NPS</th><th>Open / contacted</th><th>Change</th></tr></thead><tbody>
          ${a.branches.map(b=>`<tr><td><b>${esc(b.name)}</b><div class="vqa-sub">${esc(b.company)}</div></td><td>${n(b.responses)}${b.low_sample?'<div class="vqa-sub">Low sample</div>':''}</td><td><span class="vqe-pill" style="background:${b.low_sample?'#bdb7ad':satColor(b.csat)}">${b.csat==null?'—':b.csat+'%'}</span><div class="vqa-sub">${n(b.scored)} scored</div></td><td>${sign(b.nps)}</td><td>${n(b.open)}</td><td>${b.delta_pts==null?'—':sign(b.delta_pts)+' pts'}${b.delta_pts==null?'<div class="vqa-sub">Insufficient comparison data</div>':''}</td></tr>`).join('')}
        </tbody></table></div>`:'<div class="vqa-empty">Not enough data yet. Responses tagged to a branch will appear here.</div>'}
        ${a.unlocated_current?`<div class="vqa-sub">${n(a.unlocated_current)} current-period answers have no branch tag and are excluded.</div>`:''}
      </div>
      <div class="vqa-card" style="margin-bottom:14px;"><h3>Service response performance</h3>
        <div class="vqa-sub">Follow-ups for answers submitted in ${esc(d.period.current_label.toLowerCase())}; status as of now. The 48-hour first-response target is a reference threshold. Resolution means your team marked it resolved, not customer confirmation.</div>
        <div class="vqa-grid vqa-two" style="margin-top:14px;">
          ${kpi({label:'First response',value:hours(service.median_first_reply_hours),foot:`Median · ${n(service.measured_replies)} recorded first contacts`})}
          ${kpi({label:'Time to resolve',value:hours(service.median_resolution_hours),foot:`Median · ${n(service.measured_resolutions)} recorded first resolutions`})}
          ${kpi({label:'Replied within 48 hours',value:service.replied_within_48_pct==null?'—':service.replied_within_48_pct,unit:service.replied_within_48_pct==null?'':'%',foot:'Of recorded first contacts; excludes unknown timings'})}
          ${kpi({label:'Waiting over 48 hours',value:n(service.overdue),foot:`${n(service.waiting)} open · ${n(service.followups)} follow-ups in this cohort`})}
        </div>
        <div class="vqa-sub">First-contact and first-resolution timestamps are captured on new status transitions. Historical timings are not reconstructed from note edits.${service.missing_reply_timestamps?` ${n(service.missing_reply_timestamps)} contacted/resolved follow-ups have unknown first-contact time.`:''}${!service.measured_replies&&!service.measured_resolutions?' Not enough timing data yet.':''}</div>
      </div>
    </section>`;
  }

  function echoHTML(d, opts){
    opts = opts || {};
    const k = d.kpis, w = d.window, prev = d.period.previous_label, g = d.grain;
    lastSeries = {
      headers: ['Period', 'Answers', 'Satisfied %', 'Average (of 5)', 'NPS', 'Promoters', 'Passives', 'Detractors', 'Resolved %', 'Unhappy', 'Links sent', 'Links answered'],
      rows: d.series.map(s => [bucketLabel(s.bucket, g, true), s.responses, s.csat == null ? '' : s.csat, s.csat_average == null ? '' : s.csat_average,
        s.nps == null ? '' : s.nps, s.promoters, s.passives, s.detractors, s.resolution == null ? '' : s.resolution, s.unhappy, s.invites_sent, s.invites_answered]),
    };
    const note = `${esc(d.period.current_label)} so far (${d.period.elapsed_pct}% through) compared with ${esc(prev)} up to the same point · ${esc(d.time_zone.replace('Asia/', ''))} time`;
    // With no answers yet the whole dashboard still shows, at zero, so it is
    // clear what will fill in — with one line saying how to get there.
    const waiting = !w.responses ? `<div class="vqa-card" style="margin-bottom:14px;border-left:4px solid ${C.s1};"><h3>Waiting for the first answer</h3>
      <div class="vqa-sub" style="margin:4px 0 0;">No survey answers in the ${esc(d.period.window_label.toLowerCase())} yet. Share your survey — by QR code, link, WhatsApp, a kiosk tablet or your website — and every tile, chart and breakdown here fills in the moment answers arrive.</div></div>` : '';
    const npsTotal = w.promoters + w.passives + w.detractors;
    const seg = (v) => npsTotal ? (v / npsTotal) * 100 : 0;
    const f = d.followups;
    const funnelRows = [
      { name: 'Links sent', value: d.funnel.sent }, { name: 'Opened', value: d.funnel.opened, share: d.funnel.sent ? Math.round(d.funnel.opened / d.funnel.sent * 100) : null },
      { name: 'Answered', value: d.funnel.answered, share: d.funnel.sent ? Math.round(d.funnel.answered / d.funnel.sent * 100) : null },
    ];
    const demo = d.demographics;
    const demoCards = [['By gender', demo.gender, 'Gender'], ['By age group', demo.age, 'Age group'], ['By city', demo.city, 'City']].filter(x => x[1].length);
    return `<div class="vqa vqe">
      ${filters(g, opts.onGrain, note, opts)}
      ${waiting}
      ${insightsCard(d.insights)}
      <div class="vqa-grid vqa-kpis">
        ${kpi({ label: 'Answers', value: n(k.responses.current), delta: k.responses.delta_pct, prevLabel: prev, projected: k.responses.projected, sparkValues: d.series.map(s => s.responses) })}
        ${kpi({ label: 'Satisfied (4–5 of 5)', value: k.csat.current == null ? '—' : k.csat.current, unit: k.csat.current == null ? '' : '%', delta: k.csat.current == null ? undefined : k.csat.delta_pts, deltaUnit: 'pts', prevLabel: prev, foot: k.csat.average != null ? `Average ${k.csat.average} / 5 · ${n(k.csat.responses)} answers` : 'No scores this period', sparkValues: d.series.map(s => s.csat) })}
        ${kpi({ label: 'Net Promoter Score', value: sign(k.nps.current), delta: k.nps.current == null ? undefined : k.nps.delta_pts, deltaUnit: 'pts', prevLabel: prev, foot: k.nps.responses ? `${n(k.nps.responses)} answers` : 'Not asked this period', sparkValues: d.series.map(s => s.nps) })}
        ${kpi({ label: 'Problems resolved', value: k.resolution.current == null ? '—' : k.resolution.current, unit: k.resolution.current == null ? '' : '%', delta: k.resolution.current == null ? undefined : k.resolution.delta_pts, deltaUnit: 'pts', prevLabel: prev, foot: k.resolution.responses ? `${n(k.resolution.responses)} answers` : 'Not asked this period' })}
        ${kpi({ label: 'Unhappy customers', value: n(k.unhappy.current), foot: `${k.unhappy.share == null ? 0 : k.unhappy.share}% of answers · ${n(f.open)} waiting for a reply`, sparkValues: d.series.map(s => s.unhappy) })}
        ${kpi({ label: 'Invites answered', value: k.response_rate.current == null ? '—' : k.response_rate.current, unit: k.response_rate.current == null ? '' : '%', delta: k.response_rate.current == null ? undefined : k.response_rate.delta_pts, deltaUnit: 'pts', prevLabel: prev, foot: `${n(k.response_rate.sent)} personal links sent` })}
        ${k.ces.current != null ? kpi({ label: 'Customer effort', value: k.ces.current, unit: ' / 7', foot: 'Higher is easier' }) : ''}
        ${w.median_seconds != null ? kpi({ label: 'Time to answer', value: w.median_seconds < 60 ? w.median_seconds : Math.round(w.median_seconds / 60), unit: w.median_seconds < 60 ? ' sec' : ' min', foot: 'Median, whole survey' }) : ''}
      </div>

      <div class="vqa-grid vqa-two">
        <div class="vqa-card"><h3>Answers over time</h3><div class="vqa-sub">${esc(d.period.window_label)} · ${n(w.responses)} in total · the pale bar is still under way</div>
          <div class="vqa-plot"><canvas id="vqeResp" aria-label="Answers per period"></canvas></div></div>
        <div class="vqa-card"><h3>Satisfaction over time</h3><div class="vqa-sub">Share scoring 4 or 5 · ${esc(d.period.window_label)} · ${w.csat == null ? '—' : w.csat + '%'} overall</div>
          <div class="vqa-plot"><canvas id="vqeCsat" aria-label="Satisfaction per period"></canvas></div></div>
      </div>

      <div class="vqa-grid vqa-two">
        <div class="vqa-card"><h3>How people scored their experience</h3><div class="vqa-sub">${n(w.csat_responses)} answers · average ${w.csat_average == null ? '—' : w.csat_average} / 5</div>
          ${barList(d.distribution.slice().reverse().map(x => ({ name: ['😠 1', '🙁 2', '😐 3', '🙂 4', '😍 5'][x.score - 1], value: x.n, share: w.csat_responses ? Math.round(x.n / w.csat_responses * 100) : 0 })), { colors: SCORE.slice().reverse() })}</div>
        <div class="vqa-card"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;"><div><h3>Would they recommend you?</h3><div class="vqa-sub">0–10 · ${n(w.nps_responses)} answers</div></div><div class="vqa-big">${sign(w.nps)}</div></div>
          ${w.nps_responses ? `<div class="vqa-plot sm"><canvas id="vqeNpsDist" aria-label="How people answered 0 to 10"></canvas></div>
          <div class="vqa-stack" role="img" aria-label="${w.detractors} detractors, ${w.passives} passives, ${w.promoters} promoters">
            ${w.detractors ? `<div style="width:${seg(w.detractors)}%;background:${SCORE[0]}"></div>` : ''}${w.passives ? `<div style="width:${seg(w.passives)}%;background:${SCORE[2]}"></div>` : ''}${w.promoters ? `<div style="width:${seg(w.promoters)}%;background:${SCORE[4]}"></div>` : ''}
          </div>${legend([[`Detractors 0–6 · ${n(w.detractors)}`, SCORE[0]], [`Passives 7–8 · ${n(w.passives)}`, SCORE[2]], [`Promoters 9–10 · ${n(w.promoters)}`, SCORE[4]]])}` : (w.responses ? '<div class="vqa-empty">No survey asked "would you recommend us" in this period.</div>' : '<div class="vqa-empty">The 0–10 spread and Net Promoter Score appear with the first answers.</div>')}</div>
      </div>

      ${w.nps_responses ? `<div class="vqa-card" style="margin-bottom:14px;"><h3>Net Promoter Score over time</h3><div class="vqa-sub">From −100 to +100 · ${esc(d.period.window_label)}</div><div class="vqa-plot sm"><canvas id="vqeNps" aria-label="NPS per period"></canvas></div></div>` : ''}

      <div class="vqa-grid vqa-two">
        <div class="vqa-card"><h3>Every survey</h3><div class="vqa-sub">${esc(d.period.window_label)} · best and worst at a glance</div>${breakdown(d.surveys.some(s => s.responses) ? d.surveys.filter(s => s.responses) : d.surveys, 'Survey')}</div>
        <div class="vqa-card"><h3>Personal links: sent → opened → answered</h3><div class="vqa-sub">After-chat WhatsApp invites and one-time links · ${esc(d.period.window_label)}</div>
          ${d.funnel.sent ? barList(funnelRows, { colors: [FUNNEL[0], FUNNEL[2], FUNNEL[4]] }) : '<div class="vqa-empty">No personal links sent in this period.</div>'}
          <div class="vqa-sub" style="margin:12px 0 0;">${w.views ? `${n(w.views)} survey page visits · ${w.completion_rate == null ? '—' : w.completion_rate + '%'} went on to answer` : ''}</div></div>
      </div>

      <div class="vqa-grid vqa-two">
        <div class="vqa-card"><h3>By channel</h3><div class="vqa-sub">How the survey was answered</div>${breakdown(d.channels, 'Channel')}</div>
        <div class="vqa-card"><h3>${d.locations.length ? 'By location' : 'By language'}</h3><div class="vqa-sub">${d.locations.length ? 'Branch or site, from the QR code or link' : 'English or Urdu'}</div>${breakdown(d.locations.length ? d.locations : d.languages, d.locations.length ? 'Location' : 'Language')}</div>
      </div>

      ${demoCards.length ? [demoCards.slice(0, 2), demoCards.slice(2)].filter(p => p.length).map(p => `<div class="vqa-grid ${p.length === 2 ? 'vqa-two' : ''}">${p.map(x => `<div class="vqa-card"><h3>${x[0]}</h3><div class="vqa-sub">From the survey's "about you" questions</div>${breakdown(x[1], x[2])}</div>`).join('')}</div>`).join('')
        : `<div class="vqa-card" style="margin-bottom:14px;"><h3>Who answers</h3><div class="vqa-empty" style="padding:12px;">Add the <b>Gender</b>, <b>Age group</b> or <b>City</b> question to a survey (open it → Questions → Add a question → About you) to see how satisfaction differs between groups here.</div></div>`}

      <div class="vqa-grid vqa-two">
        <div class="vqa-card"><h3>What unhappy customers write about</h3><div class="vqa-sub">Words used most in comments scoring 1–2, NPS 0–6 or not resolved</div>${words(d.themes.unhappy, SCORE[0])}</div>
        <div class="vqa-card"><h3>What happy customers love</h3><div class="vqa-sub">Words used most in comments scoring 4–5 or NPS 9–10</div>${words(d.themes.happy, C.s1)}</div>
      </div>

      <div class="vqa-grid vqa-two">
        <div class="vqa-card"><h3>Closing the loop</h3><div class="vqa-sub">All-time follow-up backlog · every unhappy answer opens a follow-up</div>
          ${barList([{ name: 'Waiting for a reply', value: f.open }, { name: 'Contacted', value: f.contacted }, { name: 'Resolved', value: f.resolved }], { colors: [SCORE[0], '#d9a441', '#2f7d5f'] })}
          <div class="vqa-sub" style="margin:12px 0 0;">${f.median_hours_to_reply != null ? `Typical time to get back to them: <b>${f.median_hours_to_reply < 1 ? 'under an hour' : f.median_hours_to_reply < 48 ? f.median_hours_to_reply + ' hours' : Math.round(f.median_hours_to_reply / 24) + ' days'}</b>` : 'No first-contact timings recorded yet'}${f.overdue ? ` · <b style="color:${SCORE[0]}">${n(f.overdue)} waiting over 48 hours</b>` : ''}</div></div>
        <div class="vqa-card"><h3>When people answer</h3><div class="vqa-sub">By day and hour (${esc(d.time_zone.replace('Asia/', ''))} time) · ${esc(d.period.window_label)}</div>${heatmap(d.heatmap, d.period.window_label)}</div>
      </div>

      ${d.recent_comments.length ? `<div class="vqa-card" style="margin-bottom:14px;"><h3>Latest comments</h3><div class="vqa-sub">What customers wrote, newest first</div><div class="vqa-feedback">
        ${d.recent_comments.map(c => `<div class="vqa-fb"><div>“${esc(c.comment)}”</div><div class="m">${c.score != null ? `${'★'.repeat(c.score)}${'☆'.repeat(5 - c.score)} · ` : ''}${c.nps != null ? `NPS ${c.nps} · ` : ''}${c.resolved != null ? (c.resolved ? 'Resolved · ' : 'Not resolved · ') : ''}${esc(c.channel)} · ${esc(c.survey)} · ${esc(new Date(c.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))}</div></div>`).join('')}
      </div></div>` : ''}

      ${echoAdvancedHTML(d)}
      <div class="vqa-card"><details><summary>See every figure as a table</summary>${table(lastSeries.headers, lastSeries.rows)}</details></div>
    </div>`;
  }

  function drawEcho(d){
    destroyCharts();
    if(!d || !d.window || !chartReady()) return;
    setChartFont();
    columnChart('vqeResp', d.series, 'responses', 'Answers', d.grain);
    lineChart('vqeCsat', d.series, 'csat', d.grain, { label: 'satisfied' });
    if(d.window.nps_responses){
      lineChart('vqeNps', d.series.map(s => ({ ...s, responses: s.nps_responses })), 'nps', d.grain, { min: -100, max: 100, suffix: '', label: 'NPS' });
      mount('vqeNpsDist', {
        type: 'bar',
        data: { labels: d.nps_distribution.map(x => String(x.score)), datasets: [{ label: 'Answers', data: d.nps_distribution.map(x => x.n),
          backgroundColor: d.nps_distribution.map(x => x.score <= 6 ? SCORE[0] : x.score <= 8 ? SCORE[2] : SCORE[4]), borderRadius: 4, maxBarThickness: 26 }] },
        options: baseOptions({ plugins: { legend: { display: false }, tooltip: Object.assign(baseOptions().plugins.tooltip, {
          callbacks: { title: (items) => `Scored ${items[0].label} of 10`, label: (ctx) => ` ${n(ctx.raw)} answers` } }) } }),
      });
    }
  }

  window.VQA = {
    injectStyles,
    conversationsHTML, drawConversations,
    salesHTML, drawSales,
    echoHTML, drawEcho,
    destroyCharts,
    grains: GRAINS,
  };
})();
