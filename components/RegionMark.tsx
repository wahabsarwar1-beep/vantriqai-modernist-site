/**
 * The two region marks: the flag of Pakistan, and a globe.
 *
 * Drawn rather than set as emoji on purpose — flag emoji do not render on
 * Windows at all (it substitutes the letters "PK"), so an emoji flag would be
 * broken for a large share of desktop visitors.
 *
 * Both are sized by the `size` prop and carry no accessible text: the link
 * around them names the region, so the mark is decorative.
 */

const GREEN = "#01411C";

export function PakistanFlag({ size = 18 }: { size?: number }) {
  // 3:2, as the flag is. The white hoist band is a quarter of the width.
  const w = size;
  const h = Math.round((size / 3) * 2);
  return (
    <svg width={w} height={h} viewBox="0 0 24 16" aria-hidden="true" focusable="false" style={{ display: "block", borderRadius: 2, flex: "none" }}>
      <rect x="0" y="0" width="24" height="16" fill="#fff" />
      <rect x="6" y="0" width="18" height="16" fill={GREEN} />
      {/* Crescent: a white disc with a green one biting out of its upper
          right, which is how the shape is actually constructed. */}
      <circle cx="14.6" cy="8.4" r="4.1" fill="#fff" />
      <circle cx="16.4" cy="6.9" r="4.1" fill={GREEN} />
      {/* Five-pointed star, sitting in the crescent's opening. */}
      <path
        fill="#fff"
        d="M18.5 3.6l.62 1.3 1.42.2-1.03 1 .25 1.42-1.26-.67-1.27.67.25-1.42-1.03-1 1.42-.2z"
      />
    </svg>
  );
}

export function GlobeMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block", flex: "none" }}>
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <ellipse cx="12" cy="12" rx="4.1" ry="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.9 9.1h18.2M2.9 14.9h18.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
