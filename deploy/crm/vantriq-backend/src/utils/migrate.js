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

  await db.pool.end();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
