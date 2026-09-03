type LogoProps = {
  height?: number;
  className?: string;
  /** The ink lockup, for the few places that sit on an accent or tinted ground.
   *  Everywhere else uses the cobalt lockup the handoff nominates for the nav. */
  variant?: "cobalt" | "ink";
};

export default function Logo({ height = 46, className, variant = "cobalt" }: LogoProps) {
  return (
    <img
      src={variant === "ink" ? "/ventriqai-lockup.svg" : "/ventriqai-lockup-cobalt.svg"}
      alt="VantriqAI"
      className={className}
      style={{ height: className ? undefined : height, width: "auto", flex: "none", display: "block" }}
    />
  );
}
