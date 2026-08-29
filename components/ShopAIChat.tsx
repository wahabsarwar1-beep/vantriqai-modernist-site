"use client";

import { useEffect } from "react";
import "@n8n/chat/style.css";
import "@/styles/chat-widget-theme.css";

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

  const sendButton = root?.querySelector<HTMLButtonElement>('[class*="chat-input"] button');
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

/** The Shop AI assistant — @n8n/chat mounted in window mode, themed to the
 *  Modernist system via styles/chat-widget-theme.css. Backend is the client's
 *  own n8n workflow; this component only handles the embed. */
export default function ShopAIChat() {
  useEffect(() => {
    let mounted = true;
    let observer: MutationObserver | null = null;

    import("@n8n/chat").then(({ createChat }) => {
      if (!mounted) return;
      createChat({
        webhookUrl: process.env.NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL!,
        mode: "window",
        showWelcomeScreen: false,
        initialMessages: ["Hi! I'm Shop AI 👋 — ask me about products or add something to your cart."],
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
    });

    return () => {
      mounted = false;
      observer?.disconnect();
    };
  }, []);

  return null;
}
