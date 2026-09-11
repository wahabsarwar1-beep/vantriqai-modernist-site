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
    const money = (n) => `${d.currency} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const row = (k, v) => (v ? `<div><span style="color:#6C7885;">${esc(k)}:</span> ${esc(v)}</div>` : '');

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.invoice_number || 'Invoice')}</title>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#22272E;margin:0;padding:36px;font-size:13px;}
  h1{font-size:19px;margin:0 0 2px;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #22272E;padding-bottom:14px;margin-bottom:18px;}
  .parties{display:flex;gap:36px;margin-bottom:22px;}
  .parties > div{flex:1;}
  .label{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#6C7885;margin-bottom:5px;}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;}
  th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#6C7885;border-bottom:1px solid #D9D3C7;padding:7px 0;}
  td{padding:11px 0;border-bottom:1px solid #EFEAE0;vertical-align:top;}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  .totals{margin-left:auto;width:300px;}
  .totals div{display:flex;justify-content:space-between;padding:5px 0;}
  .totals .grand{border-top:2px solid #22272E;margin-top:6px;padding-top:9px;font-weight:700;font-size:15px;}
  .foot{margin-top:30px;font-size:11px;color:#6C7885;border-top:1px solid #EFEAE0;padding-top:12px;}
  @media print{ body{padding:0;} .noprint{display:none;} }
</style></head><body>
<div class="head">
  <div>
    <h1>${esc(d.seller.name)}</h1>
    <div style="color:#6C7885;font-size:12px;">${esc(d.seller.address)}</div>
    ${row('NTN', d.seller.ntn)}${row('STRN', d.seller.strn)}
  </div>
  <div style="text-align:right;">
    <div style="font-size:16px;font-weight:700;">${esc(d.document_title)}</div>
    <div style="font-family:ui-monospace,Menlo,monospace;margin-top:4px;">${esc(d.invoice_number)}</div>
    <div style="color:#6C7885;margin-top:4px;">Issued ${esc(d.issued_date)}</div>
    ${d.due_date ? `<div style="color:#6C7885;">Due ${esc(d.due_date)}</div>` : ''}
  </div>
</div>
<div class="parties">
  <div>
    <div class="label">Billed to</div>
    <div style="font-weight:600;">${esc(d.buyer.company)}</div>
    <div>${esc(d.buyer.contact_name)}</div>
    <div style="white-space:pre-line;">${esc(d.buyer.address)}</div>
    ${row('NTN', d.buyer.ntn)}${row('STRN', d.buyer.strn)}${row('Email', d.buyer.email)}
  </div>
  <div>
    <div class="label">Status</div>
    <div style="text-transform:capitalize;font-weight:600;">${esc(d.status)}</div>
  </div>
</div>
<table>
  <thead><tr><th>Description</th><th class="num">Excl. tax</th><th class="num">Sales tax</th><th class="num">Amount</th></tr></thead>
  <tbody>${d.lines.map((l) => `<tr>
    <td>${esc(l.description)}</td>
    <td class="num">${money(l.amount_excluding_tax)}</td>
    <td class="num">${l.tax_rate ? `${money(l.tax_amount)} <span style="color:#6C7885;">(${esc(l.tax_rate)}%)</span>` : '—'}</td>
    <td class="num">${money(l.total)}</td>
  </tr>`).join('')}</tbody>
</table>
<div class="totals">
  <div><span>Amount excluding sales tax</span><span>${money(d.totals.amount_excluding_tax)}</span></div>
  <div><span>Sales tax${d.totals.tax_rate ? ` @ ${esc(d.totals.tax_rate)}%` : ''}</span><span>${money(d.totals.tax_amount)}</span></div>
  <div class="grand"><span>Total payable</span><span>${money(d.totals.total_payable)}</span></div>
</div>
${d.notes ? `<div class="foot">${esc(d.notes)}</div>` : ''}
<div class="foot">This is a computer-generated ${esc(String(d.document_title).toLowerCase())} and is valid without a signature.</div>
<div class="noprint" style="margin-top:22px;"><button onclick="window.print()" style="padding:9px 16px;font-size:13px;cursor:pointer;">Print</button></div>
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
