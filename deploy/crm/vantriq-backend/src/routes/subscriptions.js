const express = require('express');
const db = require('../db');
const subs = require('../utils/subscriptions');
const { effectivePackage, inUsd } = require('../utils/pkg');
const { ROUND } = require('../utils/billing');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * Bundles, scheduled changes, metered rates, and the monthly run.
 *
 * A bundle is another package added alongside the one a client is already on
 * rather than replacing it. That is the answer to "their package has run its
 * course, they want another" and to "the Instagram agent needs its own
 * allowance" alike: the quota adds, the retainer adds, and it all lands on
 * one invoice with one line each.
 */

/* ---------------------------- Bundles ---------------------------- */

/**
 * Prices a bundle from a package, snapshotting what the catalogue says today.
 * Re-pricing the catalogue later must not re-price a bundle somebody is
 * already paying for, which is why the figures are copied rather than joined.
 */
async function priceFromProduct(client, productId, overrides = {}) {
  const { rows } = await db.query(`select * from products where id = $1 and archived = false`, [productId]);
  const product = rows[0];
  if (!product) return null;
  const eff = effectivePackage(client, product);
  return {
    product_id: product.id,
    name: overrides.name || `${product.name} bundle`,
    unit_setup_fee: overrides.unit_setup_fee !== undefined ? Number(overrides.unit_setup_fee) : Number(eff.setup_fee),
    unit_retainer: overrides.unit_retainer !== undefined ? Number(overrides.unit_retainer) : Number(eff.retainer),
    unit_quota: overrides.unit_quota !== undefined ? Number(overrides.unit_quota) : Number(eff.quota),
    overage_rate: overrides.overage_rate !== undefined ? Number(overrides.overage_rate) : Number(eff.overage_rate),
  };
}

/**
 * Prices a bundle from a catalogue add-on (v9.34), in the client's currency.
 * An add-on carries no conversations of its own; a metered one (the Voice
 * Agent's call minutes) gets its rate card when the bundle is created.
 */
async function priceFromAddon(client, key, overrides = {}) {
  const { rows } = await db.query(`select * from catalog_addons where key = $1 and active = true`, [key]);
  const a = rows[0];
  if (!a) return null;
  if (a.price_basis === 'scope' || a.price_basis === 'included') return { error: `${a.name} is ${a.price_basis === 'scope' ? 'priced on scope' : 'already included'}: add it as a named bundle with the agreed figures.` };
  const usd = inUsd(client);
  const pick = (col) => (usd && a[`${col}_usd`] !== null && a[`${col}_usd`] !== undefined ? Number(a[`${col}_usd`]) : Number(a[col] || 0));
  return {
    product_id: null,
    addon: a,
    addon_key: a.key,
    name: overrides.name || a.name,
    unit_setup_fee: overrides.unit_setup_fee !== undefined ? Number(overrides.unit_setup_fee) : pick('setup_fee'),
    unit_retainer: overrides.unit_retainer !== undefined ? Number(overrides.unit_retainer) : pick('monthly_fee'),
    unit_quota: 0,
    overage_rate: 0,
    meter_rate: a.meter ? (overrides.meter_rate !== undefined ? Number(overrides.meter_rate) : pick('overage_rate')) : null,
  };
}

const METER_LABEL = { call_minute: 'Phone-call minutes (Voice Agent)', voice_minute: 'Voice-note minutes' };

