import type { ReactNode } from "react";

/**
 * Platform marks for VantriqAI's profile links, drawn white so they sit on
 * the platform's own colour (see `.soc-*` in globals.css).
 *
 * Anything without an entry here falls back to a labelled link rather than a
 * wrong icon.
 */
const ICONS: Record<string, { viewBox: string; body: ReactNode }> = {
  facebook: {
    viewBox: "0 0 24 24",
    body: <path d="M13.4 21.5v-7.7h2.6l.4-3h-3V8.9c0-.87.25-1.46 1.5-1.46h1.6V4.76a21.6 21.6 0 0 0-2.33-.12c-2.3 0-3.88 1.4-3.88 3.98v2.2H7.7v3h2.6v7.7z" />,
  },
  instagram: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3.9" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.1" cy="6.9" r="1.2" />
      </>
    ),
  },
  whatsapp: {
    viewBox: "0 0 24 24",
    body: (
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.69.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35zm-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41z" />
    ),
  },
  linkedin: {
    viewBox: "0 0 28 28",
    body: <path d="M7.1 9.6h3.1V21H7.1V9.6zm1.55-5.1a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6zM12.3 9.6h2.97v1.56h.04c.41-.78 1.42-1.6 2.93-1.6 3.13 0 3.71 2.06 3.71 4.74V21h-3.1v-5.06c0-1.21-.02-2.76-1.68-2.76-1.69 0-1.95 1.32-1.95 2.68V21h-3.1V9.6z" transform="translate(-0.5 1.25)" />,
  },
  x: {
    viewBox: "0 0 24 24",
    body: <path d="M17.9 4.8h2.8l-6.1 7 7.18 9.4h-5.63l-4.4-5.76-5.04 5.76H3.9l6.53-7.47L3.54 4.8h5.77l3.98 5.26 4.6-5.26zm-.99 14.7h1.55L8.2 6.4H6.53l10.38 13.1z" transform="translate(-0.4 -0.9)" />,
  },
  youtube: {
    viewBox: "0 0 28 28",
    body: <path d="M23 8.6c-.2-1.6-.9-2.3-2.4-2.5C18.4 5.8 14.5 5.8 14.5 5.8s-3.9 0-6.1.3C6.9 6.3 6.2 7 6 8.6c-.2 1.6-.2 3.9-.2 3.9s0 2.3.2 3.9c.2 1.6.9 2.3 2.4 2.5 2.2.3 6.1.3 6.1.3s3.9 0 6.1-.3c1.5-.2 2.2-.9 2.4-2.5.2-1.6.2-3.9.2-3.9s0-2.3-.2-3.9zM12.6 15.6V9.4l5.1 3.1-5.1 3.1z" transform="translate(-0.5 1.5)" />,
  },
};

const LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
};

function hostKey(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "wa.me" || host.endsWith("whatsapp.com")) return "whatsapp";
  const first = host.split(".")[0];
  return first === "twitter" ? "x" : first;
}

export function socialKey(url: string): string | null {
  const key = hostKey(url);
  return key in ICONS ? key : null;
}

export function socialLabel(url: string): string {
  const key = hostKey(url);
  return LABELS[key] ?? new URL(url).hostname.replace(/^www\./, "");
}

export default function SocialIcon({ name, size = 18 }: { name: string; size?: number }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg width={size} height={size} viewBox={icon.viewBox} fill="currentColor" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      {icon.body}
    </svg>
  );
}
