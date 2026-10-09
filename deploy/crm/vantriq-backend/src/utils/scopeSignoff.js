const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { effectivePackage } = require('./pkg');
const { getSettings } = require('./billing');
const { formatDay } = require('./formatDate');

/**
 * Scope sign-off (v9.33): the document a client signs before configuration
 * starts, so both sides deliver against the same written scope.
 *
 * The content is structured — lists of lines under fixed headings — so the
 * CRM can prefill it from the package and quote, staff can edit it, the
 * portal can show it, and the PDF can print it, all from one shape. Every
 * list is plain strings: what a client signs should read the same in every
 * place it appears.
 *
 * Sending freezes it: the content, the client's identity and the full terms
 * in force are hashed together, and the client signs that hash.
 */

const TERMS = () => require('../content/terms.json');

/** The headings, in the order every view prints them. */
const LIST_SECTIONS = [
  ['deliverables', 'What we will deliver'],
  ['channels', 'Channels and numbers'],
  ['package_includes', 'Included in your package'],
  ['addons', 'Add-ons'],
  ['integrations', 'Integrations'],
  ['knowledge_sources', 'Knowledge the agent answers from'],
  ['languages', 'Languages'],
  ['handover', 'Handover to your team'],
  ['access_required', 'Account access we need from you'],
  ['client_responsibilities', 'Your responsibilities'],
  ['vantriq_responsibilities', 'Our responsibilities'],
  ['milestones', 'Milestones'],
  ['acceptance_criteria', 'How the work is accepted'],
  ['out_of_scope', 'Not included / out of scope'],
];
const LIST_KEYS = LIST_SECTIONS.map(([k]) => k);
const MAX_ITEMS = 60;
const MAX_LEN = 600;

/** Channel → the access the terms (section 7) say that platform needs. */
const ACCESS_BY_CHANNEL = {
  whatsapp: [
    'WhatsApp: VantriqAI added as a partner in your Meta Business portfolio, with management of your WhatsApp Business Account only',
    'WhatsApp: a phone number in your business\'s name that can receive Meta\'s verification code by SMS or call (you enter the code; we never ask you to send it)',
    'WhatsApp: Meta business verification and display-name review completed in your business\'s name',
    'WhatsApp: a valid payment method on your WhatsApp Business Account for Meta\'s own conversation charges',
  ],
  instagram: [
    'Instagram: a professional account linked to your Facebook Page, with "Allow access to messages" switched on for connected tools',
    'Instagram: VantriqAI given partner or task access to the Instagram account and its Facebook Page in your Meta Business portfolio',
  ],
  facebook: [
    'Facebook Messenger: VantriqAI given partner or task access to your Facebook Page, limited to messaging, in your Meta Business portfolio',
  ],
  website: [
    'Website: our chat script added to your site, by you or by us with a limited user you create for the purpose',
  ],
  voice: [
    'Phone line: a number in your business\'s name, and authority to route its calls to the voice agent',
  ],
};

const DEFAULTS = {
  deliverables: [
    'A discovery session and a written configuration plan for your agent',
    'An AI agent on each channel listed below, configured to your catalogue, prices, FAQs, policies and tone of voice',
    'A knowledge base built from the sources listed below, and kept current during monthly tuning',
    'Handover rules and alerts to your team, as described below',
    'Lead capture with the full conversation into your client portal, and Vantriq Pulse analytics',
    'Testing with your team before go-live, then go-live',
    'Monthly tuning and support from go-live',
  ],
  knowledge_sources: [
    'Your product or service catalogue and prices (provided by you)',
    'Your FAQs, policies, opening hours and delivery or booking rules (provided by you)',
  ],
  languages: ['English', 'Urdu', 'Roman Urdu'],
  handover: [
    'When a customer asks for a person, is upset, or asks something the agent is instructed not to handle, the agent hands the conversation to your team with a summary',
    'Your team is alerted on the channel or address you nominate',
  ],
  access_common: [
    'One nominated decision-maker from your business who can approve scope, content, tests and go-live',
    'Two-factor authentication switched on, and at least two administrators from your own business, on every account the agent uses',
  ],
  client_responsibilities: [
    'Provide accurate, current catalogue, prices, policies and FAQs, and tell us when they change',
    'Provide the account access listed above within 5 working days of signing; the timeline moves with any delay',
    'Review and approve the agent\'s knowledge, any message templates and any outbound message before it is sent',
    'Obtain and record your customers\' consent where the law or a platform requires it, and honour opt-outs',
    'Keep a person available for conversations the agent hands over',
    'Pay invoices by their due date',
  ],
  vantriq_responsibilities: [
    'Configure, test and launch the deliverables above with reasonable skill and care',
    'Use the access you give us only for this deployment, keep keys and tokens encrypted, and never ask for passwords or one-time codes by email or chat',
    'Tell you promptly of any platform restriction, outage or policy change that affects your agent',
    'Tune the agent monthly from what its conversations show',
    'Remove our access and revoke the tokens we hold when the service ends, and confirm it to you in writing',
  ],
  milestones: [
    'Scope signed',
    'Accounts and access provided by you',
    'Configuration complete',
    'Testing with your team and acceptance',
    'Go-live',
  ],
  acceptance_criteria: [
    'The agent answers an agreed set of test questions correctly from your knowledge base, in the languages listed above',
    'Handover to your team works on every channel in scope',
    'Leads appear in your client portal with their conversation',
    'Every integration in scope completes an end-to-end test',
    'You confirm acceptance in writing within 5 working days of testing; putting the agent live also counts as acceptance',
  ],
};

