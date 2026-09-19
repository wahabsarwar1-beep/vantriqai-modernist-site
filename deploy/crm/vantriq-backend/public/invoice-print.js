/**
 * The printable tax invoice, shared by the CRM (public/index.html) and the
 * customer portal (public/portal.html) so both print the identical document.
 *
 * It renders whatever the API's /tax-invoice endpoint returns — the numbers,
 * both parties' registration details and the tax split as they stood when the
 * invoice was issued, not as the client record reads today.
 */
(function () {
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function taxInvoiceHTML(d) {
    const cur = d.currency || 'PKR';
    // Two decimal places is right for a rupee invoice and wrong for the
    // internal one: it is priced per million tokens, so a real month's cost
    // is a fraction of a cent and printing it to the cent prints zero against
    // a bill that is genuinely owed.
    const places = cur === 'USD' ? 6 : 2;
    const money = (n) => {
      const v = Number(n || 0);
      const max = (cur === 'USD' && v !== 0 && Math.abs(v) < 1) ? places : 2;
      return `${cur} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: max })}`;
    };
    // Quantities have the same problem from the other end: 2,700 tokens
    // priced per million is a quantity of 0.0027, and "0 x 0.15" is not a
    // line anybody can check.
    const qty = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });
    // "Nothing left to pay" is half a minor unit of whatever this invoice is in.
    const EPS = cur === 'USD' ? 0.0000009 : 0.009;
    const line = (v) => (v ? `<div>${esc(v)}</div>` : '');
    const labelled = (k, v) => (v ? `<div>${esc(k)} ${esc(v)}</div>` : '');
    const t = d.totals || {};

    // 'Sep 16, 2026' reads unambiguously wherever the invoice is opened, which
    // a numeric date does not.
    // Takes a Date as readily as an ISO string. This renderer is handed a
    // document that came over HTTP, so in practice it only ever sees strings
    // — but slicing ten characters off a Date gives 'Fri Sep 18', which
    // parses to Invalid Date and prints the whole
    // 'GMT+0000 (Coordinated Universal Time)' onto the invoice. That happened
    // in the two server-side copies of this function; it is not worth leaving
    // the third one able to do it.
    const day = (value) => {
      if (!value) return '';
      const dt = (value instanceof Date)
        ? value
        : new Date(String(value).slice(0, 10) + 'T00:00:00Z');
      if (isNaN(dt)) return String(value);
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    };

    const outstanding = d.amount_due !== undefined && d.amount_due !== null
      ? Number(d.amount_due)
      : Number(t.net_payable !== undefined ? t.net_payable : t.total_payable || 0);
    const settled = outstanding <= EPS;

    // The headline. Either what is still owed and when, or that it is settled.
    const headline = settled
      ? `${money(t.net_payable !== undefined ? t.net_payable : t.total_payable || 0)} paid`
      : `${money(outstanding)} due ${day(d.due_date) || 'on receipt'}`;

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.invoice_number || 'Invoice')}</title>
<style>
  :root{ --ink:#1A1A18; --muted:#6B6B66; --rule:#E3E0D8; }
  *{box-sizing:border-box;}
  body{
    font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    color:var(--ink);margin:0;padding:48px 52px;font-size:12.5px;line-height:1.5;
    max-width:840px;-webkit-font-smoothing:antialiased;
  }
  .brandbar{display:flex;align-items:center;gap:11px;margin-bottom:4px;}
  .brandbar svg{display:block;flex:0 0 auto;}
  .brand{font-size:17px;font-weight:700;letter-spacing:-.2px;}
  .brand em{font-style:normal;color:#2f56d9;}
  .muted{color:var(--muted);}
  .doc-title{font-size:22px;font-weight:700;letter-spacing:-.3px;margin:0 0 18px;}
  .meta{display:flex;flex-direction:column;gap:3px;margin-bottom:26px;}
  .meta .r{display:flex;max-width:360px;}
  .meta .k{color:var(--muted);width:130px;flex:0 0 130px;}
  .meta .v{font-weight:600;}
  .headline{font-size:20px;font-weight:700;letter-spacing:-.3px;margin:26px 0 22px;}
  .parties{display:flex;gap:48px;margin-bottom:30px;}
  .parties > div{flex:1;min-width:0;}
  .label{font-size:11px;font-weight:700;margin-bottom:5px;}
  table{width:100%;border-collapse:collapse;}
  th{
    text-align:left;font-size:11px;font-weight:600;color:var(--muted);
    border-bottom:1px solid var(--ink);padding:0 0 7px;
  }
  td{padding:11px 0;border-bottom:1px solid var(--rule);vertical-align:top;}
  th.num,td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:16px;}
  .desc{font-weight:600;}
  .detail{color:var(--muted);font-size:11.5px;margin-top:2px;}
  .totals{margin-left:auto;width:360px;margin-top:2px;}
  .totals .r{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid var(--rule);}
  .totals .r > :last-child{white-space:nowrap;font-variant-numeric:tabular-nums;}
  .totals .r.plain{border-bottom:none;}
  .totals .r.rule{border-bottom:1px solid var(--ink);}
  .totals .r strong{font-weight:700;}
  .totals .due{font-size:15px;font-weight:700;padding-top:10px;border-bottom:none;}
  .note{margin-top:26px;font-size:11.5px;color:var(--muted);border-left:2px solid var(--rule);padding-left:12px;}
  .foot{margin-top:34px;font-size:11px;color:var(--muted);border-top:1px solid var(--rule);padding-top:12px;}
  @media print{ body{padding:0;} .noprint{display:none;} }
  @media (max-width:640px){ body{padding:24px 18px;} .parties{flex-direction:column;gap:22px;} .totals{width:100%;} }
</style></head><body>

<div class="brandbar">
  <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M10 10 H90 V90 H10 Z M28 28 V72 H72 V28 Z" fill="#16151a" fill-rule="evenodd"/>
    <rect x="10" y="28" width="28" height="10" fill="#2f56d9"/>
    <rect x="28" y="10" width="10" height="28" fill="#2f56d9"/>
  </svg>
  <div class="brand">${esc(d.seller.name)}</div>
</div>
<div class="muted" style="margin-bottom:26px;">${esc(d.seller.address || '')}</div>

<h1 class="doc-title">${esc(d.document_title || 'Invoice')}</h1>

<div class="meta">
  <div class="r"><div class="k">Invoice number</div><div class="v">${esc(d.invoice_number || '—')}</div></div>
  <div class="r"><div class="k">Date of issue</div><div class="v">${esc(day(d.issued_date))}</div></div>
  ${d.due_date ? `<div class="r"><div class="k">Date due</div><div class="v">${esc(day(d.due_date))}</div></div>` : ''}
</div>

<div class="headline">${esc(headline)}</div>

<div class="parties">
  <div>
    <div class="label">${esc(d.seller.name)}</div>
    ${line(d.seller.address)}
    ${labelled('NTN', d.seller.ntn)}
    ${labelled('STRN', d.seller.strn)}
    ${line(d.seller.email)}
  </div>
  <div>
    <div class="label">Bill to</div>
    ${line(d.buyer.company)}
    ${line(d.buyer.contact_name)}
    <div style="white-space:pre-line;">${esc(d.buyer.address || '')}</div>
    ${labelled('NTN', d.buyer.ntn)}
    ${labelled('STRN', d.buyer.strn)}
    ${line(d.buyer.email)}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th class="num">Qty</th>
      <th class="num">Unit price</th>
      <th class="num">Amount</th>
    </tr>
  </thead>
  <tbody>${(d.lines || []).map((l) => `<tr>
    <td>
      <div class="desc">${esc(l.description)}</div>
      ${l.detail ? `<div class="detail">${esc(l.detail)}</div>` : ''}
    </td>
    <td class="num">${qty(l.qty !== undefined ? l.qty : 1)}</td>
    <td class="num">${money(l.unit_price !== undefined ? l.unit_price : l.amount_excluding_tax)}</td>
    <td class="num">${money(l.amount !== undefined ? l.amount : l.amount_excluding_tax)}</td>
  </tr>`).join('')}</tbody>
</table>

<div class="totals">
  <div class="r"><span>Subtotal</span><span>${money(t.subtotal !== undefined ? t.subtotal : t.amount_excluding_tax)}</span></div>
  <div class="r"><span>Sales tax (GST)${t.tax_rate ? ` &mdash; ${esc(t.tax_rate)}%` : ''}</span><span>${money(t.tax_amount)}</span></div>
  <div class="r rule"><strong>Total</strong><strong>${money(t.total !== undefined ? t.total : (Number(t.amount_excluding_tax || 0) + Number(t.tax_amount || 0)))}</strong></div>
  ${Number(t.ait_amount || 0) > 0 ? `
  <div class="r"><span>Less advance income tax${t.ait_rate ? ` @ ${esc(t.ait_rate)}%` : ''} <span class="muted">withheld</span></span><span>&minus;${money(t.ait_amount)}</span></div>` : ''}
  <div class="r rule"><strong>Net payable</strong><strong>${money(t.net_payable !== undefined ? t.net_payable : t.total_payable)}</strong></div>
  ${d.settlement && Number(d.settlement.received || 0) > 0
    ? `<div class="r"><span>Received</span><span>&minus;${money(d.settlement.received)}</span></div>` : ''}
  <div class="r due"><span>Amount due</span><span>${money(outstanding)}</span></div>
</div>

${d.ait_note ? `<div class="note">${esc(d.ait_note)}</div>` : ''}
${d.notes ? `<div class="note">${esc(d.notes)}</div>` : ''}
<div class="foot">This is a computer-generated ${esc(String(d.document_title || 'invoice').toLowerCase())} and is valid without a signature.</div>
<div class="noprint" style="margin-top:22px;">
  <button onclick="window.print()" style="padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;border-radius:999px;border:none;background:#2f56d9;color:#fff;">Print</button>
</div>
</body></html>`;
  }

  /**
   * Opens a new window and fills it with the document. The window is opened
   * first, synchronously, because a pop-up opened after an await is blocked.
   */
  async function openTaxInvoice(fetchDocument) {
    const win = window.open('', '_blank');
    if (!win) return { ok: false, error: 'Allow pop-ups to print the invoice.' };
    win.document.write('<p style="font-family:system-ui;padding:24px;">Preparing invoice…</p>');
    try {
      const d = await fetchDocument();
      win.document.open();
      win.document.write(taxInvoiceHTML(d));
      win.document.close();
      return { ok: true };
    } catch (err) {
      win.document.body.innerHTML =
        `<p style="font-family:system-ui;padding:24px;color:#8F3527;">${esc(err.message || 'Could not load the invoice')}</p>`;
      return { ok: false, error: err.message || 'Could not load the invoice' };
    }
  }

  window.taxInvoiceHTML = taxInvoiceHTML;
  window.openTaxInvoice = openTaxInvoice;
})();
