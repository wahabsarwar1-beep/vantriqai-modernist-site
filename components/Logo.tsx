type LogoProps = {
  height?: number;
};

export default function Logo({ height = 46 }: LogoProps) {
  return (
    <img
      src="/ventriqai-lockup.svg"
      alt="VantriqAI"
      style={{ height, width: "auto", flex: "none", display: "block" }}
    />
  );
}
