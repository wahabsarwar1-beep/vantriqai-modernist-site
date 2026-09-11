const express = require('express');
const db = require('../db');
const { hashPassword, generatePassword } = require('../utils/password');
const router = express.Router();

const COMPANY_DOMAIN = (process.env.COMPANY_EMAIL_DOMAIN || 'vantriqai.com').toLowerCase();

/** Admin-only management of internal employee logins. */

const PUBLIC_COLS = `id, email, name, role, active, must_change_password, created_at, last_login_at, password_set_by`;

const MIN_PASSWORD = 10;

/**
 * An admin may type the password themselves, or leave it blank and have one
 * generated. A typed password is never echoed back — the admin already has it,
 * and repeating it only puts it somewhere else.
 */
function resolvePassword(body) {
  const typed = String((body || {}).password || '');
  if (!typed) return { password: generatePassword(16), typed: false, error: null };
  if (typed.length < MIN_PASSWORD) {
    return { password: null, typed: true, error: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  }
  return { password: typed, typed: true, error: null };
}

router.get('/', async (req, res) => {
  const { rows } = await db.query(`select ${PUBLIC_COLS} from internal_users order by active desc, name asc`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const name = String((req.body || {}).name || '').trim();
  const role = String((req.body || {}).role || 'staff');

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!email.endsWith('@' + COMPANY_DOMAIN)) {
    return res.status(400).json({ error: `Internal logins must use an @${COMPANY_DOMAIN} address.` });
  }
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Role must be admin or staff.' });

  const chosen = resolvePassword(req.body);
  if (chosen.error) return res.status(400).json({ error: chosen.error });
  try {
    const { rows } = await db.query(
      // A password the admin chose and handed over deliberately is theirs to
      // keep; only a generated one forces a change at first sign-in.
      `insert into internal_users (email, name, password_hash, role, password_set_by, must_change_password)
       values ($1,$2,$3,$4,'admin',$5) returning ${PUBLIC_COLS}`,
      [email, name, hashPassword(chosen.password), role, !chosen.typed]
    );
    res.status(201).json({
      user: rows[0],
      password: chosen.typed ? null : chosen.password,
      was_typed: chosen.typed,
      notice: chosen.typed
        ? 'Saved. Give it to the employee over a channel you trust — it is hashed here and cannot be read back. They will still need the code emailed to them at sign-in.'
        : 'Give this password to the employee over a channel you trust. It is hashed immediately and cannot be shown again. They will be asked to change it, and will still need the code emailed to them at sign-in.',
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Someone already has that email address.' });
    if (err.code === '23514') return res.status(400).json({ error: `Internal logins must use an @${COMPANY_DOMAIN} address.` });
    throw err;
  }
});

// Set an employee's password: type one in `password`, or leave it out for a
// generated one. Either way every session they had open is closed.
router.post('/:id/reset-password', async (req, res) => {
  const chosen = resolvePassword(req.body);
  if (chosen.error) return res.status(400).json({ error: chosen.error });
  const { rows } = await db.query(
    `update internal_users set password_hash = $2, must_change_password = $3, password_set_by = 'admin'
      where id = $1 returning ${PUBLIC_COLS}`,
    // A password the admin chose and handed over deliberately does not force a
    // change at next sign-in; a generated one does.
    [req.params.id, hashPassword(chosen.password), !chosen.typed]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  await db.query(`delete from staff_sessions where user_id = $1`, [req.params.id]);
  res.json({
    user: rows[0],
    password: chosen.typed ? null : chosen.password,
    was_typed: chosen.typed,
    notice: chosen.typed
      ? 'Saved. Any session they had open is now closed.'
      : 'Shown once. Any session they had open is now closed.',
  });
});

// Deactivating ends their sessions immediately. The last active admin cannot
// be deactivated or demoted — that would lock everyone out of team management.
async function activeAdminCount(excludeId) {
  const { rows } = await db.query(
    `select count(*)::int as n from internal_users where role = 'admin' and active = true and id <> $1`,
    [excludeId]
  );
  return rows[0].n;
}

router.post('/:id/deactivate', async (req, res) => {
  const { rows: found } = await db.query(`select * from internal_users where id = $1`, [req.params.id]);
  if (!found[0]) return res.status(404).json({ error: 'User not found' });
  if (req.user && req.user.id === req.params.id) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  if (found[0].role === 'admin' && (await activeAdminCount(req.params.id)) === 0) {
    return res.status(409).json({ error: 'This is the last active admin. Promote someone else first.' });
  }
  const { rows } = await db.query(`update internal_users set active = false where id = $1 returning ${PUBLIC_COLS}`, [req.params.id]);
  await db.query(`delete from staff_sessions where user_id = $1`, [req.params.id]);
  res.json(rows[0]);
});

router.post('/:id/activate', async (req, res) => {
  const { rows } = await db.query(`update internal_users set active = true where id = $1 returning ${PUBLIC_COLS}`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.post('/:id/role', async (req, res) => {
  const role = String((req.body || {}).role || '');
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Role must be admin or staff.' });
  const { rows: found } = await db.query(`select * from internal_users where id = $1`, [req.params.id]);
  if (!found[0]) return res.status(404).json({ error: 'User not found' });
  if (found[0].role === 'admin' && role !== 'admin' && (await activeAdminCount(req.params.id)) === 0) {
    return res.status(409).json({ error: 'This is the last active admin. Promote someone else first.' });
  }
  const { rows } = await db.query(`update internal_users set role = $2 where id = $1 returning ${PUBLIC_COLS}`, [req.params.id, role]);
  res.json(rows[0]);
});

module.exports = router;
