/**
 * Signs a test browser in to the CRM page as an admin (v9.22).
 *
 * The admin API key no longer opens the CRM page on its own — a browser that
 * offers it is signed out — so browser tests sign in the way people do, with
 * a staff session: here one made directly for a throwaway admin account,
 * removed again by endUiSessions() when the run ends. (Emergency access, the
 * key plus the CEO's code, has its own test: breakglass.test.js.)
 */
const { adminSession } = require('./ceo-session');

let made = null;
async function signInAsAdmin(page) {
  if (!made) made = await adminSession();
  const token = made.headers.Authorization.slice(7);
  await page.evaluate((t) => localStorage.setItem('vantriq_staff_session', t), token);
}

async function endUiSessions() {
  if (made) { await made.end(); made = null; }
}

module.exports = { signInAsAdmin, endUiSessions };
