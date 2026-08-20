export type MotionLevel = "Restrained" | "Noticeable" | "Busy";

/** Single dial for the whole motion layer — scales reveal travel, headline
 *  duration, packet count/speed, counter duration, and parallax amplitude.
 *  Approved setting is "Busy" (multiplier 1). */
export const MOTION_LEVEL: MotionLevel = "Busy";

const MULTIPLIERS: Record<MotionLevel, number> = {
  Restrained: 0.45,
  Noticeable: 0.75,
  Busy: 1,
};

export const MOTION_MULT = MULTIPLIERS[MOTION_LEVEL];

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
