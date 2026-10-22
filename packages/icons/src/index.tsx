import type { IconBaseProps } from "react-icons";
import { SiGithub, SiX, SiZhihu, SiBilibili, SiDiscord, SiInstagram, SiKuaishou, SiQq, SiTiktok, SiWechat, SiXiaohongshu, SiYoutube } from "react-icons/si";

/** Monochrome video-channel mark drawn from the owner-provided reference. */
export function VideoChannelIcon({ size = 24, color = "currentColor", title, ...props }: IconBaseProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" color={color} aria-hidden={props["aria-label"] || title ? undefined : true} {...props}>
    {title && <title>{title}</title>}
    <path d="M5 2.75h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="3.25" y="5.5" width="17.5" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9.5 10v7l6-3.5z" fill="currentColor" stroke="currentColor" strokeWidth=".65" strokeLinejoin="round" />
  </svg>;
}

const brands = {
  "wechat-channels": { icon: VideoChannelIcon, color: "currentColor" },
  github: { icon: SiGithub, color: "#181717" },
  x: { icon: SiX, color: "#000000" },
  zhihu: { icon: SiZhihu, color: "#0084FF" },
  youtube: { icon: SiYoutube, color: "#FF0000" },
  tiktok: { icon: SiTiktok, color: "#25F4EE" },
  instagram: { icon: SiInstagram, color: "#FF0069" },
  bilibili: { icon: SiBilibili, color: "#00A1D6" },
  douyin: { icon: SiTiktok, color: "#FE2C55" },
  xiaohongshu: { icon: SiXiaohongshu, color: "#FF2442" },
  kuaishou: { icon: SiKuaishou, color: "#FF4906" },
  wechat: { icon: SiWechat, color: "#07C160" },
  "wechat-official": { icon: SiWechat, color: "#07C160" },
  qq: { icon: SiQq, color: "#1EBAFC" },
  discord: { icon: SiDiscord, color: "#5865F2" },
} as const;

export type BrandIconName = keyof typeof brands;
export interface BrandIconProps extends IconBaseProps { name: BrandIconName; monochrome?: boolean }

/** Decorative by default; the host supplies visible text or an accessible label. */
export function BrandIcon({ name, size = 16, color, monochrome = false, ...props }: BrandIconProps) {
  const brand = brands[name];
  const Icon = brand.icon;
  return <Icon size={size} color={color ?? (monochrome ? "currentColor" : brand.color)} aria-hidden={props["aria-label"] ? undefined : true} {...props} />;
}

export { SiGithub, SiX, SiZhihu, SiBilibili, SiDiscord, SiInstagram, SiKuaishou, SiQq, SiTiktok, SiWechat, SiXiaohongshu, SiYoutube };
