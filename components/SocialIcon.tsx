/**
 * Platform glyphs for the footer's profile row.
 *
 * Each is the platform's own mark, used to link to VantriqAI's page there —
 * which is what the marks are for. Anything without an entry here falls back
 * to a labelled link rather than a wrong icon.
 */
const PATHS: Record<string, string> = {
  facebook:
    "M14 8.5h2.2V5.6c-.38-.05-1.69-.17-3.2-.17-3.2 0-5.36 1.93-5.36 5.48V13H5v3.3h2.64V24h3.2v-7.7h2.63L13.87 13h-3.03v-2.77c0-.96.26-1.73 1.79-1.73z",
  instagram:
    "M14.5 4.5c2.67 0 2.99.01 4.04.06 2.72.12 3.98 1.41 4.1 4.1.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.12 2.69-1.38 3.98-4.1 4.1-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-2.72-.12-3.98-1.41-4.1-4.1-.05-1.05-.06-1.37-.06-4.04s.01-2.99.06-4.04c.12-2.69 1.38-3.98 4.1-4.1 1.05-.05 1.37-.06 4.04-.06zm0 4.05a4.2 4.2 0 100 8.4 4.2 4.2 0 000-8.4zm0 6.93a2.73 2.73 0 110-5.46 2.73 2.73 0 010 5.46zm4.36-7.1a.98.98 0 100 1.96.98.98 0 000-1.96z",
  linkedin:
    "M7.1 9.6h3.1V21H7.1V9.6zm1.55-5.1a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6zM12.3 9.6h2.97v1.56h.04c.41-.78 1.42-1.6 2.93-1.6 3.13 0 3.71 2.06 3.71 4.74V21h-3.1v-5.06c0-1.21-.02-2.76-1.68-2.76-1.69 0-1.95 1.32-1.95 2.68V21h-3.1V9.6z",
  x: "M17.9 4.8h2.8l-6.1 7 7.18 9.4h-5.63l-4.4-5.76-5.04 5.76H3.9l6.53-7.47L3.54 4.8h5.77l3.98 5.26 4.6-5.26zm-.99 14.7h1.55L8.2 6.4H6.53l10.38 13.1z",
  youtube:
    "M23 8.6c-.2-1.6-.9-2.3-2.4-2.5C18.4 5.8 14.5 5.8 14.5 5.8s-3.9 0-6.1.3C6.9 6.3 6.2 7 6 8.6c-.2 1.6-.2 3.9-.2 3.9s0 2.3.2 3.9c.2 1.6.9 2.3 2.4 2.5 2.2.3 6.1.3 6.1.3s3.9 0 6.1-.3c1.5-.2 2.2-.9 2.4-2.5.2-1.6.2-3.9.2-3.9s0-2.3-.2-3.9zM12.6 15.6V9.4l5.1 3.1-5.1 3.1z",
};

export function socialKey(url: string): string | null {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const key = host.split(".")[0] === "twitter" ? "x" : host.split(".")[0];
  return key in PATHS ? key : null;
}

export default function SocialIcon({ name, size = 18 }: { name: string; size?: number }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="currentColor" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d={d} />
    </svg>
  );
}
