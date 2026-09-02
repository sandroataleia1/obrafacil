"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PackageCheck } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatQuantity } from "@/lib/quantity";
import { todayIso } from "@/lib/date";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import { calculateItemFulfillment } from "./prototype/fulfillment";
import { registerGoodsReceipt } from "./prototype/goods-receipt";
import { listReceiptItemsByPurchaseOrder } from "./prototype/goods-receipt-item-store";
import { usePurchaseOrder } from "./prototype/use-purchase-order";
import type { GoodsReceiptItem } from "./types";

function parseQuantity(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".").trim();
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function GoodsReceiptForm({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const { purchaseOrder, items } = usePurchaseOrder(purchaseOrderId);
  const [receiptItems, setReceiptItems] = useState<GoodsReceiptItem[] | undefined>(undefined);
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceiptItems(listReceiptItemsByPurchaseOrder(purchaseOrderId));
  }, [purchaseOrderId]);

  if (purchaseOrder === undefined || receiptItems === undefined) return null;

  if (purchaseOrder === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra não encontrada" onBack={() => router.push("/compras")} />
      </div>
    );
  }

  const pendingItems = items
    .map((item) => ({ item, fulfillment: calculateItemFulfillment(item, receiptItems) }))
    .filter(({ fulfillment }) => fulfillment.remainingQuantity > 0);

  function handleSubmit() {
    if (!purchaseOrder) return;
    if (receivedAt.trim() === "") {
      setError("Informe a data do recebimento.");
      return;
    }

    const lines = pendingItems
      .map(({ item }) => ({
        purchaseOrderItemId: item.id,
        quantity: parseQuantity(quantities[item.id] ?? "") ?? 0,
      }))
      .filter((line) => line.quantity > 0);

    const result = registerGoodsReceipt(purchaseOrder, { receivedAt, notes, items: lines });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push(`/compras/${purchaseOrderId}`);
  }

  if (pendingItems.length === 0) {
    return (
      <div className="space-y-6">
        <BackHeader
          title="Registrar recebimento"
          onBack={() => router.push(`/compras/${purchaseOrderId}`)}
        />
        <EmptyState
          compact
          icon={PackageCheck}
          title="Nada pendente"
          description="Todos os itens deste pedido já foram totalmente recebidos."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackHeader
          title="Registrar recebimento"
          onBack={() => router.push(`/compras/${purchaseOrderId}`)}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="goods-receipt-date" className="text-sm font-medium text-foreground">
            Data do recebimento
          </label>
          <input
            id="goods-receipt-date"
            type="date"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="goods-receipt-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="goods-receipt-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-3">
          <span className="text-sm font-medium text-foreground">Itens pendentes</span>
          <p className="text-xs text-muted-foreground">
            Preencha apenas os itens que chegaram nesta entrega.
          </p>
          <div className="space-y-3">
            {pendingItems.map(({ item, fulfillment }) => {
              const unitLabel = formatMaterialUnit(item.unit);
              return (
                <div key={item.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{item.description}</p>
                    <span className="text-xs text-muted-foreground">
                      Pendente {formatQuantity(fulfillment.remainingQuantity)} {unitLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quantities[item.id] ?? ""}
                      onChange={(event) =>
                        setQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))
                      }
                      placeholder="0"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                    <span className="shrink-0 text-sm text-muted-foreground">{unitLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Button type="button" size="lg" onClick={handleSubmit} className="w-full">
        Registrar recebimento
      </Button>
    </div>
  );
}
