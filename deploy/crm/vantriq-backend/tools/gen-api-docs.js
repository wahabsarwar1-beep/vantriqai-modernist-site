#!/usr/bin/env node
/**
 * Generates the API reference from the routes themselves.
 *
 * WHY GENERATED RATHER THAN WRITTEN. Hand-written API docs are wrong within
 * a month — a route gets added, renamed or re-scoped and the document does
 * not follow. This reads src/index.js for the mounts and their required
 * scopes, then each route module for its methods, paths and the comment
 * above them, and writes:
 *
 *   docs/api/openapi.json   OpenAPI 3.1, importable into Postman/Insomnia
 *   docs/api/README.md      the same thing for a person to read
 *
 * So the docs cannot claim an endpoint that does not exist, or miss one that
 * does, and re-running it after a change is the whole maintenance burden.
 *
 * WHAT IT CANNOT KNOW. Request and response BODIES are not derivable from
 * the route source without executing it, so the spec describes paths,
 * methods, parameters and auth precisely, and bodies loosely. That is the
 * honest boundary: better an accurate map with vague contents than a
 * confident schema that is quietly wrong.
 *
 *   node tools/gen-api-docs.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'api');

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/* ---------- 1. the mounts, and what each one needs ---------- */

const indexSrc = fs.readFileSync(path.join(ROOT, 'src', 'index.js'), 'utf8');

// const xRoutes = require('./routes/y');  — including the destructured auth one.
const varToFile = {};
for (const m of indexSrc.matchAll(/const\s+(?:\{\s*router:\s*)?(\w+)\s*\}?\s*=\s*require\('\.\/routes\/(\w+)'\)/g)) {
  varToFile[m[1]] = m[2];
}

// app.use('/api/x', requireScope('y'), xRoutes);
//
// Matched a line at a time rather than with one expression over the whole
// file: the middleware list contains its own brackets — requireScope('admin')
// — so a non-greedy [^)]+ stops at the wrong one and silently finds a
// fraction of the mounts. The first run of this script reported 45 endpoints
// instead of 183 for exactly that reason.
const mounts = [];
for (const line of indexSrc.split('\n')) {
  const m = /^\s*app\.use\(\s*'(\/api[^']*)'\s*,\s*(.+?)\)\s*;\s*(?:\/\/.*)?$/.exec(line);
  if (!m) continue;
  const [, mountPath, rest] = m;
  const varName = (rest.match(/(\w+)\s*$/) || [])[1];
  const file = varToFile[varName];
  if (!file) continue;                       // express.json() and friends
  const scope = (rest.match(/requireScope\('(\w+)'\)/) || [])[1]
    || (/requireRep/.test(rest) ? 'rep-session' : null);
  mounts.push({ mountPath, file, scope, varName });
}

/* ---------- 2. the routes inside each module ---------- */

/** The comment block immediately above a route, as one line of prose. */
function commentAbove(src, index) {
  const before = src.slice(0, index);
  const lines = before.split('\n');
  const out = [];
  for (let i = lines.length - 2; i >= 0; i -= 1) {
    const l = lines[i].trim();
    if (!l) { if (out.length) break; continue; }
    if (l.startsWith('*/')) continue;
    if (l.startsWith('*') || l.startsWith('/**') || l.startsWith('//')) {
      out.unshift(l.replace(/^\/\*\*|^\*\/|^\*|^\/\//, '').trim());
      continue;
    }
    break;
  }
  return out.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** '/:id/documents/:docId' -> '/{id}/documents/{docId}' plus its params. */
function toOpenApiPath(p) {
  const params = [];
  const converted = p.replace(/:(\w+)/g, (_, name) => { params.push(name); return `{${name}}`; });
  return { converted, params };
}

const endpoints = [];
for (const mount of mounts) {
  const file = path.join(ROOT, 'src', 'routes', `${mount.file}.js`);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^router\.(get|post|put|patch|delete)\(\s*'([^']*)'/gm)) {
    const method = m[1];
    const sub = m[2] === '/' ? '' : m[2];
    endpoints.push({
      method,
      path: (mount.mountPath + sub) || '/',
      scope: mount.scope,
      module: mount.file,
      summary: commentAbove(src, m.index),
    });
  }
}

// Sub-routers mounted inside a route module rather than in index.js are
// invisible to the scan above, so they are declared here by hand. Only one
// exists; if a second appears, this list is where it goes.
const NESTED = [
  { file: 'clientDocuments', mountPath: '/api/clients/:id/documents', scope: 'automation' },
];
for (const n of NESTED) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'routes', `${n.file}.js`), 'utf8');
  for (const m of src.matchAll(/^router\.(get|post|put|patch|delete)\(\s*'([^']*)'/gm)) {
    const sub = m[2] === '/' ? '' : m[2];
    endpoints.push({
      method: m[1], path: n.mountPath + sub, scope: n.scope,
      module: n.file, summary: commentAbove(src, m.index),
    });
  }
}

