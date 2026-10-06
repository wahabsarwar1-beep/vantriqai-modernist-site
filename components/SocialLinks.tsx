import SocialIcon, { socialKey, socialLabel } from "@/components/SocialIcon";
import { SOCIAL_PROFILES } from "@/lib/social";
import { waLink } from "@/lib/whatsapp";

/**
 * VantriqAI's profiles as a row of round, brand-coloured logos — every
 * profile in lib/social.ts, plus WhatsApp. Used in the footer and on the
 * contact page.
 */
export default function SocialLinks({ size = 44, className = "" }: { size?: number; className?: string }) {
  const links = [...SOCIAL_PROFILES, waLink()];
  return (
    <ul className={`soc-row ${className}`.trim()} style={{ ["--soc-size" as string]: `${size}px` }}>
      {links.map((url) => {
        const key = socialKey(url);
        const label = socialLabel(url);
        return (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener me" aria-label={`VantriqAI on ${label}`} title={label} className={`soc soc-${key ?? "other"}`}>
              {key ? <SocialIcon name={key} size={Math.round(size * 0.5)} /> : <span className="soc-text">{label}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
