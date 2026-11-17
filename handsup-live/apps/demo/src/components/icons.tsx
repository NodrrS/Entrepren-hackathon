import { Banknote, Calendar, Check, CircleHelp, Clock, Droplet, FileText, Hourglass, Pill, TriangleAlert, Utensils, X, type LucideIcon } from "lucide-react";
import type { IconName } from "@/lib/replies";

// Simple stroke icons for the picture tiles (never emoji).
const ICONS: Record<IconName, LucideIcon> = {
  pill: Pill, clock: Clock, money: Banknote, calendar: Calendar, water: Droplet, food: Utensils,
  document: FileText, wait: Hourglass, yes: Check, no: X, question: CircleHelp, warning: TriangleAlert,
};

export function TileIcon({ name, className }: { name: IconName; className?: string | undefined }) {
  const I = ICONS[name] ?? CircleHelp;
  return <I className={className} strokeWidth={2} aria-hidden="true" />;
}
