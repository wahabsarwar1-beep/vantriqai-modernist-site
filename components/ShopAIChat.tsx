"use client";

import { useEffect } from "react";
import "@/styles/n8n-chat.css";
import "@/styles/chat-widget-theme.css";

/** The widget's own prebuilt browser bundle, vendored into public/ rather than
 *  installed from npm.
 *
 *  Installing @n8n/chat drags in n8n's *server* workflow engine as npm
 *  metadata — n8n-workflow -> @n8n/expression-runtime -> isolated-vm, plus
 *  ssh2 — both native C++ addons. isolated-vm requires Node >=24 and ships
 *  prebuilds only for abi137/abi147, so on a Node 22 host it falls back to
 *  compiling with node-gyp, which needs Python and a toolchain shared hosting
 *  does not have. That is what broke the deploy.
 *
 *  None of it is reachable from the browser: this bundle contains zero
 *  references to isolated-vm, ssh2, n8n-workflow or expression-runtime. So we
 *  ship the bundle the widget actually runs and skip the dependency tree.
 *
 *  Loaded as a classic script so no bundler ever tries to resolve it. It is
 *  UMD and self-contained (Vue included), exposing window.N8nChat. */
const CHAT_BUNDLE = "/vendor/n8n-chat/chat.bundle.umd.js";

type CreateChat = (options: Record<string, unknown>) => void;

declare global {
  interface Window {
    N8nChat?: { createChat: CreateChat };
    __n8nChatLoader?: Promise<{ createChat: CreateChat }>;
  }
}

/** Injects the bundle once per page, however many times this mounts. */
function loadChatBundle(): Promise<{ createChat: CreateChat }> {
  if (window.N8nChat) return Promise.resolve(window.N8nChat);
  if (window.__n8nChatLoader) return window.__n8nChatLoader;

  window.__n8nChatLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHAT_BUNDLE;
    script.async = true;
    script.onload = () =>
      window.N8nChat
        ? resolve(window.N8nChat)
        : reject(new Error("chat bundle loaded but did not expose window.N8nChat"));
    script.onerror = () => {
      // Let a later mount retry rather than caching the failure forever.
      delete window.__n8nChatLoader;
      reject(new Error(`could not load ${CHAT_BUNDLE}`));
    };
    document.head.appendChild(script);
  });
  return window.__n8nChatLoader;
}

const QUICK_REPLIES = ["Book a demo", "What does it cost?", "Which module?"];

/** @n8n/chat exposes no message-sending API, so a chip fills the real
 *  textarea (via the native value setter, so Vue's own reactivity picks it
 *  up) and submits it the same way a keyboard Enter would. */
function sendQuickReply(text: string) {
  const root = document.getElementById("n8n-chat");
  const textarea = root?.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;

  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));

  // The chips are <button>s sitting right beside the input row, so a plain
  // '[class*="chat-input"] button' lookup matched the FIRST CHIP instead of
  // n8n's send control — every chip then re-fired chip #1 and the input
  // always ended up reading "Book a demo". Scope to the input row and
  // exclude our own chips explicitly.
  const inputRow = textarea.closest<HTMLElement>('[class*="chat-input"]');
  const sendButton =
    inputRow?.querySelector<HTMLButtonElement>("button:not(.chat-quick-reply-chip)") ??
    root?.querySelector<HTMLButtonElement>('[class*="chat-input"] button:not(.chat-quick-reply-chip)');

  if (sendButton) {
    sendButton.click();
  } else {
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }
}

/** Waits for the widget's real input to exist (it's hidden behind a "New
 *  Conversation" gate until the session starts), then inserts a row of
 *  quick-reply chips directly above it. Runs once per appearance of the
 *  input — the observer keeps watching in case the input row remounts. */
function injectQuickReplies() {
  const root = document.getElementById("n8n-chat");
  if (!root || root.querySelector(".chat-quick-replies")) return;

  const textarea = root.querySelector("textarea");
  if (!textarea) return;

  const inputRow = textarea.closest<HTMLElement>('[class*="chat-input"]') ?? textarea.parentElement;
  if (!inputRow?.parentElement) return;

  const row = document.createElement("div");
  row.className = "chat-quick-replies";
  QUICK_REPLIES.forEach((label) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-quick-reply-chip";
    chip.textContent = label;
    chip.addEventListener("click", () => sendQuickReply(label));
    row.appendChild(chip);
  });
  inputRow.parentElement.insertBefore(row, inputRow);
}

/** Builds "Vantriq" + accent "AI" as a document fragment, matching the
 *  wordmark used everywhere else on the site (nav, footer, hero). */
function brandFragment(prefix: string, suffix: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  frag.append(document.createTextNode(prefix));
  const ai = document.createElement("span");
  ai.className = "chat-brand-ai";
  ai.textContent = "AI";
  frag.append(ai);
  if (suffix) frag.append(document.createTextNode(suffix));
  return frag;
}

