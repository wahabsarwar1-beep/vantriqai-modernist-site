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
  const { model, changed } = await syncDeliveryCosts();
  console.log(`Packages costed at ${model.as_of} prices (${model.assumptions.bulk_model} bulk, `
    + `USD/PKR ${model.assumptions.fx_usd_pkr}): ${changed} updated.`);

  await db.pool.end();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
