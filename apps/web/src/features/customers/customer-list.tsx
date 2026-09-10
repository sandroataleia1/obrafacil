"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Pencil, Phone, Plus, Search, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ApiError } from "@/lib/api-client";
import { formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { deleteCustomer, listCustomers } from "./customers-client";
import type { CustomerListItem, CustomerPaginationResponse } from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

type LoadStatus = "loading" | "success" | "error";

/** §12 transitional guard: Budget/Project are still localStorage prototypes
 * and the backend has no knowledge of them, so this check stays client-side
 * until they migrate to their own backend gates. */
function getLocalLinkCounts(customerId: string): { budgetsCount: number; projectsCount: number } {
  const budgetsCount = listAllBudgets().filter((budget) => budget.customerId === customerId).length;
  const projectsCount = listAllProjects().filter((project) => project.customerId === customerId).length;
  return { budgetsCount, projectsCount };
}

function kindLabel(kind: CustomerListItem["kind"]): string {
  return kind === "company" ? "PJ" : "PF";
}

function addressSummary(customer: CustomerListItem): string | null {
  const address = customer.primary_address;
  if (!address) return null;
  const parts = [address.street, address.city, address.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : address.label;
}

interface RowActionsProps {
  customer: CustomerListItem;
  onDelete: (customer: CustomerListItem) => void;
}

function RowActions({ customer, onDelete }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/clientes/${customer.id}`}
        aria-label={`Ver ${customer.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      <Link
        href={`/clientes/${customer.id}/editar`}
        aria-label={`Editar ${customer.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => onDelete(customer)}
        aria-label={`Excluir ${customer.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function CustomerCard({ customer, onDelete }: { customer: CustomerListItem; onDelete: (customer: CustomerListItem) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{customer.name}</p>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {kindLabel(customer.kind)}
          </span>
          {!customer.active ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Inativo
            </span>
          ) : null}
        </div>
        {customer.document ? (
          <p className="text-xs text-muted-foreground">{formatCpfCnpj(customer.document)}</p>
        ) : null}
        {customer.phone ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="size-3.5" aria-hidden="true" />
            {formatE164PhoneForDisplay(customer.phone)}
          </div>
        ) : null}
        {customer.primary_contact ? (
          <p className="truncate text-xs text-muted-foreground">Contato: {customer.primary_contact.name}</p>
        ) : null}
        {addressSummary(customer) ? (
          <p className="truncate text-xs text-muted-foreground">{addressSummary(customer)}</p>
        ) : null}
      </div>
      <RowActions customer={customer} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_100px_160px_160px_112px] lg:items-center lg:gap-4";

function CustomerTableRow({ customer, onDelete }: { customer: CustomerListItem; onDelete: (customer: CustomerListItem) => void }) {
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{customer.name}</p>
          {!customer.active ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Inativo
            </span>
          ) : null}
        </div>
        {customer.document ? (
          <p className="truncate text-xs text-muted-foreground">{formatCpfCnpj(customer.document)}</p>
        ) : null}
      </div>
      <span className="text-sm text-muted-foreground">{kindLabel(customer.kind)}</span>
      <span className="text-sm text-muted-foreground">
        {customer.phone ? formatE164PhoneForDisplay(customer.phone) : "—"}
      </span>
      <span className="truncate text-sm text-muted-foreground">
        {customer.primary_contact?.name ?? "—"}
      </span>
      <div className="justify-self-end">
        <RowActions customer={customer} onDelete={onDelete} />
      </div>
    </div>
  );
}

function CustomerTable({
  customers,
  onDelete,
}: {
  customers: CustomerListItem[];
  onDelete: (customer: CustomerListItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Cliente</span>
        <span>Tipo</span>
        <span>Telefone</span>
        <span>Contato</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {customers.map((customer) => (
          <CustomerTableRow key={customer.id} customer={customer} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function Pagination({
  page,
  lastPage,
  onChange,
}: {
  page: number;
  lastPage: number;
  onChange: (page: number) => void;
}) {
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

function ListSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">Carregando clientes</span>
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

export function CustomerList() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [response, setResponse] = useState<CustomerPaginationResponse | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deletingCustomer, setDeletingCustomer] = useState<CustomerListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // §64: guards against a slower earlier request ("jo") overwriting a
  // faster later one ("joao") — only the most recently *issued* request's
  // response is ever applied.
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setStatus("loading");
    try {
      const result = await listCustomers({ search: search || undefined, page, perPage: PER_PAGE });
      if (requestSequence.current !== requestId) return;
      setResponse(result);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (error instanceof ApiError && error.status === 401) {
        void auth.refresh();
        return;
      }
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function handleDeleteRequest(customer: CustomerListItem) {
    setDeleteError(null);
    setDeletingCustomer(customer);
  }

  async function handleConfirmDelete() {
    if (!deletingCustomer) return;

    const { budgetsCount, projectsCount } = getLocalLinkCounts(deletingCustomer.id);
    if (budgetsCount > 0 || projectsCount > 0) {
      setDeleteError("Este cliente possui orçamentos ou obras vinculados e não pode ser excluído.");
      return;
    }

    setDeleting(true);
    try {
      await deleteCustomer(deletingCustomer.id);
      setDeletingCustomer(null);
      setDeleteError(null);
      void load();
    } catch {
      setDeleteError("Não foi possível excluir este cliente agora.");
    } finally {
      setDeleting(false);
    }
  }

  const items = response?.data ?? [];
  const lastPage = response?.meta.last_page ?? 1;
  const isEmptyOverall = status === "success" && items.length === 0 && search === "" && page === 1;
  const isEmptySearch = status === "success" && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={Users}>Clientes</PageTitle>
          <p className="text-sm text-muted-foreground">Pessoas e empresas para quem você trabalha.</p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/clientes/novo">
              <Plus className="size-4" aria-hidden="true" />
              Novo
            </Link>
          }
        />
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nome, documento, telefone ou contato"
          aria-label="Buscar clientes"
          className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>

      {status === "loading" && !response ? (
        <ListSkeleton />
      ) : status === "error" ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar os clientes agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : isEmptyOverall ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente ainda"
          description="Cadastre seu primeiro cliente para criar orçamentos e obras."
        />
      ) : isEmptySearch ? (
        <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Ajuste a busca para ver outros clientes." />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} onDelete={handleDeleteRequest} />
            ))}
          </div>
          <div className="hidden lg:block">
            <CustomerTable customers={items} onDelete={handleDeleteRequest} />
          </div>
          <Pagination page={response?.meta.current_page ?? page} lastPage={lastPage} onChange={setPage} />
        </>
      )}

      <ConfirmActionDialog
        open={deletingCustomer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingCustomer(null);
            setDeleteError(null);
          }
        }}
        title="Excluir cliente?"
        description={
          deletingCustomer ? `Excluir o cliente "${deletingCustomer.name}"? Esta ação não pode ser desfeita.` : undefined
        }
        confirmLabel="Excluir"
        destructive
        disabled={deleting}
        onConfirm={() => void handleConfirmDelete()}
      >
        {deleteError ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteError}
          </p>
        ) : null}
      </ConfirmActionDialog>
    </div>
  );
}
