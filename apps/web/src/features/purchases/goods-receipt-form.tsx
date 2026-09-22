"use client";

/**
 * SUPPLY-FRONTEND-01C. Real API POST — order must be `commercial_status
 * == "ordered"`, pending items come from `item.remaining_quantity > 0`,
 * only positive filled lines are sent, at least 1 line is required.
 *
 * SUPPLY-FRONTEND-01C1 §12/§18: NO local write of any kind after a
 * successful POST — the previous write-through `goods-receipt-shadow-
 * store.ts` mirror was removed entirely (it was a second, incomplete
 * source of physical-arrival facts). Navigation back to the detail
 * always re-reads the API, which is the only place this GoodsReceipt
 * now exists. Outer-wrapper + keyed-Inner tenant-ownership pattern
 * (`${companyId}:${purchaseOrderId}`) — a POST that resolves after a
 * Company/id switch must produce zero navigation, zero error message,
 * zero reload: `activeCompanyIdRef`/`orderIdRef` (written together via
 * `useLayoutEffect` in the outer) are checked before every
 * `router.push`/`setFormError`/`reload()` in the async continuation.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PackageCheck } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { todayIso } from "@/lib/date";
import { useAuth } from "@/features/auth/auth-provider";
import { formatMaterialUnitCode } from "@/features/materials/material-unit";
import { createGoodsReceipt } from "./purchase-orders-client";
import { usePurchaseOrder } from "./use-purchase-order";
import { purchaseDecimalApiToInput, purchaseQuantityInputToApi } from "./purchase-decimal";

function GoodsReceiptFormInner({
  purchaseOrderId,
  activeCompanyIdRef,
  orderIdRef,
}: {
  purchaseOrderId: string;
  activeCompanyIdRef: React.RefObject<string | undefined>;
  orderIdRef: React.RefObject<string>;
}) {
  const router = useRouter();
  const { order, error, reload } = usePurchaseOrder(purchaseOrderId);
  const [receivedAt, setReceivedAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (error) {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra" onBack={() => router.push(`/compras/${purchaseOrderId}`)} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar esta compra agora.
          </p>
          <Button type="button" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (order === undefined) return null;

  if (order === null || order.commercial_status !== "ordered") {
    return (
      <div className="space-y-6">
        <BackHeader title="Compra não encontrada" onBack={() => router.push("/compras")} />
      </div>
    );
  }

  const pendingItems = order.items.filter((item) => Number(item.remaining_quantity) > 0);

  const submitCompanyId = activeCompanyIdRef.current;
  const submitOrderId = orderIdRef.current;
  function isStale(): boolean {
    return activeCompanyIdRef.current !== submitCompanyId || orderIdRef.current !== submitOrderId;
  }

  async function handleSubmit() {
    if (receivedAt.trim() === "") {
      setFormError("Informe a data do recebimento.");
      return;
    }

    const lines: { purchase_order_item_id: string; quantity: string }[] = [];
    for (const item of pendingItems) {
      const raw = quantities[item.id] ?? "";
      if (raw.trim() === "") continue;
      const quantity = purchaseQuantityInputToApi(raw);
      if (quantity === null) {
        setFormError("Informe quantidades válidas, maiores que zero e com até 3 casas decimais.");
        return;
      }
      lines.push({ purchase_order_item_id: item.id, quantity });
    }

    if (lines.length === 0) {
      setFormError("Preencha ao menos um item recebido.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await createGoodsReceipt(purchaseOrderId, {
        received_at: receivedAt,
        notes: notes.trim() || null,
        items: lines,
      });

      if (isStale()) return;
      setSubmitting(false);
      router.push(`/compras/${purchaseOrderId}`);
    } catch (submitError) {
      if (isStale()) return;
      setSubmitting(false);
      if (submitError instanceof ApiError && submitError.status === 409) {
        setFormError("A compra foi alterada por outra operação. Os dados foram atualizados.");
        reload();
        return;
      }
      if (submitError instanceof ApiValidationError) {
        setFormError(submitError.serverMessage ?? Object.values(submitError.errors)[0]?.[0] ?? "Não foi possível registrar o recebimento.");
        return;
      }
      setFormError("Não foi possível registrar o recebimento agora. Tente novamente.");
    }
  }

  if (pendingItems.length === 0) {
    return (
      <div className="space-y-6">
        <BackHeader title="Registrar recebimento" onBack={() => router.push(`/compras/${purchaseOrderId}`)} />
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
        <BackHeader title="Registrar recebimento" onBack={() => router.push(`/compras/${purchaseOrderId}`)} />
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
          <p className="text-xs text-muted-foreground">Preencha apenas os itens que chegaram nesta entrega.</p>
          <div className="space-y-3">
            {pendingItems.map((item) => {
              const unitLabel = formatMaterialUnitCode(item.unit_code, item.unit_custom_label);
              return (
                <div key={item.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{item.description}</p>
                    <span className="text-xs text-muted-foreground">
                      Pendente {purchaseDecimalApiToInput(item.remaining_quantity)} {unitLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quantities[item.id] ?? ""}
                      onChange={(event) => setQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))}
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

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
      </div>

      <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={submitting} className="w-full">
        Registrar recebimento
      </Button>
    </div>
  );
}

export function GoodsReceiptForm({ purchaseOrderId }: { purchaseOrderId: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  const orderIdRef = useRef(purchaseOrderId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
    orderIdRef.current = purchaseOrderId;
  }, [activeCompanyId, purchaseOrderId]);

  return (
    <GoodsReceiptFormInner
      key={`${activeCompanyId}:${purchaseOrderId}`}
      purchaseOrderId={purchaseOrderId}
      activeCompanyIdRef={activeCompanyIdRef}
      orderIdRef={orderIdRef}
    />
  );
}
