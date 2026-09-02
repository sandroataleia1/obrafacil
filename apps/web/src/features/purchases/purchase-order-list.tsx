"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { listSuppliers } from "@/features/suppliers/prototype/supplier-store";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { calculatePurchaseOrderFulfillment } from "./prototype/fulfillment";
import { listReceiptItemsByPurchaseOrder } from "./prototype/goods-receipt-item-store";
import { listItemsByPurchaseOrder } from "./prototype/purchase-order-item-store";
import { removePurchaseOrder } from "./prototype/purchase-order";
import { calculatePurchaseOrderTotal } from "./prototype/purchase-totals";
import { usePurchaseOrders } from "./prototype/use-purchase-orders";
import { PurchaseOrderStatusBadge } from "./components/status-badge";
import {
  PURCHASE_ORDER_STATUS_FILTERS,
  PURCHASE_ORDER_STATUS_FILTER_LABEL,
  type PurchaseOrder,
  type PurchaseOrderStatusFilter,
} from "./types";

const FULFILLMENT_LABEL: Record<string, string> = {
  not_received: "Não recebido",
  partial: "Recebimento parcial",
  received: "Recebido",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesFilter(purchaseOrder: PurchaseOrder, filter: PurchaseOrderStatusFilter): boolean {
  if (filter === "all") return true;
  return purchaseOrder.commercialStatus === filter;
}

interface RowActionsProps {
  purchaseOrder: PurchaseOrder;
  onDelete: (purchaseOrder: PurchaseOrder) => void;
}

function RowActions({ purchaseOrder, onDelete }: RowActionsProps) {
  const status = purchaseOrder.commercialStatus;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/compras/${purchaseOrder.id}`}
        aria-label="Ver pedido"
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      {status !== "cancelled" ? (
        <Link
          href={`/compras/${purchaseOrder.id}/editar`}
          aria-label="Editar pedido"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
      {status === "draft" ? (
        <button
          type="button"
          onClick={() => onDelete(purchaseOrder)}
          aria-label="Excluir pedido"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function PurchaseOrderCard({
  purchaseOrder,
  supplierName,
  projectName,
  onDelete,
}: {
  purchaseOrder: PurchaseOrder;
  supplierName?: string;
  projectName?: string;
  onDelete: (purchaseOrder: PurchaseOrder) => void;
}) {
  const items = listItemsByPurchaseOrder(purchaseOrder.id);
  const receiptItems = listReceiptItemsByPurchaseOrder(purchaseOrder.id);
  const total = calculatePurchaseOrderTotal(items);
  const fulfillment = calculatePurchaseOrderFulfillment(items, receiptItems);
  const showFulfillment =
    (purchaseOrder.commercialStatus === "ordered" && fulfillment !== "not_received") ||
    (purchaseOrder.commercialStatus === "cancelled" && fulfillment !== "not_received");

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {supplierName ?? "Fornecedor não encontrado"}
          </p>
          <PurchaseOrderStatusBadge status={purchaseOrder.commercialStatus} />
        </div>
        {projectName ? <p className="truncate text-xs text-muted-foreground">{projectName}</p> : null}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(total)}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(purchaseOrder.orderDate)}</span>
        </div>
        {showFulfillment ? (
          <p className="text-[11px] text-muted-foreground/70">{FULFILLMENT_LABEL[fulfillment]}</p>
        ) : null}
      </div>
      <RowActions purchaseOrder={purchaseOrder} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_150px_140px_110px_112px] lg:items-center lg:gap-4";

function PurchaseOrderTableRow({
  purchaseOrder,
  supplierName,
  projectName,
  onDelete,
}: {
  purchaseOrder: PurchaseOrder;
  supplierName?: string;
  projectName?: string;
  onDelete: (purchaseOrder: PurchaseOrder) => void;
}) {
  const items = listItemsByPurchaseOrder(purchaseOrder.id);
  const total = calculatePurchaseOrderTotal(items);

  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {supplierName ?? "Fornecedor não encontrado"}
        </p>
        {projectName ? <p className="truncate text-xs text-muted-foreground">{projectName}</p> : null}
      </div>
      <div>
        <PurchaseOrderStatusBadge status={purchaseOrder.commercialStatus} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(total)}
      </span>
      <span className="text-sm text-muted-foreground">{formatDate(purchaseOrder.orderDate)}</span>
      <div className="justify-self-end">
        <RowActions purchaseOrder={purchaseOrder} onDelete={onDelete} />
      </div>
    </div>
  );
}

function PurchaseOrderTable({
  purchaseOrders,
  suppliers,
  projects,
  onDelete,
}: {
  purchaseOrders: PurchaseOrder[];
  suppliers: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onDelete: (purchaseOrder: PurchaseOrder) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Pedido</span>
        <span>Status</span>
        <span>Valor</span>
        <span>Data</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {purchaseOrders.map((purchaseOrder) => (
          <PurchaseOrderTableRow
            key={purchaseOrder.id}
            purchaseOrder={purchaseOrder}
            supplierName={suppliers.find((supplier) => supplier.id === purchaseOrder.supplierId)?.name}
            projectName={projects.find((project) => project.id === purchaseOrder.projectId)?.name}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

const MOBILE_PAGE_SIZE = 5;
const DESKTOP_PAGE_SIZE = 15;

function Pagination({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Página {page + 1} de {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
      >
        Próxima
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function PurchaseOrderList() {
  const { purchaseOrders, refresh } = usePurchaseOrders();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);
  const suppliers = listSuppliers();
  const projects = listAllProjects();

  function handleDelete(purchaseOrder: PurchaseOrder) {
    const confirmed = window.confirm(
      "Excluir este pedido de compra? Esta ação não pode ser desfeita."
    );
    if (!confirmed) return;
    const result = removePurchaseOrder(purchaseOrder);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  const normalizedSearch = normalize(search.trim());
  const filtered = (purchaseOrders ?? []).filter((purchaseOrder) => {
    if (!matchesFilter(purchaseOrder, statusFilter)) return false;
    if (normalizedSearch === "") return true;
    const supplierName = suppliers.find((supplier) => supplier.id === purchaseOrder.supplierId)?.name ?? "";
    const projectName = projects.find((project) => project.id === purchaseOrder.projectId)?.name ?? "";
    return (
      normalize(supplierName).includes(normalizedSearch) ||
      normalize(projectName).includes(normalizedSearch)
    );
  });

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: PurchaseOrderStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobilePurchaseOrders = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopPurchaseOrders = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

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

      {purchaseOrders === undefined || purchaseOrders.length === 0 ? null : (
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Buscar por fornecedor ou obra"
              aria-label="Buscar por fornecedor ou obra"
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {PURCHASE_ORDER_STATUS_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={statusFilter === item}
                onClick={() => updateStatusFilter(item)}
                className={
                  statusFilter === item
                    ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
                }
              >
                {PURCHASE_ORDER_STATUS_FILTER_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
      )}

      {purchaseOrders === undefined ? null : purchaseOrders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma compra ainda"
          description="Registre pedidos de compra de materiais para as obras."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma compra encontrada"
          description="Ajuste a busca ou o filtro para ver outras compras."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobilePurchaseOrders.map((purchaseOrder) => (
              <PurchaseOrderCard
                key={purchaseOrder.id}
                purchaseOrder={purchaseOrder}
                supplierName={
                  suppliers.find((supplier) => supplier.id === purchaseOrder.supplierId)?.name
                }
                projectName={projects.find((project) => project.id === purchaseOrder.projectId)?.name}
                onDelete={handleDelete}
              />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <PurchaseOrderTable
              purchaseOrders={desktopPurchaseOrders}
              suppliers={suppliers}
              projects={projects}
              onDelete={handleDelete}
            />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
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
