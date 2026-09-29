const express = require('express');
const db = require('../db');
const { isAdminRequest } = require('../middleware/auth');
const { costingModel, addonEconomics } = require('../utils/costing');
const router = express.Router();

/**
 * The add-ons catalogue: capabilities, department solutions, the insight
 * modules (Pulse, Echo, Human Support…) and deployment options, each priced
 * separately from the package.
 *
 * Staff read it — the quote builder offers these as lines — but only an
 * admin changes it, and only an admin receives what an add-on costs us
 * (est_monthly_cost, est_build_hours and the margins worked out from them).
 */

const FAMILIES = ['capability', 'solution', 'insight', 'deployment'];
const BASES = ['fixed', 'from', 'included', 'scope'];
const PRIVATE = ['est_monthly_cost', 'est_build_hours', 'cost_note'];

class AddonError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}

function adminOnly(req, res, next) {
  if (isAdminRequest(req)) return next();
  return res.status(403).json({ error: 'Only an admin can change the add-ons catalogue.' });
}

const strip = (row) => {
  const out = { ...row };
  for (const k of PRIVATE) delete out[k];
  return out;
};

function money(v, label) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000000) throw new AddonError(400, `${label} must be a positive amount.`);
  return Math.round(n * 100) / 100;
}

/** A clean, validated set of columns from a request body. */
function fields(body, { creating }) {
  const b = body || {};
  const out = {};
  if (creating || b.name !== undefined) {
    const name = String(b.name || '').trim();
    if (!name) throw new AddonError(400, 'Give the add-on a name.');
    out.name = name.slice(0, 120);
  }
  if (b.family !== undefined || creating) {
    const f = String(b.family || 'capability');
    if (!FAMILIES.includes(f)) throw new AddonError(400, `Family must be one of: ${FAMILIES.join(', ')}.`);
    out.family = f;
  }
  if (b.price_basis !== undefined || creating) {
    const p = String(b.price_basis || 'fixed');
    if (!BASES.includes(p)) throw new AddonError(400, `Price basis must be one of: ${BASES.join(', ')}.`);
    out.price_basis = p;
  }
  for (const k of ['summary', 'price_note', 'availability', 'cost_note']) {
    if (b[k] !== undefined) out[k] = String(b[k] || '').slice(0, k === 'summary' ? 600 : 200);
  }
  if (b.setup_fee !== undefined) out.setup_fee = money(b.setup_fee, 'The setup fee');
  if (b.monthly_fee !== undefined) out.monthly_fee = money(b.monthly_fee, 'The monthly fee');
  if (b.est_monthly_cost !== undefined) out.est_monthly_cost = money(b.est_monthly_cost, 'The monthly cost') || 0;
  if (b.est_build_hours !== undefined) {
    const h = Number(b.est_build_hours || 0);
    if (!Number.isFinite(h) || h < 0 || h > 5000) throw new AddonError(400, 'Build hours must be 0 or more.');
    out.est_build_hours = h;
  }
  if (b.sort_order !== undefined) out.sort_order = Math.round(Number(b.sort_order) || 0);
  if (b.is_new !== undefined) out.is_new = b.is_new === true || b.is_new === 'true';
  if (b.active !== undefined) out.active = b.active === true || b.active === 'true';

  // A fixed or "from" price needs its figures; "included" is free by
  // definition; "scope" has none until the scoping is done.
  const basis = out.price_basis;
  if (basis === 'included') { out.setup_fee = 0; out.monthly_fee = 0; }
  if (basis === 'scope') { out.setup_fee = null; out.monthly_fee = null; }
  return out;
}

function keyFrom(name) {
  return String(name || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

router.get('/', async (req, res) => {
  const admin = isAdminRequest(req);
  const { rows } = await db.query(
    `select * from catalog_addons ${admin ? '' : 'where active = true'} order by sort_order, name`
  );
  if (!admin) return res.json(rows.map(strip));
  const model = await costingModel({ withAddons: false });
  res.json(rows.map((r) => ({ ...r, ...addonEconomics(r, model.assumptions) })));
});

router.post('/', adminOnly, async (req, res) => {
  const f = fields(req.body, { creating: true });
  if ((f.price_basis === 'fixed' || f.price_basis === 'from') && (f.setup_fee == null || f.monthly_fee == null)) {
    throw new AddonError(400, 'A priced add-on needs both a setup fee and a monthly fee (0 is fine).');
  }
  let key = keyFrom((req.body && req.body.key) || f.name);
  if (!key) throw new AddonError(400, 'Give the add-on a name.');
  const { rows: clash } = await db.query(`select 1 from catalog_addons where key = $1`, [key]);
  if (clash[0]) key = `${key}-${Date.now().toString(36).slice(-4)}`;
  const cols = ['key', ...Object.keys(f)];
  const vals = [key, ...Object.values(f)];
  const { rows } = await db.query(
    `insert into catalog_addons (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
    vals
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', adminOnly, async (req, res) => {
  const { rows: ex } = await db.query(`select * from catalog_addons where id = $1`, [req.params.id]);
  if (!ex[0]) throw new AddonError(404, 'Add-on not found');
  const f = fields(req.body, { creating: false });
  const basis = f.price_basis || ex[0].price_basis;
  const setup = f.setup_fee !== undefined ? f.setup_fee : ex[0].setup_fee;
  const monthly = f.monthly_fee !== undefined ? f.monthly_fee : ex[0].monthly_fee;
  if ((basis === 'fixed' || basis === 'from') && (setup == null || monthly == null)) {
    throw new AddonError(400, 'A priced add-on needs both a setup fee and a monthly fee (0 is fine).');
  }
  const cols = Object.keys(f);
  if (!cols.length) throw new AddonError(400, 'Nothing to change.');
  const { rows } = await db.query(
    `update catalog_addons set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1 returning *`,
    [req.params.id, ...cols.map((c) => f[c])]
  );
  res.json(rows[0]);
});

/** Retires an add-on from new quotes. Quotes that already name it keep it. */
router.delete('/:id', adminOnly, async (req, res) => {
  const { rows } = await db.query(
    `update catalog_addons set active = false where id = $1 returning *`, [req.params.id]
  );
  if (!rows[0]) throw new AddonError(404, 'Add-on not found');
  res.json(rows[0]);
});

module.exports = router;
module.exports.strip = strip;
