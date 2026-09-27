require('dotenv').config();
const { ensureInternalClient } = require('./internalClient');
const { ensureOwnSurvey } = require('./surveys');

/** npm run seed-internal — set up VantriqAI as its own Enterprise+ account. */
(async () => {
  try {
    const { client, agents, product, created } = await ensureInternalClient();
    console.log(`Internal account: ${client.company} (${client.id})`);
    console.log(`Package:          ${product ? product.name : 'none assigned'}`);
    for (const a of agents) console.log(`Agent:            ${a.name} [${a.kind}] ref=${a.external_ref}`);
    // A live survey of our own, made once (see ensureOwnSurvey). Never a
    // reason to fail a deploy: if it cannot be made, the next run tries again.
    try {
      const own = await ensureOwnSurvey(client);
      if (own.created) {
        created.push(`survey:${own.survey.slug}`);
        console.log(`Survey:           ${own.url} — live; pause or delete it in CRM → Surveys`);
      }
    } catch (err) {
      console.log(`Survey:           not made this time (${err.message}) — the next run tries again`);
    }
    console.log(created.length ? `Created: ${created.join(', ')}` : 'Nothing to do — already set up.');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
