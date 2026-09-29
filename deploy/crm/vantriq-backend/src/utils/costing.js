const db = require('../db');
const engine = require('./costingEngine');

/**
 * The costing model, read from the database.
 *
 * The arithmetic is ./costingEngine.js, so what an admin sees on the Products
 * & Pricing page and what Financials uses cannot disagree. This file only
 * gathers the inputs: live
 * package prices and cost profiles, the stored rate card and assumptions,
 * and the utilisation Settings already holds.
 */

class CostingError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}

async function inputs() {
  const [{ rows: products }, { rows: s }] = await Promise.all([
    db.query(`select * from products where archived = false order by sort_order asc, created_at asc`),
    db.query(`select costing, utilization from settings where id = 1`),
  ]);
  const row = s[0] || {};
  return {
    products,
    stored: row.costing && typeof row.costing === 'object' ? row.costing : {},
    utilization: Number(row.utilization) || engine.ASSUMPTIONS.utilization,
  };
}

/** Hourly labour rate for an add-on's build: half founder, half contracted. */
function addonHourly(a) {
  return 0.5 * Number(a.founder_rate) + 0.5 * Number(a.contractor_rate);
}

/** What each add-on earns, for the admin's view of the catalogue. */
function addonEconomics(addon, a) {
  const monthly = addon.monthly_fee === null ? null : Number(addon.monthly_fee);
  const setup = addon.setup_fee === null ? null : Number(addon.setup_fee);
  const cost = Number(addon.est_monthly_cost || 0);
  const build = Number(addon.est_build_hours || 0) * addonHourly(a);
  return {
    monthly_margin: monthly ? Math.round(((monthly - cost) / monthly) * 1000) / 1000 : null,
    monthly_profit: monthly !== null ? Math.round(monthly - cost) : null,
    build_labour: Math.round(build),
    setup_margin: setup ? Math.round(((setup - build) / setup) * 1000) / 1000 : null,
  };
}

/** The whole model: every package's economics, the steady state, the what-if, the flags. */
async function costingModel({ withAddons = true } = {}) {
  const { products, stored, utilization } = await inputs();
  const model = engine.model(products, stored, { utilization });
  if (withAddons) {
    const { rows } = await db.query(`select * from catalog_addons order by sort_order, name`);
    model.addons = rows.map((r) => ({ ...r, ...addonEconomics(r, model.assumptions) }));
  }
  return model;
}

/**
 * Writes the model's answer back onto each package, so every screen that
 * reads delivery_cost_full (Financials, the dashboard, the export) and the
 * routing line shown on the package use today's costs. Only rows that
 * actually changed are touched.
 */
async function syncDeliveryCosts() {
  const model = await costingModel({ withAddons: false });
  let changed = 0;
  for (const r of model.packages) {
    if (!r.id) continue;
    const { rowCount } = await db.query(
      `update products set delivery_cost_full = $2, ai_model = $3
        where id = $1 and (delivery_cost_full is distinct from $2::numeric or ai_model is distinct from $3)`,
      [r.id, r.ai_full, r.routing]
    );
    changed += rowCount;
  }
  return { model, changed };
}

/* ---------------------------------------------------------------- */
/* Validation — a costing input that is wrong is worse than none.    */
/* ---------------------------------------------------------------- */

const LIMITS = {
  fx_usd_pkr: [50, 2000, 'The exchange rate'],
  user_tokens: [1, 5000, 'Tokens in a customer message'],
  reply_tokens: [1, 5000, 'Tokens in a reply'],
  founder_rate: [0, 100000, 'The founder hourly rate'],
  contractor_rate: [0, 100000, 'The contractor hourly rate'],
  infra_monthly: [0, 10000000, 'Infrastructure per month'],
  sales_hours_per_win: [0, 500, 'Sales hours to win a client'],
  adhoc_hours_per_month: [0, 200, 'Ad-hoc hours a month'],
  hours_per_fte: [1, 400, 'Hours in a full-time month'],
};

function numberIn(value, [min, max, label]) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n) || n < min || n > max) {
    throw new CostingError(400, `${label} must be a number from ${min} to ${max}.`);
  }
  return n;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Applies a change to the stored rate card and assumptions. Anything not
 * named is left as it is. Returns the new stored object.
 */
