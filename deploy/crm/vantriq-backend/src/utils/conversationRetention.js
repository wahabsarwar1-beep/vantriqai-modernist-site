const db = require('../db');

/**
 * Deletes conversation messages older than their retention period (v9.33).
 *
 * The Terms (section 10) promise conversation history in the portal for 12
 * months, then deletion of the message text. The period is the company
 * default in settings, or a longer one agreed with a client in writing and
 * set on their record. Messages not yet tied to a client (a prospect) use the
 * default.
 *
 * Billing and Pulse are counted from usage_events and pulse_events, which are
 * kept, so deleting old message text never changes a past invoice or report
 * total. Deletes in batches so a first run on a large table never holds a
 * long lock on the table the agents are writing to.
 */
const BATCH = 5000;
const MAX_BATCHES = 40;

async function purgeConversations() {
  const { rows: s } = await db.query(`select conversation_retention_months as m from settings where id = 1`);
  const months = Number((s[0] && s[0].m) || 12);
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { rowCount } = await db.query(
      `delete from conversation_messages where id in (
         select m.id from conversation_messages m
           left join clients c on c.id = m.client_id
          where m.created_at < now() - make_interval(months => coalesce(c.conversation_retention_months, $1::int))
          limit ${BATCH})`,
      [months]
    );
    deleted += rowCount;
    if (rowCount < BATCH) break;
  }
  if (deleted) console.log(`[conversation retention] deleted ${deleted} messages past their retention period`);
  return { deleted, months };
}

module.exports = { purgeConversations };
