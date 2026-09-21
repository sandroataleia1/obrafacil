"use client";

/**
 * SUPPLY-FRONTEND-01C. Server-side pagination/filtering replaces the old
 * client-side filter()/slice() over a locally-held array — mirrors
 * `features/materials/material-list.tsx`'s discipline exactly, via
 * `usePurchaseOrderList`. `order.total` (API-computed) is the sole
 * authority for the displayed value — never recalculated from items.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ClipboardList, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useAllProjects } from "@/features/projects/use-all-projects";
import { deletePurchaseOrder } from "./purchase-orders-client";
import { usePurchaseOrderList } from "./use-purchase-orders";
import { PurchaseOrderStatusBadge } from "./components/status-badge";
import {
  PURCHASE_ORDER_FULFILLMENT_LABEL,
  PURCHASE_ORDER_STATUS_FILTERS,
  PURCHASE_ORDER_STATUS_FILTER_LABEL,
  type PurchaseOrderListItem,
  type PurchaseOrderStatusFilter,
} from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

interface RowActionsProps {
  purchaseOrder: PurchaseOrderListItem;
  onDelete: (purchaseOrder: PurchaseOrderListItem) => void;
}

function RowActions({ purchaseOrder, onDelete }: RowActionsProps) {
  const status = purchaseOrder.commercial_status;
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

function PurchaseOrderCard({ purchaseOrder, onDelete }: RowActionsProps) {
  const showFulfillment = purchaseOrder.fulfillment_status !== "not_received";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{purchaseOrder.supplier.name}</p>
          <PurchaseOrderStatusBadge status={purchaseOrder.commercial_status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">{purchaseOrder.project.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {decimalStringToBrlDisplay(purchaseOrder.total)}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(purchaseOrder.order_date)}</span>
        </div>
        {showFulfillment ? (
          <p className="text-[11px] text-muted-foreground/70">
            {PURCHASE_ORDER_FULFILLMENT_LABEL[purchaseOrder.fulfillment_status]}
          </p>
        ) : null}
      </div>
      <RowActions purchaseOrder={purchaseOrder} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "grid-cols-[minmax(0,1fr)_150px_140px_110px_112px] items-center gap-4";

function PurchaseOrderTableRow({ purchaseOrder, onDelete }: RowActionsProps) {
  return (
    <div className={cn("grid px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{purchaseOrder.supplier.name}</p>
        <p className="truncate text-xs text-muted-foreground">{purchaseOrder.project.name}</p>
      </div>
      <div>
        <PurchaseOrderStatusBadge status={purchaseOrder.commercial_status} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {decimalStringToBrlDisplay(purchaseOrder.total)}
      </span>
      <span className="text-sm text-muted-foreground">{formatDate(purchaseOrder.order_date)}</span>
      <div className="justify-self-end">
        <RowActions purchaseOrder={purchaseOrder} onDelete={onDelete} />
      </div>
    </div>
  );
}

function PurchaseOrderTable({ purchaseOrders, onDelete }: { purchaseOrders: PurchaseOrderListItem[]; onDelete: (purchaseOrder: PurchaseOrderListItem) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "grid border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
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
          <PurchaseOrderTableRow key={purchaseOrder.id} purchaseOrder={purchaseOrder} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function Pagination({ page, lastPage, onChange }: { page: number; lastPage: number; onChange: (page: number) => void }) {
  if (lastPage <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Página {page} de {lastPage}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(page + 1)} disabled={page >= lastPage}>
        Próxima
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

interface DeleteState {
  purchaseOrder: PurchaseOrderListItem;
  error: string | null;
}

export function PurchaseOrderList() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? undefined;
  const supplierId = searchParams.get("supplierId") ?? undefined;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);

  const { projects: allProjects } = useAllProjects();
  const project = projectId ? (allProjects ?? []).find((item) => item.id === projectId) : undefined;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { response, error, loading, reload } = usePurchaseOrderList({
    search: search || undefined,
    commercialStatus: statusFilter === "all" ? undefined : statusFilter,
    projectId,
    supplierId,
    page,
    perPage: PER_PAGE,
  });

  function updateStatusFilter(value: PurchaseOrderStatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  const newHref = projectId ? `/compras/nova?projectId=${projectId}` : "/compras/nova";

  function handleDelete(purchaseOrder: PurchaseOrderListItem) {
    setDeleteState({ purchaseOrder, error: null });
  }

  async function handleConfirmDelete() {
    if (!deleteState) return;
    const { purchaseOrder } = deleteState;
    try {
      await deletePurchaseOrder(purchaseOrder.id, { updated_at: purchaseOrder.updated_at });
      setDeleteState(null);
      reload();
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 409) {
        setDeleteState(null);
        reload();
        return;
      }
      if (deleteError instanceof ApiError && deleteError.status === 404) {
        setDeleteState(null);
        reload();
        return;
      }
      if (deleteError instanceof ApiValidationError) {
        setDeleteState({
          purchaseOrder,
          error: deleteError.serverMessage ?? Object.values(deleteError.errors)[0]?.[0] ?? "Não foi possível excluir agora.",
        });
        return;
      }
      setDeleteState({ purchaseOrder, error: "Não foi possível excluir agora." });
    }
  }

  const items = response?.data ?? [];
  const lastPage = response?.meta.last_page ?? 1;
  const isFiltered = search !== "" || statusFilter !== "all";
  const isEmptyOverall = response !== undefined && items.length === 0 && !isFiltered && page === 1;
  const isEmptySearch = response !== undefined && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={ClipboardList}>Compras</PageTitle>
          <p className="text-sm text-muted-foreground">
            {project
              ? `Compras · ${project.name}`
              : projectId
                ? "Obra não encontrada"
                : "Pedidos de compra de materiais."}
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href={newHref}>
              <Plus className="size-4" aria-hidden="true" />
              Nova
            </Link>
          }
        />
      </div>

      {projectId ? (
        <Link href="/compras" className="inline-block text-xs font-medium text-primary hover:underline">
          Ver todas as compras
        </Link>
      ) : null}

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por fornecedor, obra ou número"
            aria-label="Buscar por fornecedor, obra ou número"
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

      {error ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar as compras agora.
          </p>
          <Button type="button" onClick={() => reload()}>
            Tentar novamente
          </Button>
        </div>
      ) : loading || response === undefined ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Carregando compras</span>
        </div>
      ) : isEmptyOverall ? (
        <EmptyState
          icon={ClipboardList}
          title={projectId ? "Nenhuma compra para esta obra" : "Nenhuma compra ainda"}
          description={
            projectId
              ? "Registre um pedido de compra para esta obra."
              : "Registre pedidos de compra de materiais para as obras."
          }
        />
      ) : isEmptySearch ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma compra encontrada"
          description="Ajuste a busca ou o filtro para ver outras compras."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((purchaseOrder) => (
              <PurchaseOrderCard key={purchaseOrder.id} purchaseOrder={purchaseOrder} onDelete={handleDelete} />
            ))}
          </div>
          <div className="hidden lg:block">
            <PurchaseOrderTable purchaseOrders={items} onDelete={handleDelete} />
          </div>
          <Pagination page={response.meta.current_page} lastPage={lastPage} onChange={setPage} />
        </>
      )}

      {response !== undefined && items.length === 0 && !isFiltered ? (
        <Button size="lg" className="w-full" nativeButton={false} render={<Link href={newHref}>Registrar primeira compra</Link>} />
      ) : null}

      <ConfirmActionDialog
        open={deleteState !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteState(null);
        }}
        title="Excluir pedido de compra?"
        description={
          deleteState
            ? `Excluir o pedido de compra do fornecedor "${deleteState.purchaseOrder.supplier.name}"? Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDelete}
      >
        {deleteState?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteState.error}
          </p>
        ) : null}
      </ConfirmActionDialog>
    </div>
  );
}
