/**
 * The VantriqAI costing engine: what one conversation costs us, and what
 * each package earns at the price the business model sets.
 *
 * ONE CALCULATION. The Products & Pricing API (src/utils/costing.js), the
 * migration that writes each package's delivery cost, and the deploy check
 * all run this file, so the margin an admin sees on screen and the delivery
 * cost Financials uses are one calculation, not several that drift apart.
 * It stays on the server, deliberately — not in public/ — because its
 * defaults are our cost assumptions, and those are admin-only like every
 * other cost figure.
 *
 * THE MODEL, AS THE BUSINESS MODEL DOCUMENT SETS IT OUT.
 *
 *   A session is one customer conversation inside a rolling 24-hour window,
 *   however many messages it takes. Each package budgets a number of
 *   messages per session (12–18). Half are the customer's, half the agent's.
 *
 *   Every customer turn sends the model: the system prompt and retrieved
 *   catalogue context (context_tokens), the conversation so far, and the new
 *   message. The agent's reply comes back as output. So for T turns:
 *
 *     input  = T·context + T·U + (U + R)·T·(T − 1)/2
 *     output = T·R
 *
 *   where U is a customer message and R a reply, in tokens. The history term
 *   is why cost grows faster than message count.
 *
 *   Most turns run on the bulk model; a thin premium_share is escalated to a
 *   premium model. Cost per session = the blend, in dollars, converted at
 *   the costing exchange rate.
 *
 *   Labour is costed by the hour — founder time at an opportunity cost,
 *   contracted time at its cash cost — split by each package's founder
 *   share. Infrastructure is one server for the whole business.
 *
 * Nothing here is a price. Prices come from the products table (and the
 * add-ons catalogue); this file only says what serving them costs.
 */
