const express = require('express');
const db = require('../db');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * A client's AI agents and automations.
 *
 * One company, many agents: a WhatsApp agent answering their customers, an
 * Instagram agent on their DMs, a Facebook agent on their page, a website
 * assistant, plus back-office automations that never talk to anyone. They all
 * sit under the one client — one package, one quota, one invoice — but usage
 * is attributed per agent, so "which of our agents is actually being used"
 * is a question the CRM can answer.
 *
 * external_ref is the identifier usage arrives under: the WhatsApp business
 * number, the Instagram handle, the site domain, the workflow id. It is
 * unique across all agents, because two agents sharing one ref would make
 * attribution ambiguous.
 */

const KINDS = ['whatsapp', 'instagram', 'facebook', 'website', 'voice', 'email', 'automation', 'other'];
const STATUSES = ['active', 'paused', 'retired'];

router.get('/', async (req, res) => {
  const { client_id, kind, status } = req.query;
  const clauses = [];
  const params = [];
  if (client_id) { params.push(client_id); clauses.push(`a.client_id = $${params.length}`); }
  if (kind) { params.push(kind); clauses.push(`a.kind = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`a.status = $${params.length}`); }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';

  // Month-to-date usage comes back with the agent, because an agent list
  // with no numbers on it is just a list of names.
  const { rows } = await db.query(
    `select a.*, c.company, c.is_internal,
            coalesce(u.sessions, 0)  as sessions_mtd,
            coalesce(u.messages, 0)  as messages_mtd,
            u.last_seen_at
       from client_agents a
       join clients c on c.id = a.client_id
       left join (
         select agent_id,
                count(distinct session_id) as sessions,
                sum(messages_count)        as messages,
                max(occurred_at)           as last_seen_at
           from usage_events
          where agent_id is not null
            and occurred_at >= date_trunc('month', now())
          group by agent_id
       ) u on u.agent_id = a.id
       ${where}
      order by c.company, a.kind, a.name`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { client_id, name, kind, external_ref, status, notes } = req.body || {};
  if (!client_id || !name) return res.status(400).json({ error: 'client_id and name are required' });
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });

  const { rows: client } = await db.query(`select id from clients where id = $1`, [client_id]);
  if (!client[0]) return res.status(404).json({ error: 'Client not found' });

  const ref = external_ref ? String(external_ref).trim() : null;
  if (ref) {
    const { rows: taken } = await db.query(
      `select a.id, a.name, c.company from client_agents a join clients c on c.id = a.client_id
        where a.external_ref = $1`, [ref]
    );
    if (taken[0]) {
      return res.status(409).json({ error: `"${ref}" already identifies ${taken[0].company}'s ${taken[0].name} agent.` });
    }
  }

  const { rows } = await db.query(
    `insert into client_agents (client_id, name, kind, external_ref, status, notes)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [client_id, String(name).trim(), kind || 'whatsapp', ref, status || 'active', notes || '']
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'kind', 'external_ref', 'status', 'notes'];
  const sets = [];
  const params = [req.params.id];
  for (const f of allowed) {
    if (req.body[f] === undefined) continue;
    if (f === 'kind' && !KINDS.includes(req.body[f])) return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });
    if (f === 'status' && !STATUSES.includes(req.body[f])) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    const value = f === 'external_ref'
      ? (req.body[f] ? String(req.body[f]).trim() : null)
      : req.body[f];
    params.push(value);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  if (req.body.external_ref) {
    const { rows: taken } = await db.query(
      `select id from client_agents where external_ref = $1 and id <> $2`,
      [String(req.body.external_ref).trim(), req.params.id]
    );
    if (taken[0]) return res.status(409).json({ error: 'Another agent already uses that reference.' });
  }

  const { rows } = await db.query(
    `update client_agents set ${sets.join(', ')} where id = $1 returning *`, params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
  res.json(rows[0]);
});

/**
 * Retiring an agent is usually what someone means by deleting one: the usage
 * it recorded is a billing fact and has to stay. Pass ?purge=true to really
 * remove it, which leaves its usage events attached to the client with no
 * agent — never orphaned, never deleted.
 */
router.delete('/:id', blockAutomation, async (req, res) => {
  if (String(req.query.purge) === 'true') {
    await db.query(`delete from client_agents where id = $1`, [req.params.id]);
    return res.status(204).end();
  }
  const { rows } = await db.query(
    `update client_agents set status = 'retired' where id = $1 returning *`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
  res.json(rows[0]);
});

/** GET /api/agents/:id/usage — that one agent's month-by-month history. */
router.get('/:id/usage', async (req, res) => {
  const { rows: agent } = await db.query(`select * from client_agents where id = $1`, [req.params.id]);
  if (!agent[0]) return res.status(404).json({ error: 'Agent not found' });
  const { rows } = await db.query(
    `select date_trunc('month', occurred_at)::date as month,
            count(distinct session_id) as sessions,
            sum(messages_count)        as messages,
            sum(input_tokens)          as input_tokens,
            sum(output_tokens)         as output_tokens
       from usage_events
      where agent_id = $1
      group by 1 order by 1`,
    [req.params.id]
  );
  res.json({ agent: agent[0], months: rows });
});

module.exports = router;
