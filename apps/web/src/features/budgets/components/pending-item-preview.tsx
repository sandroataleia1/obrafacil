import { BrickWall, Grid3x3, PanelTop, SquareStack } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatDecimal, formatInteger } from "@/lib/decimal";
import type { PendingBudgetItem } from "../prototype/pending-budget-item";

function summaryLines(item: PendingBudgetItem): {
  icon: typeof BrickWall;
  detail: string;
  lines: string[];
} {
  switch (item.source) {
    case "masonry":
      return {
        icon: BrickWall,
        detail: item.materialName,
        lines: [
          `${formatInteger(item.quantity)} ${item.unit}`,
          `${formatDecimal(item.netAreaM2)} m²`,
        ],
      };
    case "floor":
      return {
        icon: Grid3x3,
        detail: `Área: ${formatDecimal(item.areaM2)} m²`,
        lines: [`${formatInteger(item.boxes)} caixas`],
      };
    case "ceiling":
      return {
        icon: PanelTop,
        detail: `Área: ${formatDecimal(item.areaM2)} m²`,
        lines: [`Quantidade de barras: ${formatInteger(item.totalPurchaseBars)}`],
      };
    case "slab":
      return {
        icon: SquareStack,
        detail: `Área: ${formatDecimal(item.areaM2)} m²`,
        lines: [`Concreto estimado: ${formatDecimal(item.concreteVolumeWithWasteM3)} m³`],
      };
  }
}

export function PendingItemPreview({ item }: { item: PendingBudgetItem }) {
  const { icon: Icon, detail, lines } = summaryLines(item);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            Item adicionado do cálculo
          </p>
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
          {lines.map((line) => (
            <p key={line} className="text-sm text-foreground">
              {line}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