router.get('/bundles', async (req, res) => {
  const { client_id, status } = req.query;
  const clauses = [];
  const params = [];
  if (client_id) { params.push(client_id); clauses.push(`b.client_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`b.status = $${params.length}`); }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const { rows } = await db.query(
    `select b.*, c.company, a.name as agent_name, a.kind as agent_kind, p.name as product_name
       from client_bundles b
       join clients c on c.id = b.client_id
       left join client_agents a on a.id = b.agent_id
       left join products p on p.id = b.product_id
       ${where}
      order by c.company, b.starts_on desc`,
    params
  );
  res.json(rows);
});

router.post('/bundles', async (req, res) => {
  const body = req.body || {};
  if (!body.client_id) return res.status(400).json({ error: 'client_id is required' });
  const { rows: cRows } = await db.query(`select * from clients where id = $1`, [body.client_id]);
  const client = cRows[0];
  if (!client) return res.status(404).json({ error: 'Client not found' });

  let priced;
  if (body.addon_key) {
    priced = await priceFromAddon(client, String(body.addon_key), body);
    if (!priced) return res.status(404).json({ error: 'That add-on is not in the catalogue.' });
    if (priced.error) return res.status(400).json({ error: priced.error });
  } else if (body.product_id) {
    priced = await priceFromProduct(client, body.product_id, body);
    if (!priced) return res.status(404).json({ error: 'That package is not available.' });
  } else {
    // A bundle need not come from the catalogue — a negotiated top-up is
    // just a name, a price and an allowance.
    if (!body.name) return res.status(400).json({ error: 'Give the bundle a name, or pick a package to base it on.' });
    priced = {
      product_id: null,
      name: String(body.name),
      unit_setup_fee: Number(body.unit_setup_fee || 0),
      unit_retainer: Number(body.unit_retainer || 0),
      unit_quota: Number(body.unit_quota || 0),
      overage_rate: Number(body.overage_rate || 0),
    };
  }

  if (body.agent_id) {
    const { rows: agent } = await db.query(
      `select id from client_agents where id = $1 and client_id = $2`, [body.agent_id, client.id]
    );
    if (!agent[0]) return res.status(400).json({ error: 'That agent does not belong to this client.' });
  }

  const startsOn = body.starts_on || new Date().toISOString().slice(0, 10);
  const status = subs.DAY(startsOn) > subs.DAY(new Date()) ? 'scheduled' : 'active';

  const { rows } = await db.query(
    `insert into client_bundles
       (client_id, agent_id, product_id, name, qty, unit_setup_fee, unit_retainer, unit_quota,
        overage_rate, recurring, status, starts_on, ends_on, added_by, note, addon_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
    [
      client.id, body.agent_id || null, priced.product_id, priced.name,
      Number(body.qty || 1), priced.unit_setup_fee, priced.unit_retainer, priced.unit_quota,
      priced.overage_rate, body.recurring !== false, status,
      startsOn, body.ends_on || null,
      body.added_by || 'admin', body.note || '', priced.addon_key || null,
    ]
  );
  // A metered add-on bills its units from the day it starts: the rate card
  // is created with it and ended with it.
  if (priced.addon && priced.addon.meter) {
    await db.query(
      `insert into usage_rates (client_id, metric, unit_rate, included_units, unit_size, label, effective_from, effective_to, bundle_id)
       values ($1, $2, $3, $4, 1, $5, $6, $7, $8)`,
      [client.id, priced.addon.meter, priced.meter_rate, Number(priced.addon.included_units || 0),
        METER_LABEL[priced.addon.meter] || priced.addon.name, startsOn, body.ends_on || null, rows[0].id]
    );
  }
  res.status(201).json(rows[0]);
});

/** Ends the rate card a metered add-on created, on the day the add-on ends. */
async function endBundleRates(bundle) {
  if (!bundle || !['ended', 'cancelled'].includes(bundle.status) && !bundle.ends_on) return;
  await db.query(
    `update usage_rates set effective_to = coalesce($2::date, current_date)
      where bundle_id = $1 and (effective_to is null or effective_to > coalesce($2::date, current_date))`,
    [bundle.id, bundle.ends_on]
  );
}

router.patch('/bundles/:id', async (req, res) => {
  const allowed = ['name', 'qty', 'unit_setup_fee', 'unit_retainer', 'unit_quota',
    'overage_rate', 'recurring', 'status', 'starts_on', 'ends_on', 'note', 'agent_id'];
  const sets = [];
  const params = [req.params.id];
  for (const f of allowed) {
    if (req.body[f] === undefined) continue;
    params.push(req.body[f] === '' ? null : req.body[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await db.query(
    `update client_bundles set ${sets.join(', ')} where id = $1 returning *`, params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Bundle not found' });
  await endBundleRates(rows[0]);
  res.json(rows[0]);
});

/**
 * Ending a bundle rather than deleting it. A bundle that has been billed is
 * part of the record; deleting it would rewrite invoices it appears on.
 * ?purge=true removes one that never billed.
 */
router.delete('/bundles/:id', blockAutomation, async (req, res) => {
  const { rows: existing } = await db.query(
    `select b.*, (select count(*) from invoice_lines where bundle_id = b.id) as billed
       from client_bundles b where b.id = $1`, [req.params.id]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Bundle not found' });
  if (String(req.query.purge) === 'true') {
    if (Number(existing[0].billed) > 0) {
      return res.status(409).json({ error: 'This bundle has been billed, so it cannot be deleted. End it instead.' });
    }
    await db.query(`delete from client_bundles where id = $1`, [req.params.id]);
    return res.status(204).end();
  }
  const { rows } = await db.query(
    `update client_bundles
        set status = 'ended', ends_on = coalesce(ends_on, current_date)
      where id = $1 returning *`,
    [req.params.id]
  );
  await endBundleRates(rows[0]);
  res.json(rows[0]);
});

/* ------------------- One client's whole subscription ------------------- */
router.get('/:client_id', async (req, res) => {
  const s = await subs.subscriptionOf(req.params.client_id, req.query.on);
  if (!s) return res.status(404).json({ error: 'Client not found' });
  res.json(s);
});

/** What this client would be billed for a month, without billing them. */
router.get('/:client_id/preview', async (req, res) => {
  const { rows } = await db.query(`select * from clients where id = $1`, [req.params.client_id]);
  if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
  const bill = await subs.buildMonthlyBill(rows[0], req.query.month || new Date());
  res.json(bill || { period: null, lines: [], amount: 0, note: 'Nothing to bill for this month.' });
});

/* ---------------------- Scheduled package changes ---------------------- */
router.get('/:client_id/phases', async (req, res) => {
  const { rows } = await db.query(
    `select p.*, pr.name as product_name from subscription_phases p
       join products pr on pr.id = p.product_id
      where p.client_id = $1 order by p.effective_on desc`,
    [req.params.client_id]
  );
  res.json(rows);
});

router.post('/:client_id/phases', async (req, res) => {
  const { product_id, effective_on, note } = req.body || {};
  if (!product_id || !effective_on) {
    return res.status(400).json({ error: 'product_id and effective_on are required' });
  }
  if (subs.DAY(effective_on) <= subs.DAY(new Date())) {
    return res.status(400).json({ error: 'A scheduled change has to be in the future. Change the package directly for today.' });
  }
  const { rows } = await db.query(
    `insert into subscription_phases (client_id, product_id, effective_on, note, created_by)
     values ($1,$2,$3,$4,$5) returning *`,
    [req.params.client_id, product_id, effective_on, note || '', (req.user && req.user.email) || req.authKind || '']
  );
  res.status(201).json(rows[0]);
});

router.delete('/phases/:id', async (req, res) => {
  const { rows } = await db.query(
    `update subscription_phases set status = 'cancelled' where id = $1 and status = 'scheduled' returning *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No scheduled change with that id.' });
  res.json(rows[0]);
});

module.exports = router;
