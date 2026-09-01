"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { listSuppliers } from "@/features/suppliers/prototype/supplier-store";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { listItemsByPurchaseOrder } from "./prototype/purchase-order-item-store";
import { calculatePurchaseOrderTotal } from "./prototype/purchase-totals";
import { usePurchaseOrders } from "./prototype/use-purchase-orders";
import { PurchaseOrderStatusBadge } from "./components/status-badge";
import {
  PURCHASE_ORDER_STATUS_FILTERS,
  PURCHASE_ORDER_STATUS_FILTER_LABEL,
  type PurchaseOrder,
  type PurchaseOrderStatusFilter,
} from "./types";

function matchesFilter(purchaseOrder: PurchaseOrder, filter: PurchaseOrderStatusFilter): boolean {
  if (filter === "all") return true;
  return purchaseOrder.commercialStatus === filter;
}

function PurchaseOrderRow({
  purchaseOrder,
  supplierName,
  projectName,
}: {
  purchaseOrder: PurchaseOrder;
  supplierName?: string;
  projectName?: string;
}) {
  const total = calculatePurchaseOrderTotal(listItemsByPurchaseOrder(purchaseOrder.id));

  return (
    <Link
      href={`/compras/${purchaseOrder.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {supplierName ?? "Fornecedor não encontrado"}
        </p>
        {projectName ? (
          <p className="truncate text-xs text-muted-foreground">{projectName}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">Pedido em {formatDate(purchaseOrder.orderDate)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(total)}
        </span>
        <PurchaseOrderStatusBadge status={purchaseOrder.commercialStatus} />
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function PurchaseOrderList() {
  const { purchaseOrders } = usePurchaseOrders();
  const [filter, setFilter] = useState<PurchaseOrderStatusFilter>("all");
  const suppliers = listSuppliers();
  const projects = listAllProjects();

  const filtered = purchaseOrders
    ? purchaseOrders.filter((purchaseOrder) => matchesFilter(purchaseOrder, filter))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Compras</h1>
          <p className="text-sm text-muted-foreground">Pedidos de compra de materiais.</p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/compras/nova">
              <Plus className="size-4" aria-hidden="true" />
              Nova
            </Link>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {PURCHASE_ORDER_STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={
              filter === item
                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
            }
          >
            {PURCHASE_ORDER_STATUS_FILTER_LABEL[item]}
          </button>
        ))}
      </div>

      {purchaseOrders === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={purchaseOrders.length === 0 ? "Nenhuma compra ainda" : "Nenhuma compra neste filtro"}
          description={
            purchaseOrders.length === 0
              ? "Registre pedidos de compra de materiais para as obras."
              : "Ajuste o filtro para ver outras compras."
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((purchaseOrder) => (
            <PurchaseOrderRow
              key={purchaseOrder.id}
              purchaseOrder={purchaseOrder}
              supplierName={
                suppliers.find((supplier) => supplier.id === purchaseOrder.supplierId)?.name
              }
              projectName={projects.find((project) => project.id === purchaseOrder.projectId)?.name}
            />
          ))}
        </div>
      )}

      {purchaseOrders !== undefined && purchaseOrders.length === 0 ? (
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/compras/nova">Registrar primeira compra</Link>}
        />
      ) : null}
    </div>
  );
}
