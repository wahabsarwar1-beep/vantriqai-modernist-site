import Image from "next/image";

type LogoProps = {
  height?: number;
};

/* The lockup's viewBox is 0 0 420 100, so the ratio is exactly 4.2 — but
   46 * 4.2 is 193.2, and a fractional intrinsic width is what next/image was
   warning about. Rounding gives it a whole number to reserve space with;
   height + width:auto still does the actual sizing. */
const RATIO = 4.2;

export default function Logo({ height = 46 }: LogoProps) {
  return (
    <Image
      src="/ventriqai-lockup-cobalt.svg"
      alt="VantriqAI"
      width={Math.round(height * RATIO)}
      height={height}
      priority
      style={{ height, width: "auto", flex: "none", display: "block" }}
    />
  );
}
