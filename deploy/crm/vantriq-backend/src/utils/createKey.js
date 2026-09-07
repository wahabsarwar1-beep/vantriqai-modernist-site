require('dotenv').config();
const crypto = require('crypto');
const db = require('../db');
const { hashKey } = require('../middleware/auth');

async function run() {
  const name = process.argv[2];
  const scope = process.argv[3];

  if (!name || !['admin', 'webhook'].includes(scope)) {
    console.log('Usage: npm run create-key -- "<name>" <admin|webhook>');
    console.log('Example: npm run create-key -- "Frontend admin key" admin');
    console.log('Example: npm run create-key -- "n8n usage webhook" webhook');
    process.exit(1);
  }

  const plaintext = 'vq_' + crypto.randomBytes(24).toString('hex');
  const hash = hashKey(plaintext);

  await db.query(
    `insert into api_keys (name, key_hash, scope) values ($1, $2, $3)`,
    [name, hash, scope]
  );

  console.log('\nAPI key created. Copy this now — it will not be shown again:\n');
  console.log('  ' + plaintext + '\n');
  console.log(`Scope: ${scope}`);
  console.log(scope === 'admin'
    ? 'Use this in the CRM frontend (Settings -> API key).'
    : 'Use this in n8n\'s HTTP Request node as the x-api-key header, for the usage webhook only.');

  await db.pool.end();
}

run().catch((err) => {
  console.error('Failed to create key:', err);
  process.exit(1);
});