/** Which channels a client runs, from their agents, else their package. */
function channelsOf(agents, pkg) {
  const kinds = new Set();
  const lines = [];
  for (const a of agents || []) {
    if (['automation', 'other', 'email'].includes(a.kind)) continue;
    kinds.add(a.kind);
    const label = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook Messenger', website: 'Website chat', voice: 'Phone line' }[a.kind] || a.kind;
    lines.push(`${label}${a.external_ref ? ` — ${a.external_ref}` : ''}${a.name ? ` (${a.name})` : ''}`);
  }
  if (!lines.length) {
    const text = String((pkg && pkg.channels) || 'WhatsApp');
    for (const [re, kind, label] of [[/whatsapp/i, 'whatsapp', 'WhatsApp'], [/instagram/i, 'instagram', 'Instagram'],
      [/facebook|messenger/i, 'facebook', 'Facebook Messenger'], [/web/i, 'website', 'Website chat'], [/voice|phone/i, 'voice', 'Phone line']]) {
      if (re.test(text)) { kinds.add(kind); lines.push(`${label} — number or account to be confirmed`); }
    }
  }
  return { kinds: [...kinds], lines };
}

/**
 * A draft prefilled from what the CRM knows: the client, their package
 * (or the quote's), the quote's lines, and their agents.
 */
