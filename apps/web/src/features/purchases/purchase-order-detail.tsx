"use client";

/**
 * SUPPLY-FRONTEND-01C. Fully API-driven — zero local store reads. Status-
 * action buttons call the real confirm/cancel/return-to-draft/delete
 * endpoints with the order's own opaque `updated_at` token; a 409 shows a
 * controlled notice and refetches truth, never a silent retry. Item/
 * receipt deletes surface the server's own message verbatim (the
 * GoodsReceipt chronology guard in particular returns a specific 422).
 *
 * The old prototype's "Financeiro"/Payable-generation section and its
 * local `hasPayables` guard are REMOVED here: the Supply backend does not
 * implement a PurchaseOrder→Payable integration, so a local-only
 * `hasPayables` rule had no real API authority backing it. Return-to-
 * draft/cancel/delete guards below rely solely on
 * `order.goods_receipts.length > 0` (real data) — no new financial
 * integration is created in this gate; the existing, still-working
 * Payable "Gerar conta a pagar" flow (unrelated to this guard) is
 * migrated separately in `payable-form.tsx`/`payable-detail.tsx`.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2 } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { formatMaterialUnitCode } from "@/features/materials/material-unit";
import { purchaseDecimalApiToInput } from "./purchase-decimal";
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  deleteGoodsReceipt,
  deletePurchaseOrder,
  deletePurchaseOrderItem,
  returnPurchaseOrderToDraft,
} from "./purchase-orders-client";
import { usePurchaseOrder } from "./use-purchase-order";
import { removeGoodsReceiptShadowEntriesForReceipt } from "./prototype/goods-receipt-shadow-store";
import { PurchaseOrderStatusBadge } from "./components/status-badge";
import { PURCHASE_ORDER_FULFILLMENT_LABEL, type GoodsReceipt } from "./types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function serverMessageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiValidationError) {
    return error.serverMessage ?? Object.values(error.errors)[0]?.[0] ?? fallback;
  }
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

export function PurchaseOrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const { order, error, reload } = usePurchaseOrder(id);

  if (error) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar esta compra agora.
        </p>
        <Button type="button" onClick={reload}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (order === undefined) return null;

  if (order === null) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Compra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const status = order.commercial_status;
  const hasGoodsReceipts = order.goods_receipts.length > 0;
  const isFullyReceived = order.fulfillment_status === "received";

  async function handleStatusAction(
    action: (orderId: string, payload: { updated_at: string }) => Promise<unknown>,
    confirmMessage?: string
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    try {
      await action(id, { updated_at: order!.updated_at });
      reload();
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 409) {
        window.alert("A compra foi alterada por outra operação. Os dados foram atualizados.");
        reload();
        return;
      }
      window.alert(serverMessageOf(actionError, "Não foi possível concluir esta ação agora."));
    }
  }

  async function handleDeleteItem(itemId: string, description: string) {
    const confirmed = window.confirm(`Remover "${description}" deste pedido?`);
    if (!confirmed) return;
    try {
      await deletePurchaseOrderItem(id, itemId);
      reload();
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 409) {
        window.alert("A compra foi alterada por outra operação. Os dados foram atualizados.");
        reload();
        return;
      }
      window.alert(serverMessageOf(deleteError, "Não foi possível excluir este item agora."));
    }
  }

  async function handleDeletePurchaseOrder() {
    const confirmed = window.confirm("Excluir este pedido de compra? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    try {
      await deletePurchaseOrder(id, { updated_at: order!.updated_at });
      router.push("/compras");
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 409) {
        window.alert("A compra foi alterada por outra operação. Os dados foram atualizados.");
        reload();
        return;
      }
      window.alert(serverMessageOf(deleteError, "Não foi possível excluir agora."));
    }
  }

  async function handleDeleteGoodsReceipt(goodsReceipt: GoodsReceipt) {
    const confirmed = window.confirm(
      `Excluir o recebimento de ${formatDate(goodsReceipt.received_at)}? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    try {
      await deleteGoodsReceipt(id, goodsReceipt.id);
      removeGoodsReceiptShadowEntriesForReceipt(goodsReceipt.id);
      reload();
    } catch (deleteError) {
      window.alert(
        serverMessageOf(
          deleteError,
          "Não foi possível excluir este recebimento agora."
        )
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader title={order.supplier.name} onBack={() => router.push("/compras")} />
      </div>

      <div className="flex items-center gap-2 pl-11">
        <PurchaseOrderStatusBadge status={status} />
        <span className="text-xs font-medium text-muted-foreground">{order.number}</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-sm text-muted-foreground">Obra</span>
          <Link href={`/obras/${order.project.id}`} className="text-sm font-medium text-primary hover:underline">
            {order.project.name}
          </Link>
        </div>
        <InfoRow label="Data do pedido" value={formatDate(order.order_date)} />
        {order.expected_delivery_date ? (
          <InfoRow label="Previsão de entrega" value={formatDate(order.expected_delivery_date)} />
        ) : null}
        {order.notes ? <InfoRow label="Observação" value={order.notes} /> : null}
      </div>

      <section aria-labelledby="purchase-order-items" className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="purchase-order-items" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Itens
          </h2>
          {status !== "cancelled" && !isFullyReceived ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/compras/${id}/itens/novo`}>Adicionar item</Link>} />
          ) : null}
        </div>

        {order.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item adicionado ainda.</p>
        ) : (
          <>
            <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={status !== "cancelled" ? `/compras/${id}/itens/${item.id}/editar` : "#"} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {purchaseDecimalApiToInput(item.quantity)} {formatMaterialUnitCode(item.unit_code, item.unit_custom_label)} ×{" "}
                      {decimalStringToBrlDisplay(item.unit_price)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {decimalStringToBrlDisplay(item.line_total)}
                    </span>
                    {status !== "cancelled" && Number(item.received_quantity) === 0 ? (
                      <button
                        type="button"
                        aria-label="Excluir item"
                        onClick={() => void handleDeleteItem(item.id, item.description)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {decimalStringToBrlDisplay(order.total)}
              </span>
            </div>
          </>
        )}
      </section>

      {order.items.length > 0 ? (
        <section aria-labelledby="purchase-order-receiving" className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="purchase-order-receiving" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Recebimento
            </h2>
            <span className="text-xs font-medium text-muted-foreground">
              {PURCHASE_ORDER_FULFILLMENT_LABEL[order.fulfillment_status]}
            </span>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {order.items.map((item) => {
              const unitLabel = formatMaterialUnitCode(item.unit_code, item.unit_custom_label);
              const pendingLabel = status === "cancelled" ? "Restante cancelado" : "Pendente";
              return (
                <div key={item.id} className="space-y-1 py-2.5">
                  <p className="text-sm font-medium text-foreground">{item.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pedido</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {purchaseDecimalApiToInput(item.quantity)} {unitLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Recebido</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {purchaseDecimalApiToInput(item.received_quantity)} {unitLabel}
                    </span>
                  </div>
                  {Number(item.remaining_quantity) > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{pendingLabel}</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {purchaseDecimalApiToInput(item.remaining_quantity)} {unitLabel}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {status === "ordered" && !isFullyReceived ? (
            <Button
              size="lg"
              className="w-full"
              nativeButton={false}
              render={<Link href={`/compras/${id}/recebimentos/novo`}>Registrar recebimento</Link>}
            />
          ) : null}
        </section>
      ) : null}

      {order.goods_receipts.length > 0 ? (
        <section aria-labelledby="purchase-order-receipts-history" className="space-y-2.5">
          <h2 id="purchase-order-receipts-history" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Histórico de recebimentos
          </h2>
          <div className="space-y-2">
            {order.goods_receipts.map((goodsReceipt) => (
              <div key={goodsReceipt.id} className="space-y-1.5 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{formatDate(goodsReceipt.received_at)}</p>
                  <button
                    type="button"
                    aria-label="Excluir recebimento"
                    onClick={() => void handleDeleteGoodsReceipt(goodsReceipt)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
                {goodsReceipt.items.map((line) => {
                  const orderItem = order.items.find((entry) => entry.id === line.purchase_order_item_id);
                  return (
                    <div key={line.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{orderItem?.description ?? "Item removido"}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {purchaseDecimalApiToInput(line.quantity)}{" "}
                        {orderItem ? formatMaterialUnitCode(orderItem.unit_code, orderItem.unit_custom_label) : ""}
                      </span>
                    </div>
                  );
                })}
                {goodsReceipt.notes ? <p className="text-xs text-muted-foreground">{goodsReceipt.notes}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-2">
        {status === "draft" ? (
          <>
            <Button type="button" size="lg" className="w-full" onClick={() => void handleStatusAction(confirmPurchaseOrder)}>
              Confirmar pedido
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href={`/compras/${id}/editar`}>Editar</Link>} />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleStatusAction(cancelPurchaseOrder, "Cancelar este pedido de compra?")}
              >
                Cancelar pedido
              </Button>
            </div>
            <Button type="button" variant="destructive" className="w-full" onClick={() => void handleDeletePurchaseOrder()}>
              Excluir
            </Button>
          </>
        ) : null}

        {status === "ordered" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href={`/compras/${id}/editar`}>Editar</Link>} />
              {!hasGoodsReceipts ? (
                <Button type="button" variant="outline" onClick={() => void handleStatusAction(returnPurchaseOrderToDraft)}>
                  Voltar para rascunho
                </Button>
              ) : null}
            </div>
            {!isFullyReceived ? (
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={() => void handleStatusAction(cancelPurchaseOrder, "Cancelar este pedido de compra?")}
              >
                Cancelar pedido
              </Button>
            ) : null}
            {hasGoodsReceipts ? (
              <p className="text-center text-xs text-muted-foreground">
                Este pedido possui recebimentos e não pode voltar para rascunho.
              </p>
            ) : null}
          </>
        ) : null}

        {status === "cancelled" ? (
          hasGoodsReceipts ? (
            <p className="text-center text-xs text-muted-foreground">
              Este pedido possui recebimentos históricos e não pode voltar para rascunho.
            </p>
          ) : (
            <Button type="button" size="lg" className="w-full" onClick={() => void handleStatusAction(returnPurchaseOrderToDraft)}>
              Reativar para rascunho
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
