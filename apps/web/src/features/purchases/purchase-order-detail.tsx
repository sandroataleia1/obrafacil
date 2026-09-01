"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2 } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { formatQuantity } from "@/lib/quantity";
import { getSupplier } from "@/features/suppliers/prototype/supplier-store";
import { getProject } from "@/features/projects/prototype/project-store";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import {
  changePurchaseOrderStatus,
  removePurchaseOrder,
  removePurchaseOrderItem,
} from "./prototype/purchase-order";
import { calculatePurchaseItemTotal, calculatePurchaseOrderTotal } from "./prototype/purchase-totals";
import { usePurchaseOrder } from "./prototype/use-purchase-order";
import { PurchaseOrderStatusBadge } from "./components/status-badge";
import type { PurchaseOrderCommercialStatus } from "./types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function PurchaseOrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const { purchaseOrder, items, refresh } = usePurchaseOrder(id);

  if (purchaseOrder === undefined) return null;

  if (purchaseOrder === null) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Compra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  const supplier = getSupplier(purchaseOrder.supplierId);
  const project = getProject(purchaseOrder.projectId);
  const total = calculatePurchaseOrderTotal(items);
  const status = purchaseOrder.commercialStatus;

  function handleStatusChange(newStatus: PurchaseOrderCommercialStatus, confirmMessage?: string) {
    if (!purchaseOrder) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const result = changePurchaseOrderStatus(purchaseOrder, newStatus, items);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  function handleDeleteItem(itemId: string) {
    if (!purchaseOrder) return;
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    const confirmed = window.confirm(`Remover "${item.description}" deste pedido?`);
    if (!confirmed) return;
    const result = removePurchaseOrderItem(purchaseOrder, item);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  function handleDeletePurchaseOrder() {
    if (!purchaseOrder) return;
    const confirmed = window.confirm("Excluir este pedido de compra? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    const result = removePurchaseOrder(purchaseOrder);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    router.push("/compras");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader
          title={supplier?.name ?? "Fornecedor não encontrado"}
          onBack={() => router.push("/compras")}
        />
      </div>

      <div className="pl-11">
        <PurchaseOrderStatusBadge status={status} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-sm text-muted-foreground">Obra</span>
          {project ? (
            <Link
              href={`/obras/${project.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {project.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-foreground">Obra não encontrada</span>
          )}
        </div>
        <InfoRow label="Data do pedido" value={formatDate(purchaseOrder.orderDate)} />
        {purchaseOrder.expectedDeliveryDate ? (
          <InfoRow label="Previsão de entrega" value={formatDate(purchaseOrder.expectedDeliveryDate)} />
        ) : null}
        {purchaseOrder.notes ? <InfoRow label="Observação" value={purchaseOrder.notes} /> : null}
      </div>

      <section aria-labelledby="purchase-order-items" className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="purchase-order-items"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Itens
          </h2>
          {status !== "cancelled" ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/compras/${id}/itens/novo`}>Adicionar item</Link>}
            />
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item adicionado ainda.</p>
        ) : (
          <>
            <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <Link
                    href={status !== "cancelled" ? `/compras/${id}/itens/${item.id}/editar` : "#"}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-sm font-medium text-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatQuantity(item.quantity)} {formatMaterialUnit(item.unit)} ×{" "}
                      {formatCurrency(item.unitPrice)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(calculatePurchaseItemTotal(item))}
                    </span>
                    {status !== "cancelled" ? (
                      <button
                        type="button"
                        aria-label="Excluir item"
                        onClick={() => handleDeleteItem(item.id)}
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
                {formatCurrency(total)}
              </span>
            </div>
          </>
        )}
      </section>

      <div className="space-y-2">
        {status === "draft" ? (
          <>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => handleStatusChange("ordered")}
            >
              Confirmar pedido
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/compras/${id}/editar`}>Editar</Link>}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  handleStatusChange("cancelled", "Cancelar este pedido de compra?")
                }
              >
                Cancelar pedido
              </Button>
            </div>
            <Button type="button" variant="destructive" className="w-full" onClick={handleDeletePurchaseOrder}>
              Excluir
            </Button>
          </>
        ) : null}

        {status === "ordered" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/compras/${id}/editar`}>Editar</Link>}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => handleStatusChange("draft")}
              >
                Voltar para rascunho
              </Button>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => handleStatusChange("cancelled", "Cancelar este pedido de compra?")}
            >
              Cancelar pedido
            </Button>
          </>
        ) : null}

        {status === "cancelled" ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => handleStatusChange("draft")}
          >
            Reativar para rascunho
          </Button>
        ) : null}
      </div>
    </div>
  );
}