async function buildDraft(clientId, quoteId) {
  const { rows: cr } = await db.query(`select * from clients where id = $1`, [clientId]);
  const client = cr[0];
  if (!client) return null;
  let quote = null, lines = [];
  if (quoteId) {
    const { rows: qr } = await db.query(`select * from quotes where id = $1 and client_id = $2`, [quoteId, clientId]);
    quote = qr[0] || null;
    if (!quote) return { error: 'That quote is not for this client.' };
    lines = (await db.query(`select * from quote_lines where quote_id = $1 order by position`, [quoteId])).rows;
  }
  const productId = (quote && quote.product_id) || client.product_id;
  let pkg = null;
  if (productId) {
    const { rows: pr } = await db.query(`select * from products where id = $1`, [productId]);
    if (pr[0]) pkg = { ...pr[0], ...(effectivePackage(client, pr[0]) || {}) };
  }
  const { rows: agents } = await db.query(
    `select kind, external_ref, name from client_agents where client_id = $1 order by created_at`, [clientId]);
  const ch = channelsOf(agents, pkg);
  const settings = await getSettings();
  const currency = client.currency || settings.currency || 'PKR';
  const addonNames = (await db.query(`select lower(name) as n from catalog_addons where active = true`)).rows.map((r) => r.n);

  const access = [];
  for (const k of ch.kinds) access.push(...(ACCESS_BY_CHANNEL[k] || []));
  access.push(...DEFAULTS.access_common);

  const content = {
    package: pkg ? {
      name: pkg.name,
      quota: Number(pkg.quota || 0),
      overage_rate: Number(pkg.overage_rate || 0),
      setup_fee: Number(pkg.setup_fee || 0),
      retainer: Number(pkg.retainer || 0),
    } : null,
    deliverables: DEFAULTS.deliverables,
    channels: ch.lines,
    package_includes: pkg ? (pkg.includes || []) : [],
    // A quote line is an add-on when it names one from the catalogue, so a
    // setup or retainer line for the package itself is not listed twice.
    addons: lines
      .filter((l) => addonNames.some((n) => String(l.description || '').toLowerCase().includes(n)))
      .map((l) => `${l.description}${l.detail ? ` — ${l.detail}` : ''}`),
    integrations: [],
    knowledge_sources: DEFAULTS.knowledge_sources,
    languages: DEFAULTS.languages,
    handover: DEFAULTS.handover,
    access_required: access,
    client_responsibilities: DEFAULTS.client_responsibilities,
    vantriq_responsibilities: DEFAULTS.vantriq_responsibilities,
    milestones: DEFAULTS.milestones,
    acceptance_criteria: DEFAULTS.acceptance_criteria,
    out_of_scope: pkg ? (pkg.excludes || []) : [],
    commercial: {
      currency,
      quote_number: quote ? quote.quote_number : '',
      lines: lines.map((l) => ({ description: l.description, detail: l.detail || '', qty: Number(l.qty), unit_price: Number(l.unit_price), amount: Number(l.amount) })),
      subtotal: quote ? Number(quote.subtotal) : null,
      tax_amount: quote ? Number(quote.tax_amount) : null,
      total: quote ? Number(quote.total) : null,
      setup_fee: pkg ? Number(pkg.setup_fee || 0) : null,
      monthly_fee: pkg ? Number(pkg.retainer || 0) : null,
      allowance: pkg ? `${Number(pkg.quota || 0).toLocaleString('en-US')} conversations a month` : '',
      overage: pkg ? `${currency} ${Number(pkg.overage_rate || 0)} per conversation beyond the allowance` : '',
      payment_terms: 'The setup fee is invoiced on acceptance and configuration is scheduled once it is paid; the monthly fee and any usage beyond the allowance are invoiced for each billing month (Terms, section 4).',
    },
    notes: '',
  };
  const title = `Scope of work — ${client.company || client.name}${pkg ? ` · ${pkg.name}` : ''}`;
  return { client, quote, content, title };
}

/** Validated, cleaned content from an edit. Unknown keys are dropped. */
function cleanContent(input, previous) {
  const b = input && typeof input === 'object' ? input : {};
  const out = { ...(previous || {}) };
  for (const k of LIST_KEYS) {
    if (b[k] === undefined) continue;
    if (!Array.isArray(b[k])) throw Object.assign(new Error(`"${k}" must be a list of lines.`), { status: 400 });
    const list = b[k].map((s) => String(s == null ? '' : s).trim()).filter(Boolean);
    if (list.length > MAX_ITEMS) throw Object.assign(new Error(`"${k}" can have at most ${MAX_ITEMS} lines.`), { status: 400 });
    if (list.some((s) => s.length > MAX_LEN)) throw Object.assign(new Error(`Each line must be ${MAX_LEN} characters or fewer.`), { status: 400 });
    out[k] = list;
  }
  if (b.notes !== undefined) out.notes = String(b.notes || '').slice(0, 4000);
  // package and commercial come from the CRM's own records, never an edit:
  // what the client signs must match what they will be invoiced.
  return out;
}

/** JSON with keys in a fixed order, so the same content always hashes the same. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

/** The fingerprint a client signs: number, version, title, who, what, and the terms. */
function hashOf(s) {
  return crypto.createHash('sha256').update(canonical({
    number: s.number, version: s.version, title: s.title,
    client: s.client_snapshot, content: s.content,
    terms_version: s.terms_version, terms: s.terms,
  })).digest('hex');
}

/** The client's legal identity on the day it is sent, as invoices and contracts snapshot it. */
function clientSnapshot(c) {
  return {
    company: c.company || '', legal_name: c.company || '', contact_name: c.name || '',
    email: c.email || '', phone: c.phone || '', ntn: c.ntn || '', strn: c.strn || '',
    address: c.billing_address || '',
  };
}

async function allocateNumber() {
  const { rows } = await db.query(`select nextval('scope_signoff_number_seq') as n`);
  const settings = await getSettings();
  const prefix = (settings && settings.invoice_prefix) || 'VAI';
  return `${prefix}-S-${new Date().getFullYear()}-${String(rows[0].n).padStart(4, '0')}`;
}

