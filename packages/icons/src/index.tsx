import type { IconBaseProps } from "react-icons";
import { SiBilibili, SiDiscord, SiInstagram, SiKuaishou, SiQq, SiTiktok, SiWechat, SiXiaohongshu, SiYoutube } from "react-icons/si";

const brands = {
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
export interface BrandIconProps extends IconBaseProps { name: BrandIconName }

/** Decorative by default; the host supplies visible text or an accessible label. */
export function BrandIcon({ name, size = 16, color, ...props }: BrandIconProps) {
  const brand = brands[name];
  const Icon = brand.icon;
  return <Icon size={size} color={color ?? brand.color} aria-hidden={props["aria-label"] ? undefined : true} {...props} />;
}

export { SiBilibili, SiDiscord, SiInstagram, SiKuaishou, SiQq, SiTiktok, SiWechat, SiXiaohongshu, SiYoutube };
