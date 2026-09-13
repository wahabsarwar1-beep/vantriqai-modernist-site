import Image from "next/image";

type LogoProps = {
  height?: number;
};

export default function Logo({ height = 46 }: LogoProps) {
  return (
    <Image
      src="/ventriqai-lockup-cobalt.svg"
      alt="VantriqAI"
      width={height * 4.2}
      height={height}
      priority
      style={{ height, width: "auto", flex: "none", display: "block" }}
    />
  );
}
