require('dotenv').config();
const { ensureInternalClient } = require('./internalClient');
const { ensureOwnSurveys } = require('./surveys');

/** npm run seed-internal — set up VantriqAI as its own Enterprise+ account. */
(async () => {
  try {
    const { client, agents, product, created } = await ensureInternalClient();
    console.log(`Internal account: ${client.company} (${client.id})`);
    console.log(`Package:          ${product ? product.name : 'none assigned'}`);
    for (const a of agents) console.log(`Agent:            ${a.name} [${a.kind}] ref=${a.external_ref}`);
    // Our own live surveys, each made once (see ensureOwnSurveys). Never a
    // reason to fail a deploy: one that cannot be made is tried again next run.
    for (const own of await ensureOwnSurveys(client)) {
      if (own.created) {
        created.push(`survey:${own.survey.slug}`);
        console.log(`Survey:           ${own.url} — live; pause or delete it in CRM → Surveys`);
      } else if (own.error) {
        console.log(`Survey:           ${own.slug} not made this time (${own.error}) — the next run tries again`);
      }
    }
    console.log(created.length ? `Created: ${created.join(', ')}` : 'Nothing to do — already set up.');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