/** The header's "VantriqAI Assistant" title is real markup n8n renders from
 *  plain text — rewrite it once so "AI" reads in accent, same as the mark
 *  everywhere else on the site. */
function brandifyHeader() {
  const h1 = document.querySelector<HTMLElement>("#n8n-chat .chat-heading h1");
  if (!h1 || h1.dataset.branded) return;
  const match = h1.textContent?.match(/^Vantriq\s*AI\s*(.*)$/i);
  if (!match) return;
  h1.textContent = "";
  h1.append(brandFragment("Vantriq", match[1] ? ` ${match[1]}` : ""));
  h1.dataset.branded = "true";
}

/** Inserts the real "Ask VantriqAI" label as the toggle's first child —
 *  CSS ::before content can't hold styled sub-text, so this can't be a
 *  pure-CSS pseudo-element the way the icon square is. */
function injectLauncherLabel() {
  const toggle = document.querySelector<HTMLElement>(".chat-window-toggle");
  if (!toggle || toggle.querySelector(".chat-toggle-label")) return;
  const label = document.createElement("span");
  label.className = "chat-toggle-label";
  label.append(brandFragment("Ask Vantriq", ""));
  toggle.insertBefore(label, toggle.firstChild);
}

/** @n8n/chat toggles its panel via an inline `display:none`, which can't be
 *  transitioned — it just snaps. CSS forces the panel to stay `display:block`
 *  always and hides it with opacity/transform/visibility instead (see
 *  chat-widget-theme.css); this keeps a `.chat-window-open` class on the
 *  panel in sync with n8n's own inline style so that CSS can tell the two
 *  states apart. */
function syncChatWindowOpenClass() {
  const win = document.querySelector<HTMLElement>("#n8n-chat .chat-window");
  if (!win) return;
  const isOpen = win.style.display !== "none";
  if (!isOpen) {
    win.classList.remove("chat-window-open");
    return;
  }
  if (win.classList.contains("chat-window-open") || win.dataset.opening) return;
  // Opening: n8n clears its inline display:none in the same tick this runs,
  // so adding the class immediately would collapse "become visible" and
  // "become open" into a single frame with nothing painted in between —
  // the transition would have no "from" state to animate from. A double rAF
  // guarantees the closed state (opacity 0) actually paints first.
  win.dataset.opening = "1";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      win.classList.add("chat-window-open");
      delete win.dataset.opening;
    });
  });
}

/** The VantriqAI assistant — @n8n/chat mounted in window mode, themed to the
 *  Modernist system via styles/chat-widget-theme.css. Backend is VantriqAI's
 *  own n8n workflow (persona/knowledge live there, not in this component);
 *  this component only handles the embed. */
export default function ShopAIChat() {
  useEffect(() => {
    let mounted = true;
    let observer: MutationObserver | null = null;

    /*  NEXT_PUBLIC_* is inlined at BUILD time, so a value set in the host's
     *  env panel does nothing until the site is rebuilt — restarting is not
     *  enough. When it is missing the widget does not fail loudly: @n8n/chat
     *  treats an empty webhookUrl as a same-origin relative path, POSTs to
     *  this very site, gets the page's own HTML back, and renders that markup
     *  to the visitor as the assistant's reply. Refuse to mount instead —
     *  no assistant is bad, an assistant answering in raw HTML is worse. */
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL;
    if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
      console.error(
        "[chat] NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL is missing or not an absolute " +
          "URL, so the assistant was not mounted. Set it in the host's " +
          "environment variables and REBUILD — a restart will not pick it up.",
      );
      return;
    }

    loadChatBundle().then(({ createChat }) => {
      if (!mounted) return;
      createChat({
        webhookUrl,
        mode: "window",
        showWelcomeScreen: false,
        initialMessages: [
          "Hi! I'm the VantriqAI assistant 👋 — ask me about our AI agents, packages, or how it works, or I can book you a quick discovery call.",
        ],
        i18n: {
          en: {
            title: "VantriqAI Assistant",
            subtitle: "We're here to help.",
            inputPlaceholder: "Type your message...",
            getStarted: "New Conversation",
            footer: "",
            closeButtonTooltip: "Close chat",
          },
        },
      });

      const runInjections = () => {
        brandifyHeader();
        injectLauncherLabel();
        injectQuickReplies();
        syncChatWindowOpenClass();
      };
      runInjections();
      observer = new MutationObserver(runInjections);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    }).catch((err) => {
      // The site must not break because the assistant could not load — the
      // WhatsApp route is on every page and is the primary contact channel.
      console.error("[chat] widget unavailable:", err);
    });

    return () => {
      mounted = false;
      observer?.disconnect();
    };
  }, []);

  return null;
}
