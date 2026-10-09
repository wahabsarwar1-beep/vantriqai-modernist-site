const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const useSSL = String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';

// URL flags must not override the explicit TLS verification policy.
const databaseUrl = new URL(process.env.DATABASE_URL);
for (const option of ['ssl', 'sslmode', 'uselibpqcompat']) databaseUrl.searchParams.delete(option);

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: useSSL ? { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
