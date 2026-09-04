import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiTone = "neutral" | "warning" | "critical";

const TONE_ICON_CLASSES: Record<KpiTone, string> = {
  neutral: "text-muted-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-destructive",
};

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  secondaryText?: string;
  tone?: KpiTone;
}

/** Rótulo · número forte · contexto secundário discreto — mesma
 * hierarquia para os 6 KPIs, sem cores decorativas: `tone` só se
 * afasta de neutro quando a própria condição do KPI justifica
 * (obras atrasadas > 0, a pagar vencido > 0). Padding reduzido em
 * relação à primeira versão executiva — a densidade da tela toda
 * depende destes 6 cards não sobrarem espaço vazio. */
export function KpiCard({ icon: Icon, label, value, secondaryText, tone = "neutral" }: KpiCardProps) {
  return (
    <Card size="sm" className="gap-1 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className={cn("size-3.5 shrink-0", TONE_ICON_CLASSES[tone])} aria-hidden="true" />
        <span className="text-xs leading-snug font-medium">{label}</span>
      </div>
      <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {secondaryText ? (
        <p className="truncate text-xs text-muted-foreground">{secondaryText}</p>
      ) : null}
    </Card>
  );
}
