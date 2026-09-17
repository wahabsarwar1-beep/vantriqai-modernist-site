require('dotenv').config();
const { ensureInternalClient } = require('./internalClient');

/** npm run seed-internal — set up VantriqAI as its own Enterprise+ account. */
(async () => {
  try {
    const { client, agents, product, created } = await ensureInternalClient();
    console.log(`Internal account: ${client.company} (${client.id})`);
    console.log(`Package:          ${product ? product.name : 'none assigned'}`);
    for (const a of agents) console.log(`Agent:            ${a.name} [${a.kind}] ref=${a.external_ref}`);
    console.log(created.length ? `Created: ${created.join(', ')}` : 'Nothing to do — already set up.');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
