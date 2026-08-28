"use client";

import { useEffect } from "react";
import "@n8n/chat/style.css";
import "@/styles/chat-widget-theme.css";

/** The Shop AI assistant — @n8n/chat mounted in window mode, themed to the
 *  Modernist system via styles/chat-widget-theme.css. Backend is the client's
 *  own n8n workflow; this component only handles the embed. */
export default function ShopAIChat() {
  useEffect(() => {
    let mounted = true;

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
    });

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
