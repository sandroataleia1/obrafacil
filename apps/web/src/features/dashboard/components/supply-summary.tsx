import Link from "next/link";
import { Boxes, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KpiCard } from "./kpi-card";

/**
 * Dashboard entry point into Estoque (Pilot "Dashboard — Resumo de
 * Suprimentos") — two counts, never a list of materials and never a
 * summed quantity. Same `KpiCard` tone rule as the KPIs above it:
 * neutral at zero, warning once there's something to look at.
 */
export function SupplySummary({
  missingToPurchaseCount,
  pendingReceiptCount,
}: {
  missingToPurchaseCount: number;
  pendingReceiptCount: number;
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard
          icon={Boxes}
          label="Materiais com falta de compra"
          value={String(missingToPurchaseCount)}
          tone={missingToPurchaseCount > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          icon={PackageCheck}
          label="Materiais aguardando recebimento"
          value={String(pendingReceiptCount)}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        nativeButton={false}
        render={<Link href="/estoque">Ver estoque</Link>}
      />
    </div>
  );
}