/* ---------------------------------------------------------------- */
/* PDF                                                               */
/* ---------------------------------------------------------------- */

const INK = '#16151a', COBALT = '#2f56d9', MUTED = '#6b645b', RULE = '#e7e2da', WASH = '#f4f2ec';
const M = 48, LEFT = M, RIGHT = 595.28 - M, WIDTH = RIGHT - LEFT, FLOOR = 841.89 - M - 24;

function renderPdf(s) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `${s.number} v${s.version} — ${s.title}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const c = s.content || {};
    const cl = s.client_snapshot || {};
    const money = (n) => (n === null || n === undefined ? '—' : `${(c.commercial || {}).currency || 'PKR'} ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    let y = M;
    const need = (h) => { if (y + h > FLOOR) { doc.addPage(); y = M; } };
    const text = (t, opts = {}) => {
      const { font = 'Helvetica', size = 9, color = INK, indent = 0, gap = 2 } = opts;
      doc.font(font).fontSize(size);
      const h = doc.heightOfString(String(t), { width: WIDTH - indent, lineGap: 1.5 });
      need(h);
      doc.fillColor(color).text(String(t), LEFT + indent, y, { width: WIDTH - indent, lineGap: 1.5 });
      y += h + gap;
    };
    const heading = (t) => {
      need(40); y += 8;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(t, LEFT, y);
      y += 16;
      doc.moveTo(LEFT, y - 3).lineTo(RIGHT, y - 3).lineWidth(0.6).strokeColor(RULE).stroke();
      y += 3;
    };

    // Header
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COBALT).text('SCOPE SIGN-OFF', LEFT, y, { characterSpacing: 1 });
    y += 14;
    text(s.title, { font: 'Helvetica-Bold', size: 17, gap: 6 });
    text(`${s.number} · version ${s.version}${s.sent_at ? ` · issued ${formatDay(s.sent_at)}` : ''} · Terms version ${s.terms_version || '—'}`, { size: 8.5, color: MUTED, gap: 10 });
    const status = s.status === 'signed' ? `Signed by ${s.signer_name}${s.signer_title ? `, ${s.signer_title}` : ''} on ${formatDay(s.signed_at)}`
      : s.status === 'draft' ? 'DRAFT — not yet issued for signature' : s.status === 'superseded' ? 'Superseded by a later version'
        : s.status === 'withdrawn' ? 'Withdrawn' : 'Awaiting the client\'s signature';
    doc.save().roundedRect(LEFT, y, WIDTH, 22, 4).fillColor(WASH).fill().restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(s.status === 'signed' ? COBALT : INK).text(status, LEFT + 10, y + 7, { width: WIDTH - 20 });
    y += 32;

    heading('Parties');
    text(`Client: ${cl.legal_name || cl.company}${cl.ntn ? ` · NTN ${cl.ntn}` : ''}${cl.address ? ` · ${cl.address}` : ''}`);
    text(`Contact: ${[cl.contact_name, cl.email, cl.phone].filter(Boolean).join(' · ') || '—'}`);
    text('Provider: VantriqAI', { gap: 4 });

    if (c.package) {
      heading('Package');
      text(`${c.package.name}: ${Number(c.package.quota).toLocaleString('en-US')} conversations a month (one conversation is one customer over a rolling 24 hours); beyond that, ${money(c.package.overage_rate)} per conversation.`);
    }
    for (const [k, label] of LIST_SECTIONS) {
      const items = c[k] || [];
      if (!items.length) continue;
      heading(label);
      const numbered = k === 'milestones';
      items.forEach((it, i) => text(`${numbered ? `${i + 1}.` : '•'}  ${it}`, { indent: 4, gap: 2 }));
    }
    const com = c.commercial || {};
    heading('Commercials');
    if (com.quote_number) text(`As quoted in ${com.quote_number}.`, { color: MUTED });
    (com.lines || []).forEach((l) => text(`•  ${l.description}${l.detail ? ` — ${l.detail}` : ''}: ${l.qty > 1 ? `${l.qty} × ` : ''}${money(l.unit_price)}${l.qty > 1 ? ` = ${money(l.amount)}` : ''}`, { indent: 4 }));
    if (com.total !== null && com.total !== undefined) text(`Quotation total: ${money(com.total)}${com.tax_amount ? ` (including tax ${money(com.tax_amount)})` : ''}`, { font: 'Helvetica-Bold' });
    if (com.setup_fee !== null && com.setup_fee !== undefined) text(`Package setup fee: ${money(com.setup_fee)} · monthly fee: ${money(com.monthly_fee)} · ${com.allowance}${com.overage ? ` · ${com.overage}` : ''}`);
    if (com.payment_terms) text(com.payment_terms, { color: MUTED });
    text('All amounts exclude taxes unless stated; platform charges such as Meta\'s WhatsApp conversation fees are paid by the client directly to the platform.', { color: MUTED });
    if (c.notes) { heading('Notes'); text(c.notes); }

    // The terms, in full, as they were when this was issued.
    const terms = s.terms || TERMS();
    doc.addPage(); y = M;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COBALT).text('TERMS & SERVICE INFORMATION', LEFT, y, { characterSpacing: 1 });
    y += 14;
    text(`Version ${terms.version} · updated ${terms.updated} · part of this scope sign-off`, { size: 8.5, color: MUTED, gap: 8 });
    text(terms.intro, { size: 8.5, gap: 6 });
    for (const sec of terms.sections || []) {
      need(30);
      text(sec.heading, { font: 'Helvetica-Bold', size: 9.5, gap: 3 });
      for (const p of sec.paragraphs || []) text(p, { size: 8, color: INK, gap: 3 });
      for (const b of sec.bullets || []) text(`•  ${b}`, { size: 8, indent: 6, gap: 2 });
      for (const p of sec.after || []) text(p, { size: 8, gap: 3 });
      y += 4;
    }

    // Signature
    heading('Signature');
    if (s.status === 'signed') {
      text(`Signed electronically in the VantriqAI client portal by ${s.signer_name}${s.signer_title ? `, ${s.signer_title}` : ''}${s.signer_email ? ` (${s.signer_email})` : ''}, for ${cl.legal_name || cl.company}, on ${new Date(s.signed_at).toISOString().replace('T', ' ').slice(0, 16)} UTC from ${s.signer_ip || 'an unrecorded address'}.`);
      const ack = s.acknowledgements || {};
      text(`Confirmed: the scope above (${ack.scope ? 'yes' : 'no'}); the Terms version ${s.terms_version} (${ack.terms ? 'yes' : 'no'}); authority to sign for the client (${ack.authority ? 'yes' : 'no'}).`);
    } else {
      text('To be signed in the VantriqAI client portal. The signer confirms the scope above, the Terms version shown, and their authority to sign for the client.', { color: MUTED });
    }
    text(`Document fingerprint (SHA-256): ${s.content_hash || 'issued when sent'}`, { size: 7.5, color: MUTED });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      // The footer sits below the content floor; with the bottom margin in
      // place PDFKit would start a new page for it, once per page.
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7).fillColor(MUTED)
        .text(`VantriqAI · ${s.number} v${s.version} · ${cl.company || ''}`, LEFT, 841.89 - M + 6, { width: WIDTH / 2, lineBreak: false });
      doc.text(`${i + 1} of ${range.count}`, LEFT + WIDTH / 2, 841.89 - M + 6, { width: WIDTH / 2, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

const pdfFilename = (s) => `${s.number}-v${s.version}-scope.pdf`.replace(/[^A-Za-z0-9._-]/g, '-');

/** What the portal and the CRM both show: everything but our internal fields. */
function publicShape(s) {
  return {
    id: s.id, number: s.number, version: s.version, title: s.title, status: s.status,
    content: s.content, client_snapshot: s.client_snapshot, terms_version: s.terms_version, terms: s.terms,
    content_hash: s.content_hash, sent_at: s.sent_at, signed_at: s.signed_at,
    signer_name: s.signer_name, signer_title: s.signer_title, signer_email: s.signer_email,
    acknowledgements: s.acknowledgements, client_feedback: s.client_feedback, feedback_at: s.feedback_at,
    quote_id: s.quote_id, supersedes_id: s.supersedes_id,
  };
}

module.exports = {
  LIST_SECTIONS, LIST_KEYS, ACCESS_BY_CHANNEL, DEFAULTS, TERMS,
  buildDraft, cleanContent, canonical, hashOf, clientSnapshot, allocateNumber, renderPdf, pdfFilename, publicShape,
};