function applyChange(stored, body) {
  const next = {
    rates: { ...((stored && stored.rates) || {}) },
    assumptions: { ...((stored && stored.assumptions) || {}) },
  };
  const b = body || {};

  if (b.rates && typeof b.rates === 'object') {
    for (const [key, r] of Object.entries(b.rates)) {
      if (!/^[a-z0-9][a-z0-9.\-]{1,60}$/i.test(key)) throw new CostingError(400, `"${key}" is not a usable model key.`);
      if (r === null) { delete next.rates[key]; continue; }
      const known = engine.RATES.find((x) => x.key === key);
      const entry = { ...(next.rates[key] || {}) };
      for (const side of ['input', 'output']) {
        if (r[side] !== undefined) entry[side] = numberIn(r[side], [0, 1000, `The ${side} price for ${known ? known.label : key}`]);
      }
      for (const f of ['label', 'vendor', 'source', 'note']) {
        if (r[f] !== undefined) entry[f] = String(r[f]).slice(0, 200);
      }
      if (!known && (entry.input === undefined || entry.output === undefined)) {
        throw new CostingError(400, `A new model needs both an input and an output price.`);
      }
      entry.as_of = r.as_of && /^\d{4}-\d{2}-\d{2}$/.test(r.as_of) ? r.as_of : today();
      next.rates[key] = entry;
    }
  }

  const a = b.assumptions && typeof b.assumptions === 'object' ? b.assumptions : {};
  let fxChanged = false;
  for (const [k, lim] of Object.entries(LIMITS)) {
    if (a[k] === undefined) continue;
    next.assumptions[k] = numberIn(a[k], lim);
    if (k === 'fx_usd_pkr') fxChanged = true;
  }
  if (a.fx_source !== undefined) next.assumptions.fx_source = String(a.fx_source).slice(0, 200);
  if (a.as_of !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.as_of))) throw new CostingError(400, 'The as-of date must be YYYY-MM-DD.');
    next.assumptions.as_of = String(a.as_of);
  } else if (fxChanged || (b.rates && Object.keys(b.rates).length)) {
    // Touching the prices is re-checking them: the model is as of today.
    next.assumptions.as_of = today();
  }

  const rates = engine.mergeRates(next.rates);
  for (const k of ['bulk_model', 'premium_model']) {
    if (a[k] === undefined) continue;
    if (!rates.some((r) => r.key === a[k])) throw new CostingError(400, `"${a[k]}" is not on the rate card.`);
    next.assumptions[k] = String(a[k]);
  }

  if (a.mix !== undefined) {
    if (!a.mix || typeof a.mix !== 'object') throw new CostingError(400, 'The client mix must be a list of package counts.');
    const mix = { ...(next.assumptions.mix || {}) };
    for (const [name, n] of Object.entries(a.mix)) {
      mix[String(name).slice(0, 80)] = numberIn(n, [0, 1000, `Clients on ${name}`]);
    }
    next.assumptions.mix = mix;
  }
  return next;
}

/** Validated cost-profile fields for one package. */
function profileChange(body, rates) {
  const b = body || {};
  const out = {};
  const ranges = {
    context_tokens: [0, 200000, 'Context tokens per turn'],
    premium_share: [0, 1, 'The premium share'],
    mgmt_hours: [0, 400, 'Management hours a month'],
    build_hours: [0, 2000, 'Build hours'],
    founder_share: [0, 1, 'The founder share'],
    typical_min: [0, 10000000, 'Typical sessions (low)'],
    typical_max: [0, 10000000, 'Typical sessions (high)'],
  };
  for (const [k, lim] of Object.entries(ranges)) {
    if (b[k] === undefined) continue;
    out[k] = b[k] === null || b[k] === '' ? null : numberIn(b[k], lim);
    if (['context_tokens', 'typical_min', 'typical_max'].includes(k) && out[k] !== null) out[k] = Math.round(out[k]);
  }
  for (const k of ['bulk_model', 'premium_model']) {
    if (b[k] === undefined) continue;
    if (b[k] === null || b[k] === '') { out[k] = null; continue; }
    if (!rates.some((r) => r.key === b[k])) throw new CostingError(400, `"${b[k]}" is not on the rate card.`);
    out[k] = String(b[k]);
  }
  if (out.typical_min != null && out.typical_max != null && out.typical_max < out.typical_min) {
    throw new CostingError(400, 'Typical use (high) cannot be below typical use (low).');
  }
  return out;
}

module.exports = {
  engine, CostingError, costingModel, syncDeliveryCosts, applyChange, profileChange, addonEconomics, inputs,
};
