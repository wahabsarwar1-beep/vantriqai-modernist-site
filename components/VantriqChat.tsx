"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ChatBlocks from "@/components/ChatBlocks";
import ChatMarkdown, { revealWords, wordCount } from "@/components/ChatMarkdown";
import { parseReply, type ChatBlock } from "@/lib/chat-blocks";
import { hrefIn, regionFromPathname } from "@/lib/region";
import { trackSiteEvent } from "@/lib/site-analytics";
import { waLink } from "@/lib/whatsapp";
import "@/styles/vantriq-chat.css";

/*  Defaulted, not required. NEXT_PUBLIC_* is inlined at BUILD time, and on
 *  this site's Hostinger git auto-deploy the panel's environment variables
 *  reach the RUNTIME process only, never the compile — so the production
 *  endpoint is the default and the env var is an override for pointing a
 *  preview build at a different workflow. Not a secret: a public webhook,
 *  CORS-restricted server-side to vantriqai.com. */
const DEFAULT_WEBHOOK_URL = "https://n8n.vantriqai.com/webhook/678305e8-7b54-4a7f-9a04-4662389631b2/chat";
const WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;

const STORE_KEY = "vq.chat.v1";
const TEASER_KEY = "vq.chat.teaser";
const REQUEST_TIMEOUT_MS = 90_000;

const OFFLINE_REPLY = `Sorry — I can't reach our assistant right now. Please message the team on WhatsApp at ${waLink()} and they'll pick this up straight away.`;

type Message = { id: string; role: "user" | "bot"; text: string; blocks: ChatBlock[] };

const STARTERS: { title: string; body: string; message: string }[] = [
  { title: "Compare packages", body: "Starter to Enterprise+, side by side", message: "Compare your packages side by side" },
  { title: "Find my modules", body: "What fits a business like mine?", message: "Which modules would fit my business?" },
  { title: "Vantriq vs staff", body: "AI agent vs hiring vs a basic chatbot", message: "Compare a VantriqAI agent with hiring staff and with a basic chatbot" },
  { title: "Book a call", body: "Free 15-minute discovery call", message: "I'd like to book a discovery call" },
];

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function load(): { sessionId: string; messages: Message[] } | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data?.sessionId !== "string" || !Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
}

function save(sessionId: string, messages: Message[]) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ sessionId, messages: messages.slice(-40) }));
  } catch {
    /* Storage can be disabled; the chat still works for this page. */
  }
}

/** The reply text out of an n8n chat-trigger response, or null. */
function outputOf(raw: string): string | null {
  try {
    const data = JSON.parse(raw);
    const item = Array.isArray(data) ? data[0] : data;
    const output = item?.output ?? item?.text;
    return typeof output === "string" && output.trim() ? output : null;
  } catch {
    // Never render an HTML page as a reply (a misrouted URL returns one).
    return raw.trim() && !/^\s*</.test(raw) ? raw : null;
  }
}

async function post(url: string, body: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });
}

/**
 * Same-origin first: /api/chat relays to n8n server-side, so no CORS rule can
 * drop the message. Only when that route does not exist (a static host) does
 * the browser call the webhook directly, as the old widget did.
 */
async function ask(sessionId: string, chatInput: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const body = JSON.stringify({ action: "sendMessage", sessionId, chatInput });
  try {
    let res: Response | null = null;
    try {
      res = await post("/api/chat", body, ctrl.signal);
    } catch (err) {
      if (ctrl.signal.aborted) throw err;
    }
    if (!res || res.status === 404 || res.status === 405) {
      console.warn("[chat] /api/chat unavailable, calling the webhook directly");
      res = await post(WEBHOOK_URL, body, ctrl.signal);
    }
    if (res.status === 429) return "You're sending messages faster than I can answer — give me a minute and try again.";
    const text = await res.text();
    if (!res.ok) {
      console.error(`[chat] assistant request failed: ${res.status} ${text.slice(0, 200)}`);
      return OFFLINE_REPLY;
    }
    return outputOf(text) ?? OFFLINE_REPLY;
  } catch (err) {
    console.error("[chat] assistant request failed:", err);
    return OFFLINE_REPLY;
  } finally {
    window.clearTimeout(timer);
  }
}

