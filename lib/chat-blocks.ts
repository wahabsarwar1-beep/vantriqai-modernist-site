/**
 * The website assistant's rich-reply protocol.
 *
 * The n8n agent answers in Markdown and may add interactive blocks as fenced
 * JSON, language tag `vq`:
 *
 *   ```vq
 *   {"type":"compare","columns":["Starter","Growth"],"rows":[...]}
 *   ```
 *
 * Everything in a block is model output, so it is treated as untrusted: each
 * block is validated field by field, capped in size, and anything malformed
 * is dropped rather than shown. Links are never taken from the model — cards
 * name a module, package or industry and the widget resolves the page itself
 * (see chat-links.ts), so a block cannot send a visitor off-site.
 */

export type CompareBlock = {
  type: "compare";
  title?: string;
  columns: string[];
  rows: { label: string; values: (string | boolean)[] }[];
  highlight?: number;
  note?: string;
};
/** Filled in by the widget from the site's own package data (chat-package-compare.ts). */
export type PackageCompareBlock = { type: "package_compare"; packages?: string[]; title?: string };
export type CardsBlock = { type: "cards"; title?: string; items: { name: string; text: string; tag?: string }[] };
export type SuggestionsBlock = { type: "suggestions"; items: string[] };
export type LeadFormBlock = { type: "lead_form"; title?: string };
export type BookingBlock = { type: "booking"; title?: string };
export type ActionsBlock = {
  type: "actions";
  items: ({ label: string; message: string } | { label: string; link: "whatsapp" | "contact" | "pricing" | "products" | "industries" })[];
};

export type ChatBlock = CompareBlock | PackageCompareBlock | CardsBlock | SuggestionsBlock | LeadFormBlock | BookingBlock | ActionsBlock;

export type ParsedReply = { text: string; blocks: ChatBlock[] };

const FENCE = /```vq[ \t]*\r?\n([\s\S]*?)```/g;
/** A fence the model opened and never closed — hide it rather than print raw JSON. */
const OPEN_FENCE = /```vq[\s\S]*$/;

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
};

const LINKS = ["whatsapp", "contact", "pricing", "products", "industries"] as const;

function validate(raw: unknown): ChatBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  switch (b.type) {
    case "compare": {
      if (!Array.isArray(b.columns) || !Array.isArray(b.rows)) return null;
      const columns = b.columns.map((c) => str(c, 40)).filter((c): c is string => !!c).slice(0, 4);
      if (columns.length < 2) return null;
      const rows = b.rows
        .slice(0, 12)
        .map((r) => {
          const row = r as Record<string, unknown>;
          const label = str(row?.label, 60);
          if (!label || !Array.isArray(row.values)) return null;
          const values = columns.map((_, i) => {
            const v = (row.values as unknown[])[i];
            return typeof v === "boolean" ? v : str(v, 80) ?? "";
          });
          return { label, values };
        })
        .filter((r): r is CompareBlock["rows"][number] => !!r);
      if (!rows.length) return null;
      const highlight = typeof b.highlight === "number" && b.highlight >= 0 && b.highlight < columns.length ? Math.floor(b.highlight) : undefined;
      return { type: "compare", title: str(b.title, 80), columns, rows, highlight, note: str(b.note, 200) };
    }
    case "package_compare": {
      const packages = Array.isArray(b.packages) ? b.packages.map((p) => str(p, 20)).filter((p): p is string => !!p).slice(0, 4) : [];
      return { type: "package_compare", ...(packages.length ? { packages } : {}), ...(str(b.title, 80) ? { title: str(b.title, 80) } : {}) };
    }
    case "cards": {
      if (!Array.isArray(b.items)) return null;
      const items = b.items
        .slice(0, 6)
        .map((i) => {
          const item = i as Record<string, unknown>;
          const name = str(item?.name, 50);
          const text = str(item?.text, 180);
          if (!name || !text) return null;
          const tag = str(item.tag, 24);
          return tag ? { name, text, tag } : { name, text };
        })
        .filter((i): i is CardsBlock["items"][number] => !!i);
      return items.length ? { type: "cards", title: str(b.title, 80), items } : null;
    }
    case "suggestions": {
      if (!Array.isArray(b.items)) return null;
      const items = b.items.map((i) => str(i, 60)).filter((i): i is string => !!i).slice(0, 4);
      return items.length ? { type: "suggestions", items } : null;
    }
    case "lead_form":
      return { type: "lead_form", title: str(b.title, 80) };
    case "booking":
      return { type: "booking", title: str(b.title, 80) };
    case "actions": {
      if (!Array.isArray(b.items)) return null;
      const items = b.items
        .slice(0, 3)
        .map((i) => {
          const item = i as Record<string, unknown>;
          const label = str(item?.label, 40);
          if (!label) return null;
          if (typeof item.link === "string" && (LINKS as readonly string[]).includes(item.link)) {
            return { label, link: item.link as (typeof LINKS)[number] };
          }
          const message = str(item.message, 200);
          return message ? { label, message } : null;
        })
        .filter((i): i is ActionsBlock["items"][number] => !!i);
      return items.length ? { type: "actions", items } : null;
    }
    default:
      return null;
  }
}

export function parseReply(reply: string): ParsedReply {
  const blocks: ChatBlock[] = [];
  let text = String(reply ?? "").replace(FENCE, (_, body: string) => {
    try {
      const parsed: unknown = JSON.parse(body.trim());
      for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
        const block = validate(raw);
        if (block) blocks.push(block);
      }
    } catch {
      /* Malformed JSON from the model: drop the block, keep the words. */
    }
    return "";
  });
  text = text.replace(OPEN_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();

  // One form, one picker and one row of suggestions per reply is plenty;
  // the model sometimes repeats itself.
  const seen = new Set<string>();
  const unique = blocks.filter((b) => {
    if (b.type === "compare" || b.type === "package_compare" || b.type === "cards") return true;
    if (seen.has(b.type)) return false;
    seen.add(b.type);
    return true;
  });
  return { text, blocks: unique };
}

/** The next working days' discovery-call slots, in Pakistan time (UTC+05:00). */
export const PKT_OFFSET_MIN = 5 * 60;
export const SLOT_HOURS = [11, 12, 13, 14, 15, 16, 17];

export type BookingDay = { key: string; weekday: string; label: string; slots: { hour: number; startIso: string; endIso: string; label: string }[] };

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "am" : "pm"}`;

