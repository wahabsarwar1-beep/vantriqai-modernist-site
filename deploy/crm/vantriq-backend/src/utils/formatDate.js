/**
 * 'Sep 16, 2026' — the one date format every document and email prints.
 *
 * It exists as a module because it was written three times and got the same
 * thing wrong twice. `String(value).slice(0, 10)` is correct for an ISO
 * string and silently wrong for a Date: it yields 'Fri Sep 18', which parses
 * to Invalid Date, and the fallback then printed the whole
 * 'Fri Sep 18 2026 00:00:00 GMT+0000 (Coordinated Universal Time)' onto an
 * invoice and into an email.
 *
 * Which one you get depends on how the document reached you. Over HTTP it has
 * been through JSON, so dates are ISO strings; called in-process — the PDF
 * renderer and the mailer both are — pg hands back Date objects. Callers
 * should not have to know which.
 *
 * UTC throughout: an invoice issued on the 18th says the 18th wherever it is
 * opened.
 */
function formatDay(value) {
  if (!value) return '';
  const d = (value instanceof Date)
    ? value
    : new Date(String(value).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

module.exports = { formatDay };