function Brand() {
  return (
    <>
      Vantriq<span className="vq-brand-ai">AI</span>
    </>
  );
}

/**
 * The VantriqAI assistant: a chat panel of the site's own, talking to the
 * same n8n workflow the stock @n8n/chat widget used to. Replies are Markdown
 * plus optional interactive blocks (see lib/chat-blocks.ts) — comparison
 * tables, module cards, a lead form, a booking picker and suggested replies.
 */
export default function VantriqChat() {
  const pathname = usePathname() || "/";
  const region = regionFromPathname(pathname);

  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [reveal, setReveal] = useState<{ id: string; words: number } | null>(null);
  const [teaser, setTeaser] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const reduced = useRef(false);

  // Restore this tab's conversation, so moving between pages keeps the thread.
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stored = load();
    /* eslint-disable react-hooks/set-state-in-effect -- browser storage only exists after mount */
    if (stored) {
      setSessionId(stored.sessionId);
      setMessages(stored.messages);
    } else {
      setSessionId(newId());
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (sessionId) save(sessionId, messages);
  }, [sessionId, messages]);

  // One gentle nudge per visit, on wider screens, if they haven't opened it.
  useEffect(() => {
    let shown = false;
    try {
      shown = sessionStorage.getItem(TEASER_KEY) === "1";
    } catch {}
    if (shown || window.matchMedia("(max-width: 760px)").matches) return;
    const t = window.setTimeout(() => {
      setTeaser(true);
      try {
        sessionStorage.setItem(TEASER_KEY, "1");
      } catch {}
    }, 12000);
    return () => window.clearTimeout(t);
  }, []);

  // Word-by-word reveal of the newest reply.
  useEffect(() => {
    if (!reveal) return;
    const msg = messages.find((m) => m.id === reveal.id);
    const total = msg ? wordCount(msg.text) : 0;
    if (reveal.words >= total) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- the animation's own end condition */
      setReveal(null);
      return;
    }
    const step = Math.max(2, Math.ceil(total / 60));
    const t = window.setTimeout(() => setReveal({ id: reveal.id, words: reveal.words + step }), 28);
    return () => window.clearTimeout(t);
  }, [reveal, messages]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced.current ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.role === "bot") {
      // Bring the start of a long answer into view rather than its last line.
      document.getElementById(`vq-msg-${last.id}`)?.scrollIntoView({ block: "start", behavior: reduced.current ? "auto" : "smooth" });
    } else {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (busy) scrollToBottom();
  }, [busy, scrollToBottom]);

  const openPanel = () => {
    setOpen(true);
    setTeaser(false);
    trackSiteEvent("chat_open");
  };

  const closePanel = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 120);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closePanel]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, 2000);
      if (!text || busy || !sessionId) return;
      setInput("");
      setReveal(null);
      setMessages((m) => [...m, { id: newId(), role: "user", text, blocks: [] }]);
      setBusy(true);
      const reply = await ask(sessionId, text);
      const parsed = parseReply(reply);
      const id = newId();
      setMessages((m) => [...m, { id, role: "bot", text: parsed.text, blocks: parsed.blocks }]);
      setBusy(false);
      if (!reduced.current) setReveal({ id, words: 0 });
    },
    [busy, sessionId],
  );

  const restart = () => {
    setMessages([]);
    setReveal(null);
    setSessionId(newId());
    inputRef.current?.focus();
  };

  const lastBot = [...messages].reverse().find((m) => m.role === "bot");
  const revealing = reveal !== null;
  const suggestions =
    !busy && !revealing && lastBot && messages[messages.length - 1] === lastBot
      ? (lastBot.blocks.find((b) => b.type === "suggestions") as Extract<ChatBlock, { type: "suggestions" }> | undefined)?.items ?? []
      : [];

  return (
    <div id="vq-chat" data-open={open || undefined}>
      <section className="vq-panel" role="dialog" aria-modal="false" aria-labelledby="vq-title" aria-hidden={!open} inert={!open}>
        <header className="vq-head">
          <span className="vq-orb" aria-hidden="true" />
          <div className="vq-head-text">
            <h2 id="vq-title">
              <Brand /> Assistant
            </h2>
            <p>
              <span className="vq-live" aria-hidden="true" /> AI assistant · online 24/7
            </p>
          </div>
          {messages.length > 0 && (
            <button type="button" className="vq-icon" onClick={restart} aria-label="Start a new conversation" title="New conversation">
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button type="button" className="vq-icon" onClick={closePanel} aria-label="Close chat" title="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="vq-list" ref={listRef} aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && (
            <div className="vq-welcome">
              <p className="vq-welcome-hi">Hi! I&apos;m the VantriqAI assistant 👋</p>
              <p>
                Ask me anything about our AI agents for WhatsApp, Instagram and your website — I can compare packages, match modules
                to your business, or book you a discovery call. I&apos;m the <strong>Website Agent</strong>, live.
              </p>
              <div className="vq-starters">
                {STARTERS.map((s) => (
                  <button key={s.title} type="button" className="vq-starter" onClick={() => send(s.message)} disabled={!sessionId}>
                    <span className="vq-starter-title">{s.title}</span>
                    <span className="vq-starter-body">{s.body}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} id={`vq-msg-${m.id}`} className="vq-row vq-row-user">
                  <div className="vq-bubble vq-bubble-user">{m.text}</div>
                </div>
              );
            }
            const isRevealing = reveal?.id === m.id;
            const isLatest = m === lastBot && messages[messages.length - 1] === m;
            // Forms, pickers and buttons only stay live on the newest answer —
            // an old booking picker further up the thread would book stale slots.
            const blocks = m.blocks.filter(
              (b) => b.type !== "suggestions" && (isLatest || b.type === "compare" || b.type === "package_compare" || b.type === "cards"),
            );
            return (
              <div key={m.id} id={`vq-msg-${m.id}`} className="vq-row vq-row-bot">
                <span className="vq-avatar" aria-hidden="true" />
                <div className="vq-bot">
                  {m.text && (
                    <div className="vq-bubble vq-bubble-bot vq-md">
                      <ChatMarkdown text={isRevealing ? revealWords(m.text, reveal.words) : m.text} />
                    </div>
                  )}
                  {!isRevealing && blocks.length > 0 && (
                    <div className="vq-blocks">
                      <ChatBlocks blocks={blocks} region={region} send={send} busy={busy} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="vq-row vq-row-bot">
              <span className="vq-avatar" aria-hidden="true" />
              <div className="vq-thinking">
                <span className="vq-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="vq-sr">The assistant is typing</span>
              </div>
            </div>
          )}
        </div>

        <div className="vq-foot">
          {suggestions.length > 0 && (
            <div className="vq-suggestions" aria-label="Suggested replies">
              {suggestions.map((s) => (
                <button key={s} type="button" className="vq-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="vq-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              placeholder={busy ? "The assistant is replying…" : "Ask me anything…"}
              aria-label="Your message"
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <button type="submit" className="vq-send" disabled={busy || !input.trim()} aria-label="Send message">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
          <p className="vq-legal">
            AI can make mistakes — the team confirms details. <a href="/privacy">Privacy</a> ·{" "}
            <a href={waLink()} target="_blank" rel="noopener noreferrer">
              Talk to a person
            </a>{" "}
            · <a href={hrefIn(region, "/contact")}>Contact</a>
          </p>
        </div>
      </section>

      {teaser && !open && (
        <div className="vq-teaser" role="status">
          <button type="button" className="vq-teaser-body" onClick={openPanel}>
            Not sure which package fits? I can compare them side by side →
          </button>
          <button type="button" className="vq-teaser-x" aria-label="Dismiss" onClick={() => setTeaser(false)}>
            ×
          </button>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        className="vq-launcher"
        data-chat-launcher
        data-cursor-label="Chat with us"
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Ask VantriqAI — open chat"}
        onClick={() => (open ? closePanel() : openPanel())}
      >
        <span className="vq-launcher-label">
          {open ? "Close chat" : (
            <>
              Ask Vantriq<span className="vq-brand-ai">AI</span>
            </>
          )}
        </span>
        <span className="vq-launcher-orb" aria-hidden="true" />
      </button>
    </div>
  );
}
