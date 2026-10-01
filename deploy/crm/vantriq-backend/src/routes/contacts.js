const express = require('express');
const db = require('../db');
const CT = require('../utils/contacts');
const { contactsWorkbook, sendReport } = require('../utils/analyticsReport');

const router = express.Router();

/**
 * Customers of our clients — the CRM's view of the same directory each
 * client sees in its portal (Customers), for one client or all of them.
 *
 *   GET   /api/contacts?client_id=&q=&segment=&city=&sort=&limit=&offset=
 *   GET   /api/contacts/export.xlsx?client_id=     everyone, every detail
 *   GET   /api/contacts/:clientId/:key             one customer
 *   PATCH /api/contacts/:clientId/:key             edit their profile
 *
 * No client_id means every client. Staff and admins alike.
 */

async function clientOf(id) {
  if (!id || id === 'all') return null;
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new CT.ContactError(400, 'client_id is not a valid id.');
  const { rows } = await db.query(`select id, company, is_internal from clients where id = $1`, [id]);
  if (!rows[0]) throw new CT.ContactError(404, 'Client not found');
  return rows[0];
}
const actor = (req) => (req.user ? req.user.email : req.authKind === 'breakglass' ? 'Emergency access' : 'API key');

/** The directory: search, segments (new, returning, regulars, at risk, unhappy…), city filter, sort. */
router.get('/', async (req, res) => {
  const q = req.query;
  const client = await clientOf(q.client_id);
  res.json(await CT.listContacts(client ? client.id : null, {
    q: q.q, segment: q.segment, city: q.city, sort: q.sort, limit: q.limit, offset: q.offset,
  }));
});

/** Every customer ever, as a workbook: directory, segments, every conversation, every transcript line. */
router.get('/export.xlsx', async (req, res) => {
  sendReport(res, await contactsWorkbook(await clientOf(req.query.client_id)));
});

/** One customer: profile, stats, every conversation with its transcript, survey answers. */
router.get('/:clientId/:key', async (req, res) => {
  const client = await clientOf(req.params.clientId);
  if (!client) throw new CT.ContactError(404, 'Client not found');
  res.json(await CT.contactDetail(client.id, req.params.key));
});

/** Edit what is known about them. A person's edit always wins over what an agent or survey filled in. */
router.patch('/:clientId/:key', async (req, res) => {
  const client = await clientOf(req.params.clientId);
  if (!client) throw new CT.ContactError(404, 'Client not found');
  await CT.contactDetail(client.id, req.params.key);
  await CT.editProfile(client.id, req.params.key, req.body || {}, actor(req));
  res.json(await CT.contactDetail(client.id, req.params.key));
});

module.exports = router;
