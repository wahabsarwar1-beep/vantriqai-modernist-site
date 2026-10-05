import type { ReactNode } from "react";

/**
 * The small slice of Markdown the assistant writes — paragraphs, headings,
 * bulleted and numbered lists (one level of nesting), **bold**, links and
 * bare URLs — rendered as React elements. No HTML is ever injected, so a
 * reply cannot carry markup or script into the page.
 */

const SAFE_HREF = /^(https?:\/\/|\/(?!\/))/i;
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)<>]+[^\s)<>.,;:!?'"])/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) {
      out.push(<strong key={k}>{m[1]}</strong>);
    } else {
      const label = m[2] ?? m[4];
      const href = m[3] ?? m[4];
      if (SAFE_HREF.test(href)) {
        const external = /^https?:/i.test(href);
        out.push(
          <a key={k} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {label}
          </a>,
        );
      } else {
        out.push(label);
      }
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Item = { text: string; children: string[] };
type Node =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: Item[] };

const BULLET = /^(\s*)(?:[-*•]|(\d+)[.)])\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

function parse(src: string): Node[] {
  const nodes: Node[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) nodes.push({ kind: "p", text: para.join(" ") });
    para = [];
  };

  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = HEADING.exec(line.trim());
    if (h) {
      flush();
      nodes.push({ kind: "h", text: h[1].replace(/\*\*/g, "") });
      continue;
    }
    const b = BULLET.exec(line);
    if (b) {
      flush();
      const nested = b[1].length >= 2;
      const kind = b[2] ? "ol" : "ul";
      const prev = nodes[nodes.length - 1];
      if (nested && prev && (prev.kind === "ul" || prev.kind === "ol") && prev.items.length) {
        prev.items[prev.items.length - 1].children.push(b[3]);
      } else if (prev && prev.kind === kind) {
        prev.items.push({ text: b[3], children: [] });
      } else {
        nodes.push({ kind, items: [{ text: b[3], children: [] }] });
      }
      continue;
    }
    para.push(line.trim());
  }
  flush();
  // A short standalone line introducing a list ("How it would help a
  // clothing store") is a heading the model wrote without the #.
  return nodes.map((node, i): Node => {
    const next = nodes[i + 1];
    if (node.kind === "p" && next && next.kind !== "p" && next.kind !== "h" && node.text.length <= 70 && !/[.?!,]$/.test(node.text)) {
      return { kind: "h", text: node.text.replace(/\*\*/g, "").replace(/:$/, "") };
    }
    return node;
  });
}

export default function ChatMarkdown({ text }: { text: string }) {
  return (
    <>
      {parse(text).map((node, n) => {
        const key = `n${n}`;
        if (node.kind === "h") return <p key={key} className="vq-md-h">{inline(node.text, key)}</p>;
        if (node.kind === "p") return <p key={key}>{inline(node.text, key)}</p>;
        const List = node.kind;
        return (
          <List key={key}>
            {node.items.map((item, i) => (
              <li key={i}>
                {inline(item.text, `${key}-${i}`)}
                {item.children.length > 0 && (
                  <ul>
                    {item.children.map((c, j) => (
                      <li key={j}>{inline(c, `${key}-${i}-${j}`)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}

/** Plain text of a reply, for the typing reveal's word count. */
export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The first `words` words of a reply, keeping its line structure. */
export function revealWords(text: string, words: number): string {
  if (words <= 0) return "";
  let seen = 0;
  let out = "";
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      out += token;
      continue;
    }
    if (seen >= words) break;
    out += token;
    seen++;
  }
  // Close a half-revealed **bold** so the asterisks never flash on screen.
  return (out.match(/\*\*/g)?.length ?? 0) % 2 ? `${out}**` : out;
}