module.exports = (function () {
  'use strict';

  /** The day these rates and the exchange rate were last checked. */
  const AS_OF = '2026-09-29';

  /**
   * Model prices, US dollars per million tokens, standard (non-batch,
   * uncached) rates. Checked against each vendor's published price list on
   * AS_OF. Prompt caching is NOT assumed anywhere: it would lower the input
   * cost of the repeated system prompt, and is left as upside rather than
   * booked as a saving nobody has measured.
   */
  const RATES = [
    { key: 'gpt-4o-mini', label: 'GPT-4o mini', vendor: 'OpenAI', input: 0.15, output: 0.60,
      as_of: AS_OF, source: 'openai.com/api/pricing', note: 'What the live WhatsApp and website agents run on today.' },
    { key: 'gpt-5-nano', label: 'GPT-5 nano', vendor: 'OpenAI', input: 0.05, output: 0.40,
      as_of: AS_OF, source: 'openai.com/api/pricing', note: 'Cheapest capable option; test on Roman Urdu before routing to it.' },
    { key: 'gpt-5-mini', label: 'GPT-5 mini', vendor: 'OpenAI', input: 0.25, output: 2.00,
      as_of: AS_OF, source: 'openai.com/api/pricing', note: '' },
    { key: 'gpt-4o', label: 'GPT-4o', vendor: 'OpenAI', input: 2.50, output: 10.00,
      as_of: AS_OF, source: 'openai.com/api/pricing', note: '' },
    { key: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', vendor: 'Google', input: 0.10, output: 0.40,
      as_of: AS_OF, source: 'ai.google.dev/pricing', note: 'Google retires it on 16 Oct 2026 — do not build on it.', retiring: '2026-10-16' },
    { key: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', vendor: 'Google', input: 0.25, output: 1.50,
      as_of: AS_OF, source: 'ai.google.dev/pricing', note: '' },
    { key: 'gemini-3-flash', label: 'Gemini 3 Flash', vendor: 'Google', input: 0.50, output: 3.00,
      as_of: AS_OF, source: 'ai.google.dev/pricing',
      note: 'The August 2026 model costed this at 0.075 / 0.30, which is Gemini 1.5 Flash\'s old price. At today\'s price it would erase most of the margin.' },
    { key: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', vendor: 'Anthropic', input: 1.00, output: 5.00,
      as_of: AS_OF, source: 'anthropic.com/pricing', note: '' },
    { key: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', vendor: 'Anthropic', input: 2.00, output: 10.00,
      as_of: AS_OF, source: 'anthropic.com/pricing', note: 'The premium lane: escalated turns only.' },
    { key: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', vendor: 'Anthropic', input: 3.00, output: 15.00,
      as_of: AS_OF, source: 'anthropic.com/pricing', note: '' },
    { key: 'claude-opus-5-5', label: 'Claude Opus 5.5', vendor: 'Anthropic', input: 4.00, output: 20.00,
      as_of: AS_OF, source: 'anthropic.com/pricing', note: '' },
  ];

  /** Everything else the model assumes. Editable in Products & Pricing. */
  const ASSUMPTIONS = {
    as_of: AS_OF,
    fx_usd_pkr: 277.05,
    fx_source: 'Interbank rate, late September 2026',
    bulk_model: 'gpt-4o-mini',
    premium_model: 'claude-sonnet-5-5',
    user_tokens: 30,              // a customer's message
    reply_tokens: 80,             // the agent's reply
    founder_rate: 3000,           // PKR per hour — an opportunity cost, not cash
    contractor_rate: 1500,        // PKR per hour — contracted build and support
    utilization: 0.70,            // share of the allowance an average client uses (Settings)
    infra_monthly: 1668,          // one server: n8n, the CRM, Postgres — the whole business
    sales_hours_per_win: 5,       // unbilled selling to win one client
    adhoc_hours_per_month: 0.5,   // unplanned requests beyond the management budget
    hours_per_fte: 160,           // one full-time person, per month
    mix: { Starter: 6, Growth: 6, Scale: 3, Pro: 2, Enterprise: 1, 'Enterprise+': 0 },
  };

  /**
   * Each package's cost profile. The labour hours reproduce the business
   * model exactly: management 3,000 / 5,100 / 7,200 / 10,125 / 12,600 /
   * 18,900 a month and build 12,000 / 25,500 / 38,400 / 54,000 / 75,600 /
   * 105,000, at founder shares of 100 / 70 / 60 / 50 / 40 / 40%.
   */
  const PROFILES = {
    Starter:       { context_tokens: 1200, premium_share: 0.02, mgmt_hours: 1,   build_hours: 4,  founder_share: 1.0, typical_min: 300,   typical_max: 600 },
    Growth:        { context_tokens: 1500, premium_share: 0.03, mgmt_hours: 2,   build_hours: 10, founder_share: 0.7, typical_min: 800,   typical_max: 1500 },
    Scale:         { context_tokens: 1800, premium_share: 0.04, mgmt_hours: 3,   build_hours: 16, founder_share: 0.6, typical_min: 2000,  typical_max: 4000 },
    Pro:           { context_tokens: 2200, premium_share: 0.05, mgmt_hours: 4.5, build_hours: 24, founder_share: 0.5, typical_min: 4000,  typical_max: 8000 },
    Enterprise:    { context_tokens: 2600, premium_share: 0.06, mgmt_hours: 6,   build_hours: 36, founder_share: 0.4, typical_min: 8000,  typical_max: 15000 },
    'Enterprise+': { context_tokens: 3000, premium_share: 0.08, mgmt_hours: 9,   build_hours: 50, founder_share: 0.4, typical_min: 15000, typical_max: null },
  };
  const DEFAULT_PROFILE = {
    context_tokens: 1800, premium_share: 0.05, mgmt_hours: 3, build_hours: 16, founder_share: 0.6,
    typical_min: null, typical_max: null,
  };
  const PROFILE_FIELDS = ['context_tokens', 'premium_share', 'mgmt_hours', 'build_hours', 'founder_share',
    'typical_min', 'typical_max', 'bulk_model', 'premium_model'];

  /** The bulk models worth comparing in the what-if. */
  const WHAT_IF_MODELS = ['gpt-4o-mini', 'gpt-5-nano', 'gpt-5-mini', 'gemini-3.1-flash-lite', 'gemini-3-flash', 'claude-haiku-4-5'];

  /* ---------------------------------------------------------------- */

  const num = (v, d = 0) => {
    const n = Number(v);
    return v === null || v === undefined || v === '' || !Number.isFinite(n) ? d : n;
  };
  const isSet = (v) => v !== null && v !== undefined && v !== '';

  /**
   * The rate card in force: the built-in list with any stored overrides on
   * top. Overrides are keyed by model; a stored model the list does not know
   * is kept too, so a rate added in the CRM survives an upgrade.
   */
  function mergeRates(overrides) {
    const o = overrides && typeof overrides === 'object' ? overrides : {};
    const out = RATES.map((r) => (o[r.key] ? { ...r, ...clean(o[r.key]), key: r.key, overridden: true } : { ...r }));
    for (const [key, r] of Object.entries(o)) {
      if (!RATES.some((x) => x.key === key) && r && isSet(r.input) && isSet(r.output)) {
        out.push({ key, label: r.label || key, vendor: r.vendor || '', note: '', source: '', as_of: '', ...clean(r), custom: true, overridden: true });
      }
    }
    return out;
  }
  function clean(r) {
    const c = {};
    for (const k of ['label', 'vendor', 'input', 'output', 'as_of', 'source', 'note']) {
      if (r[k] !== undefined) c[k] = k === 'input' || k === 'output' ? num(r[k]) : String(r[k]);
    }
    return c;
  }

  function mergeAssumptions(overrides, extra) {
    const o = overrides && typeof overrides === 'object' ? overrides : {};
    const a = { ...ASSUMPTIONS, mix: { ...ASSUMPTIONS.mix } };
    for (const k of Object.keys(ASSUMPTIONS)) {
      if (k === 'mix') continue;
      if (isSet(o[k])) a[k] = typeof ASSUMPTIONS[k] === 'number' ? num(o[k], ASSUMPTIONS[k]) : String(o[k]);
    }
    if (o.mix && typeof o.mix === 'object') {
      for (const [name, n] of Object.entries(o.mix)) a.mix[name] = Math.max(0, Math.round(num(n)));
    }
    if (extra) Object.assign(a, extra);
    return a;
  }

  /** A package's profile: its own stored values, else the model's for that name. */
  function profileFor(product) {
    const base = PROFILES[product && product.name] || DEFAULT_PROFILE;
    const p = { ...base, bulk_model: null, premium_model: null };
    for (const f of PROFILE_FIELDS) {
      if (product && isSet(product[f])) p[f] = f.endsWith('_model') ? String(product[f]) : num(product[f]);
    }
    return p;
  }

  const rateFor = (rates, key) => rates.find((r) => r.key === key) || null;

  /** Tokens one session sends and receives. */
  function sessionTokens(messages, contextTokens, a) {
    const turns = Math.max(1, Math.floor(num(messages) / 2));
    const U = num(a.user_tokens), R = num(a.reply_tokens), ctx = num(contextTokens);
    return {
      turns,
      input: turns * ctx + turns * U + (U + R) * turns * (turns - 1) / 2,
      output: turns * R,
    };
  }

  const usdFor = (rate, t) => (rate ? (t.input * rate.input + t.output * rate.output) / 1e6 : 0);

  /** Money, rounded the way the documents print it. */
  const r2 = (n) => Math.round(n * 100) / 100;
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const pct = (n) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);

  /**
   * What one package costs and earns. `opts.bulk_model` overrides the bulk
   * model for a what-if without touching anything stored.
   */
  function packageEconomics(product, a, rates, opts = {}) {
    const prof = profileFor(product);
    const bulkKey = opts.bulk_model || prof.bulk_model || a.bulk_model;
    const premKey = prof.premium_model || a.premium_model;
    const bulk = rateFor(rates, bulkKey);
    const prem = rateFor(rates, premKey);
    const msgs = num(product.msgs_per_session);
    const t = sessionTokens(msgs, prof.context_tokens, a);
    const share = Math.min(1, Math.max(0, num(prof.premium_share)));
    const usd = (1 - share) * usdFor(bulk, t) + share * usdFor(prem, t);
    const perSession = usd * num(a.fx_usd_pkr);

    const quota = num(product.quota);
    const retainer = num(product.retainer);
    const setup = num(product.setup_fee);
    const overage = num(product.overage_rate);
    const u = num(a.utilization, ASSUMPTIONS.utilization);

    const aiFull = perSession * quota;
    const hourly = prof.founder_share * num(a.founder_rate) + (1 - prof.founder_share) * num(a.contractor_rate);
    const mgmt = prof.mgmt_hours * hourly;
    const build = prof.build_hours * hourly;
    const grossFull = retainer - aiFull - mgmt;
    const grossUtil = retainer - u * aiFull - mgmt;

    const yearRevenue = setup + 12 * retainer;
    const yearCost = 12 * u * aiFull + build + 12 * mgmt
      + num(a.sales_hours_per_win) * num(a.founder_rate)
      + 12 * num(a.adhoc_hours_per_month) * num(a.founder_rate);

    const typicalMid = prof.typical_min && prof.typical_max
      ? (prof.typical_min + prof.typical_max) / 2 : (prof.typical_min || null);

    return {
      id: product.id || null,
      name: product.name,
      is_standard: product.is_standard !== false,
      setup_fee: setup,
      retainer,
      quota,
      per_day: quota ? Math.round(quota / 30) : 0,
      overage_rate: overage,
      msgs_per_session: msgs,
      profile: prof,
      bulk_model: bulkKey,
      bulk_label: bulk ? bulk.label : bulkKey,
      premium_model: premKey,
      premium_label: prem ? prem.label : premKey,
      premium_share: share,
      routing: `${bulk ? bulk.label : bulkKey}; ${Math.round(share * 100)}% escalated to ${prem ? prem.label : premKey}`,
      tokens: { turns: t.turns, input: Math.round(t.input), output: Math.round(t.output) },
      cost_per_session_usd: r4(usd),
      cost_per_session: r4(perSession),
      ai_full: Math.round(aiFull),
      ai_at_util: Math.round(aiFull * u),
      ai_share_of_price: retainer ? pct(aiFull / retainer) : null,
      ai_at_typical: typicalMid ? Math.round(perSession * typicalMid) : null,
      hourly_rate: Math.round(hourly),
      mgmt_hours: prof.mgmt_hours,
      mgmt_labour: Math.round(mgmt),
      build_hours: prof.build_hours,
      build_labour: Math.round(build),
      gross_full: Math.round(grossFull),
      gross_util: Math.round(grossUtil),
      margin_full: retainer ? pct(grossFull / retainer) : null,
      margin_util: retainer ? pct(grossUtil / retainer) : null,
      setup_margin: setup ? pct((setup - build) / setup) : null,
      setup_profit: Math.round(setup - build),
      overage_cover: perSession ? Math.round((overage / perSession) * 10) / 10 : null,
      overage_profit: r2(overage - perSession),
      headroom_low: prof.typical_max ? Math.round((quota / prof.typical_max) * 10) / 10 : null,
      headroom_high: prof.typical_min ? Math.round((quota / prof.typical_min) * 10) / 10 : null,
      typical_min: prof.typical_min,
      typical_max: prof.typical_max,
      // Sessions a month at which the retainer no longer covers AI plus
      // management — the point overage has to start paying for itself.
      break_even_sessions: perSession ? Math.round((retainer - mgmt) / perSession) : null,
      year_one_revenue: Math.round(yearRevenue),
      year_one_margin: yearRevenue ? pct((yearRevenue - yearCost) / yearRevenue) : null,
    };
  }

  /** The business at a given client mix, over a year. */
  function steadyState(rows, a) {
    const mix = a.mix || {};
    let clients = 0, setupRev = 0, retainerRev = 0, ai = 0, build = 0, mgmt = 0, mgmtHours = 0;
    const lines = [];
    for (const r of rows) {
      const n = Math.max(0, Math.round(num(mix[r.name])));
      if (!n) continue;
      clients += n;
      setupRev += n * r.setup_fee;
      retainerRev += n * 12 * r.retainer;
      ai += n * 12 * num(a.utilization) * r.ai_full;
      build += n * r.build_labour;
      mgmt += n * 12 * r.mgmt_labour;
      mgmtHours += n * r.mgmt_hours;
      lines.push({ name: r.name, clients: n, revenue: n * (r.setup_fee + 12 * r.retainer) });
    }
    const revenue = setupRev + retainerRev;
    const labour = build + mgmt;
    const infra = 12 * num(a.infra_monthly);
    const contribution = revenue - ai - labour - infra;
    const fte = num(a.hours_per_fte, 160);
    const avgMonthly = clients ? retainerRev / 12 / clients : 0;
    const hoursPerClient = clients ? mgmtHours / clients : 0;
    // The ceiling the model warns about: management hours fill one person.
    const ceilingClients = hoursPerClient ? Math.floor((fte * 0.55) / hoursPerClient) : 0;
    return {
      clients,
      lines,
      revenue: Math.round(revenue),
      setup_revenue: Math.round(setupRev),
      retainer_revenue: Math.round(retainerRev),
      ai: Math.round(ai),
      labour: Math.round(labour),
      build_labour: Math.round(build),
      mgmt_labour: Math.round(mgmt),
      infra: Math.round(infra),
      contribution: Math.round(contribution),
      margin: revenue ? pct(contribution / revenue) : null,
      ai_share: revenue ? pct(ai / revenue) : null,
      labour_share: revenue ? pct(labour / revenue) : null,
      infra_share: revenue ? pct(infra / revenue) : null,
      mgmt_hours_month: Math.round(mgmtHours * 10) / 10,
      fte_share: pct(mgmtHours / fte),
      avg_monthly_plan: Math.round(avgMonthly),
      ceiling_clients: ceilingClients,
      ceiling_revenue: Math.round(ceilingClients * avgMonthly * 12),
    };
  }

  /** Things an admin should look at, in plain words. */
  function flags(rows, a, rates, today) {
    const out = [];
    const now = today ? new Date(today) : new Date();
    const days = (d) => (d ? Math.floor((now - new Date(d)) / 86400000) : null);
    const bulk = rateFor(rates, a.bulk_model);
    if (!bulk) out.push({ level: 'bad', text: `The bulk model "${a.bulk_model}" is not on the rate card, so AI cost reads as zero.` });
    if (bulk && bulk.retiring) out.push({ level: 'bad', text: `${bulk.label} is being retired on ${bulk.retiring}. Move the bulk model before then.` });
    if (!rateFor(rates, a.premium_model)) out.push({ level: 'bad', text: `The premium model "${a.premium_model}" is not on the rate card.` });
    const age = days(a.as_of);
    if (age !== null && age > 90) out.push({ level: 'warn', text: `Model prices were last checked ${age} days ago. Vendors change them — re-check the rate card.` });
    for (const r of rows) {
      if (r.overage_cover !== null && r.overage_cover < 1) {
        out.push({ level: 'bad', text: `${r.name}: the overage rate (PKR ${r.overage_rate}) is below what a session costs (PKR ${r.cost_per_session.toFixed(2)}). Every session past the allowance loses money.` });
      } else if (r.overage_cover !== null && r.overage_cover < 2) {
        out.push({ level: 'warn', text: `${r.name}: overage covers only ${r.overage_cover}× the cost of a session; the business model aims for about 3×.` });
      }
      if (r.margin_full !== null && r.margin_full < 0.5) {
        out.push({ level: 'warn', text: `${r.name}: margin falls to ${Math.round(r.margin_full * 100)}% if a client uses the whole allowance.` });
      }
    }
    return out;
  }

  /**
   * Everything the Products & Pricing page shows, in one call.
   *
   * @param {object[]} products  rows from the products table
   * @param {object}   stored    { rates: {key: {...}}, assumptions: {...} } overrides
   * @param {object}   extra     values that live elsewhere (utilization from Settings)
   */
  function model(products, stored, extra, today) {
    const s = stored && typeof stored === 'object' ? stored : {};
    const rates = mergeRates(s.rates);
    const a = mergeAssumptions(s.assumptions, extra);
    const live = (products || []).filter((p) => !p.archived);
    const rows = live.map((p) => packageEconomics(p, a, rates));
    const whatIf = WHAT_IF_MODELS.filter((k) => rateFor(rates, k)).map((key) => {
      const alt = live.map((p) => packageEconomics(p, a, rates, { bulk_model: key }));
      const st = steadyState(alt, a);
      return {
        bulk_model: key,
        label: rateFor(rates, key).label,
        current: key === a.bulk_model,
        packages: alt.map((r) => ({
          name: r.name, cost_per_session: r.cost_per_session, margin_full: r.margin_full,
          margin_util: r.margin_util, overage_cover: r.overage_cover,
        })),
        steady_margin: st.margin,
      };
    });
    return {
      as_of: a.as_of,
      assumptions: a,
      rates,
      packages: rows,
      steady_state: steadyState(rows, a),
      what_if: whatIf,
      flags: flags(rows, a, rates, today),
    };
  }

  /** The routing line stored on a product, from its economics. */
  const routingText = (row) => row.routing;

  return {
    AS_OF, RATES, ASSUMPTIONS, PROFILES, DEFAULT_PROFILE, PROFILE_FIELDS, WHAT_IF_MODELS,
    mergeRates, mergeAssumptions, profileFor, sessionTokens, packageEconomics, steadyState, flags, model,
    routingText,
  };
}());
