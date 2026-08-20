type LogoProps = {
  height?: number;
  className?: string;
};

export default function Logo({ height = 46, className }: LogoProps) {
  return (
    <img
      src="/ventriqai-lockup.svg"
      alt="VantriqAI"
      className={className}
      style={{ height: className ? undefined : height, width: "auto", flex: "none", display: "block" }}
    />
  );
}
