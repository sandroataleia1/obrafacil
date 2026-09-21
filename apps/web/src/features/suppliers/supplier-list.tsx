"use client";

/**
 * SUPPLY-FRONTEND-01A §36. Mirrors `features/materials/material-list.tsx`
 * exactly (same server-pagination/tenant-safety discipline).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { CreateSupplierDialog } from "./create-supplier-dialog";
import { deleteSupplier, listSuppliers } from "./suppliers-client";
import { supplierPhoneApiToInput } from "./supplier-phone";
import { hasLocalPurchaseOrder } from "./prototype/supplier-local-dependencies";
import { SupplierStatusBadge } from "./components/status-badge";
import { SUPPLIER_STATUS_FILTERS, SUPPLIER_STATUS_FILTER_LABEL } from "./types";
import type { SupplierListItem, SupplierPaginationResponse, SupplierStatusFilter } from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

type LoadStatus = "loading" | "success" | "error";

function statusFilterToActiveParam(filter: SupplierStatusFilter): boolean | undefined {
  if (filter === "active") return true;
  if (filter === "inactive") return false;
  return undefined;
}

interface RowActionsProps {
  supplier: SupplierListItem;
  onDelete: (supplier: SupplierListItem) => void;
}

function RowActions({ supplier, onDelete }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/fornecedores/${supplier.id}`}
        aria-label={`Ver ${supplier.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      <Link
        href={`/fornecedores/${supplier.id}/editar`}
        aria-label={`Editar ${supplier.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => onDelete(supplier)}
        aria-label={`Excluir ${supplier.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function SupplierCard({ supplier, onDelete }: RowActionsProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{supplier.name}</p>
          <SupplierStatusBadge active={supplier.active} />
        </div>
        {supplier.contact_name ? <p className="truncate text-xs text-muted-foreground">{supplier.contact_name}</p> : null}
        {supplier.phone ? <p className="text-xs text-muted-foreground">{supplierPhoneApiToInput(supplier.phone)}</p> : null}
      </div>
      <RowActions supplier={supplier} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "grid-cols-[minmax(0,1fr)_160px_140px_112px] items-center gap-4";

function SupplierTableRow({ supplier, onDelete }: RowActionsProps) {
  return (
    <div className={cn("grid items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{supplier.name}</p>
        {supplier.contact_name ? <p className="truncate text-xs text-muted-foreground">{supplier.contact_name}</p> : null}
      </div>
      <span className="text-sm text-muted-foreground">{supplier.phone ? supplierPhoneApiToInput(supplier.phone) : "—"}</span>
      <div>
        <SupplierStatusBadge active={supplier.active} />
      </div>
      <div className="justify-self-end">
        <RowActions supplier={supplier} onDelete={onDelete} />
      </div>
    </div>
  );
}

function SupplierTable({ suppliers, onDelete }: { suppliers: SupplierListItem[]; onDelete: (supplier: SupplierListItem) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "grid border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Fornecedor</span>
        <span>Telefone</span>
        <span>Status</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {suppliers.map((supplier) => (
          <SupplierTableRow key={supplier.id} supplier={supplier} onDelete={onDelete} />
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

interface LoadedList {
  companyId: string | undefined;
  response: SupplierPaginationResponse;
}

interface DeleteState {
  companyId: string | undefined;
  supplier: SupplierListItem;
  error: string | null;
}

export function SupplierList() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);
  const previousCompanyIdRef = useRef(activeCompanyId);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const isCompanySwitch = previousCompanyIdRef.current !== activeCompanyId;
    previousCompanyIdRef.current = activeCompanyId;
    const effectivePage = isCompanySwitch ? 1 : page;
    if (isCompanySwitch) {
      setPage(1);
    }

    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");
    try {
      const result = await listSuppliers({
        search: search || undefined,
        page: effectivePage,
        perPage: PER_PAGE,
        active: statusFilterToActiveParam(statusFilter),
      });
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setLoaded({ companyId: requestCompanyId, response: result });
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      if (error instanceof ApiError && error.status === 401) {
        void auth.refresh();
        return;
      }
      setStatus("error");
      setErrorCompanyId(requestCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, statusFilter, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function handleDelete(supplier: SupplierListItem) {
    if (hasLocalPurchaseOrder(supplier.id)) {
      setDeleteState({
        companyId: activeCompanyId,
        supplier,
        error: "Este fornecedor possui compras vinculadas e não pode ser excluído.",
      });
      return;
    }
    setDeleteState({ companyId: activeCompanyId, supplier, error: null });
  }

  async function handleConfirmDelete() {
    if (!deleteState) return;
    const { supplier, companyId: requestCompanyId } = deleteState;
    if (hasLocalPurchaseOrder(supplier.id)) return;
    try {
      await deleteSupplier(supplier.id);
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setDeleteState(null);
      void load();
    } catch (error) {
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      if (error instanceof ApiValidationError) {
        setDeleteState({
          companyId: requestCompanyId,
          supplier,
          error: error.serverMessage ?? Object.values(error.errors)[0]?.[0] ?? "Não foi possível excluir agora.",
        });
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setDeleteState(null);
        void load();
        return;
      }
      setDeleteState({ companyId: requestCompanyId, supplier, error: "Não foi possível excluir agora." });
    }
  }

  const currentResponse = loaded && loaded.companyId === activeCompanyId ? loaded.response : null;
  const items = currentResponse?.data ?? [];
  const lastPage = currentResponse?.meta.last_page ?? 1;
  const isCurrentTenant = currentResponse !== null;
  const isErrorForCurrentTenant = status === "error" && errorCompanyId === activeCompanyId;
  const isFiltered = search !== "" || statusFilter !== "all";
  const isEmptyOverall = isCurrentTenant && status === "success" && items.length === 0 && !isFiltered && page === 1;
  const isEmptySearch = isCurrentTenant && status === "success" && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={Truck}>Fornecedores</PageTitle>
          <p className="text-sm text-muted-foreground">Quem fornece materiais e serviços.</p>
        </div>
        <Button size="sm" type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Novo
        </Button>
      </div>

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
            placeholder="Buscar por nome do fornecedor"
            aria-label="Buscar por nome do fornecedor"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SUPPLIER_STATUS_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={statusFilter === item}
              onClick={() => {
                setStatusFilter(item);
                setPage(1);
              }}
              className={
                statusFilter === item
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
              }
            >
              {SUPPLIER_STATUS_FILTER_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {isErrorForCurrentTenant ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar os fornecedores agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : !isCurrentTenant || status === "loading" ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Carregando fornecedores</span>
        </div>
      ) : isEmptyOverall ? (
        <EmptyState icon={Truck} title="Nenhum fornecedor ainda" description="Cadastre os fornecedores de materiais e serviços." />
      ) : isEmptySearch ? (
        <EmptyState icon={Truck} title="Nenhum fornecedor encontrado" description="Ajuste a busca ou o filtro para ver outros fornecedores." />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} onDelete={handleDelete} />
            ))}
          </div>
          <div className="hidden lg:block">
            <SupplierTable suppliers={items} onDelete={handleDelete} />
          </div>
          <Pagination page={currentResponse?.meta.current_page ?? page} lastPage={lastPage} onChange={setPage} />
        </>
      )}

      {isCurrentTenant && status === "success" && items.length === 0 && !isFiltered ? (
        <Button size="lg" className="w-full" type="button" onClick={() => setCreateOpen(true)}>
          Cadastrar primeiro fornecedor
        </Button>
      ) : null}

      <CreateSupplierDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />

      <ConfirmActionDialog
        open={deleteState !== null && deleteState.companyId === activeCompanyId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteState(null);
          }
        }}
        title="Excluir fornecedor?"
        description={
          deleteState && deleteState.companyId === activeCompanyId && !hasLocalPurchaseOrder(deleteState.supplier.id)
            ? `Excluir o fornecedor "${deleteState.supplier.name}"? Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDelete}
      >
        {deleteState && deleteState.companyId === activeCompanyId && deleteState.error ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteState.error}
          </p>
        ) : null}
      </ConfirmActionDialog>
    </div>
  );
}
