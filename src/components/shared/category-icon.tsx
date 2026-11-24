import {
  BadgePercent,
  Boxes,
  Building2,
  Cpu,
  Factory,
  GitMerge,
  Handshake,
  Megaphone,
  Plug,
  Share2,
  Sparkles,
  Store,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Truck,
  Store,
  Share2,
  BadgePercent,
  Cpu,
  Plug,
  Megaphone,
  Handshake,
  Factory,
  Boxes,
  GitMerge,
  Tag,
  Building2,
  Sparkles,
};

export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Sparkles;
  return <Icon className={className} />;
}
