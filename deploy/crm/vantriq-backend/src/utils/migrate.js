require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db');

async function run() {
  const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  const seedPath = path.join(__dirname, '..', '..', 'db', 'seed.sql');

  console.log('Applying schema.sql ...');
  await db.query(fs.readFileSync(schemaPath, 'utf8'));
  console.log('Schema applied.');
  await db.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'security-hardening.sql'), 'utf8'));
  console.log('Security migration applied.');

  console.log('Applying customer workspace migration ...');
  await db.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'portal-workspace.sql'), 'utf8'));
  console.log('Customer workspace migration applied.');

  const seedFlag = process.argv.includes('--seed');
  if (seedFlag) {
    console.log('Applying seed.sql ...');
    await db.query(fs.readFileSync(seedPath, 'utf8'));
    console.log('Seed data applied.');
  } else {
    console.log('Skipping seed data (run "npm run migrate -- --seed" to include it).');
  }

  // v9.20: every package's delivery cost and routing line come from the
  // costing model (costingEngine.js) at today's prices, not from a figure
  // typed in once. Re-costed on every migrate so an upgrade that ships new
  // model prices reaches Financials the moment it deploys.
  const { syncDeliveryCosts } = require('./costing');
  const { changed } = await syncDeliveryCosts();
  // This line lands in the public deploy log: which model and rate price the
  // packages is the CEO's (v9.21), so it says only that the costing ran.
  console.log(`Packages re-costed from the stored rate card: ${changed} updated.`);

  // v9.20.4: website chat lines filed under a chat id no business owns go to
  // the agent that had the conversation, so its Customers page shows them.
  const { placeOrphanTranscripts } = require('./contacts');
  const placed = await placeOrphanTranscripts();
  if (placed.found) {
    console.log(`Website transcripts placed: ${placed.metered} with the agent that metered the chat, `
      + `${placed.assistant} with the website assistant, ${placed.left} left unplaced.`);
  }

  await db.pool.end();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
