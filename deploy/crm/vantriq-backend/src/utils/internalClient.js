const db = require('../db');

/**
 * VantriqAI as a customer of VantriqAI.
 *
 * The site assistant on vantriqai.com and the WhatsApp agent are real agents
 * doing real work at real cost, and until now that cost was invisible: usage
 * arrived under no client, so it was never metered and never priced.
 *
 * So the company becomes its own account — Enterprise+, because that is the
 * tier its own workload sits in — with an agent per channel. Everything then
 * works exactly as it does for a paying client: usage is metered per agent,
 * the monthly run raises an invoice, quota crossings are flagged.
 *
 * The one difference is where the money goes. The account is flagged
 * `is_internal`, which means:
 *
 *   - no GST is charged and nothing is withheld (you cannot tax yourself),
 *   - the invoice is settled the moment it is issued, so it never appears
 *     as a receivable,
 *   - the financials read it as COST, never revenue.
 *
 * Idempotent: run it as often as you like. It creates what is missing and
 * leaves what exists alone.
 */

/**
 * An agent's external_ref has to be EXACTLY what the n8n workflow posts, or
 * the usage lands nowhere and fails silently. Both of these are the live
 * values, taken from the workflows themselves rather than invented:
 *
 *   vantriqai.com    the website assistant posts this literal.
 *   923411120049     the WhatsApp workflow posts
 *                    metadata.display_phone_number — the number the message
 *                    arrived ON, not the prospect's. Confirmed from a real
 *                    delivery payload. Override with VANTRIQ_WHATSAPP_NUMBER
 *                    if the business number ever changes.
 */
const WHATSAPP_NUMBER = process.env.VANTRIQ_WHATSAPP_NUMBER || '923411120049';

const DEFAULT_AGENTS = [
  { name: 'Website assistant', kind: 'website', external_ref: 'vantriqai.com', notes: 'Live chat on vantriqai.com — the n8n website assistant workflow.' },
  { name: 'WhatsApp agent', kind: 'whatsapp', external_ref: WHATSAPP_NUMBER, notes: `Inbound WhatsApp Business enquiries on ${WHATSAPP_NUMBER}, text and voice.` },
];

async function ensureInternalClient(opts = {}) {
  const created = [];

  // One internal account, found by its flag rather than by name, so renaming
  // the company later cannot orphan it and cause a second one to be made.
  let { rows } = await db.query(`select * from clients where is_internal = true order by created_at limit 1`);
  let client = rows[0];

  const settings = (await db.query(`select company_name, city from settings where id = 1`)).rows[0] || {};
  const companyName = opts.company || settings.company_name || 'Vantriq AI';

  const { rows: pkg } = await db.query(
    `select * from products where name = $1 order by sort_order desc limit 1`,
    [opts.package_name || 'Enterprise+']
  );
  const product = pkg[0];

  if (!client) {
    // external_ref is unique across all clients, so a fixed internal token
    // keeps a second bootstrap from ever making a duplicate.
    const { rows: ins } = await db.query(
      `insert into clients
         (name, company, email, phone, external_ref, product_id, stage, est_value,
          source, notes, join_date, is_internal, ntn, billing_address, tax_rate, ait_rate, ait_exempt)
       values ($1,$2,$3,$4,$5,$6,'active',0,'Internal',$7, current_date, true, $8, $9, 0, 0, true)
       on conflict (external_ref) do nothing
       returning *`,
      [
        opts.contact_name || settings.founder || 'Internal',
        companyName,
        opts.email || 'ops@vantriqai.com',
        opts.phone || '',
        'vantriqai-internal',
        product ? product.id : null,
        "VantriqAI's own agents, metered and priced like a customer. Billing on this account is an internal cost, never revenue.",
        opts.ntn || '',
        opts.billing_address || settings.city || '',
      ]
    );
    client = ins[0];
    if (!client) {
      client = (await db.query(`select * from clients where external_ref = 'vantriqai-internal'`)).rows[0];
    } else {
      created.push('client');
    }
  } else if (product && !client.product_id) {
    client = (await db.query(
      `update clients set product_id = $2 where id = $1 returning *`, [client.id, product.id]
    )).rows[0];
  }

  // Enterprise+ is the customisable tier, so the internal account's terms can
  // be set to what its own workload actually is rather than to a list price.
  if (product && product.is_standard === false && opts.custom) {
    const fields = ['custom_retainer', 'custom_quota', 'custom_overage_rate', 'custom_setup_fee'];
    const sets = [];
    const params = [client.id];
    for (const f of fields) {
      if (opts.custom[f] === undefined) continue;
      params.push(opts.custom[f]);
      sets.push(`${f} = $${params.length}`);
    }
    if (sets.length) {
      client = (await db.query(`update clients set ${sets.join(', ')} where id = $1 returning *`, params)).rows[0];
    }
  }

  const wanted = Array.isArray(opts.agents) && opts.agents.length ? opts.agents : DEFAULT_AGENTS;
  const agents = [];
  for (const a of wanted) {
    const { rows: existing } = await db.query(
      `select * from client_agents where external_ref = $1`, [a.external_ref]
    );
    if (existing[0]) { agents.push(existing[0]); continue; }
    const { rows: made } = await db.query(
      `insert into client_agents (client_id, name, kind, external_ref, notes)
       values ($1,$2,$3,$4,$5) returning *`,
      [client.id, a.name, a.kind, a.external_ref, a.notes || '']
    );
    agents.push(made[0]);
    created.push(`agent:${a.name}`);
  }

  return { client, agents, product: product || null, created };
}

module.exports = { ensureInternalClient, DEFAULT_AGENTS };
