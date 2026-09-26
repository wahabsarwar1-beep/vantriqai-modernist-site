/**
 * The VantriqAI mark — a square frame with its top-left corner notched in
 * the accent colour — drawn inline so it can take any colour and animate.
 * Geometry is the same as public/ventriqai-mark-*.svg.
 */
export default function VantriqMark({
  size = 32,
  frame = "#ffffff",
  notch = "#a9bbf7",
  className,
  title,
}: {
  size?: number;
  frame?: string;
  notch?: string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path className="vm-frame" d="M10 10H90V90H10ZM28 28V72H72V28Z" fill={frame} fillRule="evenodd" />
      <g className="vm-notch" fill={notch}>
        <rect x="10" y="28" width="28" height="10" />
        <rect x="28" y="10" width="10" height="28" />
      </g>
    </svg>
  );
}