/**
 * Monday–Saturday, starting today in Pakistan, skipping slots less than
 * two hours away. Computed on the client so the agent never has to do date
 * arithmetic, which is exactly where small models slip.
 */
export function bookingDays(now: Date = new Date(), count = 6): BookingDay[] {
  const pktNow = new Date(now.getTime() + PKT_OFFSET_MIN * 60_000);
  const days: BookingDay[] = [];
  for (let offset = 0; days.length < count && offset < 14; offset++) {
    const d = new Date(Date.UTC(pktNow.getUTCFullYear(), pktNow.getUTCMonth(), pktNow.getUTCDate() + offset));
    if (d.getUTCDay() === 0) continue;
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const slots = SLOT_HOURS.flatMap((hour) => {
      const startUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour) - PKT_OFFSET_MIN * 60_000;
      if (startUtc - now.getTime() < 2 * 3600_000) return [];
      return [{ hour, startIso: `${date}T${pad(hour)}:00:00+05:00`, endIso: `${date}T${pad(hour)}:15:00+05:00`, label: hourLabel(hour) }];
    });
    if (!slots.length) continue;
    days.push({
      key: date,
      weekday: WEEKDAYS[d.getUTCDay()],
      label: `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`,
      slots,
    });
  }
  return days;
}

/** The sentence a slot tap sends — exact enough for Book_CRM_Meeting without guessing. */
export function bookingMessage(day: BookingDay, slot: BookingDay["slots"][number]): string {
  const [y, m, d] = day.key.split("-").map(Number);
  return `Please book my 15-minute discovery call on ${day.weekday} ${d} ${MONTHS[m - 1]} ${y} at ${slot.label} Pakistan time (${slot.startIso} to ${slot.endIso}). I confirm this slot.`;
}

export type LeadDetails = { name: string; business: string; whatsapp: string; email: string };

export function leadMessage(d: LeadDetails): string {
  return [
    "Here are my details:",
    `Name: ${d.name.trim()}`,
    d.business.trim() && `Business: ${d.business.trim()}`,
    d.whatsapp.trim() && `WhatsApp: ${d.whatsapp.trim()}`,
    d.email.trim() && `Email: ${d.email.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Name plus at least one way to reach them — the same rule Save_Lead_To_CRM uses. */
export function leadProblem(d: LeadDetails): string | null {
  if (d.name.trim().length < 2) return "Please add your name.";
  const digits = d.whatsapp.replace(/[^0-9]/g, "");
  const email = d.email.trim();
  if (!digits && !email) return "Add a WhatsApp number or an email so the team can reach you.";
  if (d.whatsapp.trim() && (digits.length < 10 || digits.length > 15)) return "That WhatsApp number looks too short or too long.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "That email address doesn't look right.";
  return null;
}