// Endpoints declared directly on the app rather than on a router.
for (const m of indexSrc.matchAll(/^app\.(get|post)\(\s*'(\/api[^']*)'/gm)) {
  endpoints.push({
    method: m[1], path: m[2], scope: null, module: 'index',
    summary: commentAbove(indexSrc, m.index) || 'Liveness and version.',
  });
}

endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

/* ---------- 3. OpenAPI ---------- */

const SCOPE_NOTE = {
  webhook: 'Webhook key. The narrowest scope — usage, lead and conversation ingestion only.',
  automation: 'Automation key or any staff session. Clients, invoices, packages, agents.',
  staff: 'Staff session, or an admin key. Day-to-day CRM work.',
  admin: 'Admin only. Financials, settings, procurement, archive, exports.',
  'rep-session': 'A sales rep\'s own session token. Scoped to that rep.',
  null: 'Open, or authenticated by the route itself (portal and staff sign-in).',
};

const paths = {};
for (const e of endpoints) {
  const { converted, params } = toOpenApiPath(e.path);
  paths[converted] = paths[converted] || {};
  const isBinary = /\.(pdf|xlsx)$/.test(e.path) || /download/.test(e.path);
  paths[converted][e.method] = {
    tags: [e.module],
    summary: e.summary || `${e.method.toUpperCase()} ${e.path}`,
    description: e.scope
      ? `Requires the **${e.scope}** scope or higher. ${SCOPE_NOTE[e.scope] || ''}`.trim()
      : SCOPE_NOTE[null],
    parameters: params.map((name) => ({
      name, in: 'path', required: true, schema: { type: 'string' },
    })),
    ...(['post', 'put', 'patch'].includes(e.method) ? {
      requestBody: {
        required: false,
        content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
      },
    } : {}),
    responses: {
      200: {
        description: 'Success',
        content: isBinary
          ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
          : { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
      },
      401: { description: 'Not signed in, or an invalid or revoked key' },
      403: { description: 'Authenticated, but not to this scope' },
      404: { description: 'Not found' },
    },
    security: e.scope === null ? [] : [{ apiKey: [] }, { staffSession: [] }],
  };
}

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'VantriqAI CRM API',
    version: VERSION,
    description: [
      'The CRM behind VantriqAI: clients, invoices, payments, quotes and proposals,',
      'contracts, statements, and the webhook surface the AI agents write through.',
      '',
      '## Authentication',
      '',
      'Two ways in, and one of them is for people:',
      '',
      '- **Staff session** — `Authorization: Bearer <token>`, issued by `POST /api/auth/verify`',
      '  after a password and an emailed one-time code. A staff member\'s role decides reach.',
      '- **API key** — `x-api-key: <key>`, for machines. Keys are scoped.',
      '',
      '## Scopes',
      '',
      'Least to most: `webhook` < `automation` < `staff` < `admin`. A scope opens everything',
      'below it. The admin key opens everything and is intended as break-glass only — set',
      '`ALLOW_API_KEY_LOGIN=false` once staff accounts exist.',
      '',
      '## Automation writes through this API, never to the database',
      '',
      'n8n and any other integration must use these endpoints rather than connecting to',
      'Postgres. Tenancy, quota and tax rules live here; a direct write bypasses all three.',
    ].join('\n'),
  },
  servers: [{ url: 'https://{host}', variables: { host: { default: 'crm.vantriqai.com' } } }],
  components: {
    securitySchemes: {
      apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      staffSession: { type: 'http', scheme: 'bearer' },
    },
  },
  tags: [...new Set(endpoints.map((e) => e.module))].sort().map((t) => ({ name: t })),
  paths,
};

/* ---------- 4. the readable version ---------- */

const GROUPS = [
  ['Health and sign-in', ['index', 'auth']],
  ['Webhooks — what the AI agents call', ['usage']],
  ['Customer portal', ['portal']],
  ['Sales rep portal', ['repPortal', 'reps']],
  ['Clients and their paperwork', ['clients', 'clientDocuments']],
  ['Packages and agents', ['products', 'agents', 'packageRequests']],
  ['Quotes and proposals', ['quotes']],
  ['Contracts', ['contracts']],
  ['Invoicing and money in', ['invoices', 'payments', 'subscriptions', 'billingOps']],
  ['Reporting', ['dashboard', 'financials', 'accounting', 'quota', 'exportBase']],
  ['Administration', ['settings', 'team', 'expenses', 'procurement', 'archive']],
];

const byModule = {};
for (const e of endpoints) (byModule[e.module] = byModule[e.module] || []).push(e);

const md = [];
md.push('# VantriqAI CRM — API reference');
md.push('');
md.push(`Generated from the source by \`tools/gen-api-docs.js\` · v${VERSION} · ${endpoints.length} endpoints`);
md.push('');
md.push('> Do not edit this file by hand. Change a route and re-run the generator,');
md.push('> or the two will disagree and the document will be the one that is wrong.');
md.push('');
md.push('## Authentication');
md.push('');
md.push('| Method | Header | Who uses it |');
md.push('| --- | --- | --- |');
md.push('| Staff session | `Authorization: Bearer <token>` | People. Issued by `POST /api/auth/verify` after a password **and** an emailed one-time code. |');
md.push('| API key | `x-api-key: <key>` | Machines. Scoped per key. |');
md.push('');
md.push('### Scopes');
md.push('');
md.push('Least to most privileged: **`webhook`** < **`automation`** < **`staff`** < **`admin`**. A scope opens everything below it.');
md.push('');
md.push('| Scope | What it is for |');
md.push('| --- | --- |');
for (const s of ['webhook', 'automation', 'staff', 'admin']) md.push(`| \`${s}\` | ${SCOPE_NOTE[s]} |`);
md.push('');
md.push('The **admin key opens everything** and exists as break-glass for when email delivery fails or the last admin loses their second factor. Set `ALLOW_API_KEY_LOGIN=false` once staff accounts exist.');
md.push('');
md.push('> **Automation writes through this API, never to the database.** Tenancy, quota and the tax rules live in these routes. A direct Postgres write bypasses all three.');
md.push('');

for (const [title, modules] of GROUPS) {
  const rows = modules.flatMap((m) => byModule[m] || []);
  if (!rows.length) continue;
  md.push(`## ${title}`);
  md.push('');
  md.push('| Method | Path | Scope | What it does |');
  md.push('| --- | --- | --- | --- |');
  for (const e of rows.sort((a, b) => a.path.localeCompare(b.path))) {
    const summary = (e.summary || '').replace(/\|/g, '\\|').slice(0, 150) || '—';
    md.push(`| \`${e.method.toUpperCase()}\` | \`${e.path}\` | ${e.scope ? `\`${e.scope}\`` : '—'} | ${summary} |`);
  }
  md.push('');
}

const ungrouped = Object.keys(byModule).filter((m) => !GROUPS.some(([, ms]) => ms.includes(m)));
if (ungrouped.length) {
  md.push('## Everything else');
  md.push('');
  md.push('| Method | Path | Scope | What it does |');
  md.push('| --- | --- | --- | --- |');
  for (const m of ungrouped) {
    for (const e of byModule[m]) {
      md.push(`| \`${e.method.toUpperCase()}\` | \`${e.path}\` | ${e.scope ? `\`${e.scope}\`` : '—'} | ${(e.summary || '—').replace(/\|/g, '\\|').slice(0, 150)} |`);
    }
  }
  md.push('');
}

md.push('## Examples');
md.push('');
md.push('```bash');
md.push('# a machine');
md.push('curl -H "x-api-key: $VANTRIQ_KEY" https://crm.vantriqai.com/api/clients');
md.push('');
md.push('# a person');
md.push('curl -H "Authorization: Bearer $TOKEN" https://crm.vantriqai.com/api/dashboard');
md.push('');
md.push('# what an agent posts after answering a message');
md.push('curl -X POST https://crm.vantriqai.com/api/webhooks/usage \\');
md.push('  -H "x-api-key: $WEBHOOK_KEY" -H "Content-Type: application/json" \\');
md.push('  -d \'{"external_ref":"923411120049","session_id":"…","channel":"whatsapp",');
md.push('       "ai_model":"gpt-4o-mini","input_tokens":900,"output_tokens":90,"messages_count":1}\'');
md.push('');
md.push('# a proposal as a PDF');
md.push('curl -H "x-api-key: $VANTRIQ_KEY" -o proposal.pdf \\');
md.push('  https://crm.vantriqai.com/api/quotes/<id>/proposal.pdf');
md.push('```');
md.push('');
md.push('## Errors');
md.push('');
md.push('Every failure is JSON with an `error` field carrying a sentence meant for a person:');
md.push('');
md.push('```json');
md.push('{ "error": "Your session has expired. Please sign in again." }');
md.push('```');
md.push('');
md.push('| Status | Meaning |');
md.push('| --- | --- |');
md.push('| `400` | The request was understood and is wrong — the message says how. |');
md.push('| `401` | Not signed in, or the key is invalid or revoked. |');
md.push('| `403` | Authenticated, but not to this scope. |');
md.push('| `404` | No such record — or it belongs to another tenant. |');
md.push('| `409` | Refused because of state: an accepted quote, a duplicate upload. |');
md.push('| `413` | Upload too large (documents cap at 10 MB). |');
md.push('');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'openapi.json'), JSON.stringify(spec, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'README.md'), md.join('\n'));

console.log(`${endpoints.length} endpoints across ${Object.keys(byModule).length} modules`);
console.log(`  docs/api/openapi.json  (${Object.keys(paths).length} paths)`);
console.log('  docs/api/README.md');
const unscoped = endpoints.filter((e) => !e.scope && !['portal', 'auth', 'index', 'repPortal'].includes(e.module));
if (unscoped.length) {
  console.log('\nWARNING — endpoints with no scope that are not portal/auth/health:');
  for (const e of unscoped) console.log(`  ${e.method.toUpperCase()} ${e.path}`);
}
