"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatPhoneInput } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { CreateCustomerDialog } from "./create-customer-dialog";
import { listAllCustomers, removeCustomer } from "./prototype/customer-store";
import type { Customer } from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getCustomerCounts(customer: Customer): { budgetsCount: number; projectsCount: number } {
  const budgetsCount = listAllBudgets().filter(
    (budget) => budget.customerId === customer.id
  ).length;
  const projectsCount = listAllProjects().filter(
    (project) => project.customerId === customer.id
  ).length;
  return { budgetsCount, projectsCount };
}

interface RowActionsProps {
  customer: Customer;
  onDelete: (customer: Customer) => void;
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

function CustomerCard({ customer, onDelete }: { customer: Customer; onDelete: (customer: Customer) => void }) {
  const { budgetsCount, projectsCount } = getCustomerCounts(customer);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-semibold text-foreground">{customer.name}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="size-3.5" aria-hidden="true" />
          {formatPhoneInput(customer.phone)}
        </div>
        <p className="text-xs text-muted-foreground">
          {budgetsCount} {budgetsCount === 1 ? "orçamento" : "orçamentos"} ·{" "}
          {projectsCount} {projectsCount === 1 ? "obra" : "obras"}
        </p>
      </div>
      <RowActions customer={customer} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_160px_180px_112px] lg:items-center lg:gap-4";

function CustomerTableRow({ customer, onDelete }: { customer: Customer; onDelete: (customer: Customer) => void }) {
  const { budgetsCount, projectsCount } = getCustomerCounts(customer);

  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{customer.name}</p>
      <span className="text-sm text-muted-foreground">{formatPhoneInput(customer.phone)}</span>
      <span className="text-sm text-muted-foreground">
        {budgetsCount} {budgetsCount === 1 ? "orçamento" : "orçamentos"} · {projectsCount}{" "}
        {projectsCount === 1 ? "obra" : "obras"}
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
  customers: Customer[];
  onDelete: (customer: Customer) => void;
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
        <span>Telefone</span>
        <span>Orçamentos e obras</span>
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

export function CustomerList() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState("");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    // localStorage read after mount: server/hydration both render `null`
    // (loading) first, so there is no mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomers(listAllCustomers());
  }, []);

  function refresh() {
    setCustomers(listAllCustomers());
  }

  function handleConfirmDelete() {
    if (!deletingCustomer) return;
    const result = removeCustomer(deletingCustomer);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setDeleteError(null);
    setDeletingCustomer(null);
    refresh();
  }

  const normalizedSearch = normalize(search.trim());
  const filtered = (customers ?? []).filter(
    (customer) => normalizedSearch === "" || normalize(customer.name).includes(normalizedSearch)
  );

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobileCustomers = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopCustomers = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Pessoas e empresas para quem você trabalha.
          </p>
        </div>
        <Button size="sm" type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Novo
        </Button>
      </div>

      {customers === null || customers.length === 0 ? null : (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Buscar por nome do cliente"
            aria-label="Buscar por nome do cliente"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {customers === null ? null : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente ainda"
          description="Cadastre seu primeiro cliente para criar orçamentos e obras."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description="Ajuste a busca para ver outros clientes."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobileCustomers.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} onDelete={setDeletingCustomer} />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <CustomerTable customers={desktopCustomers} onDelete={setDeletingCustomer} />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
      )}

      <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />

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
          deletingCustomer
            ? `Excluir o cliente "${deletingCustomer.name}"? Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDelete}
      >
        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
      </ConfirmActionDialog>
    </div>
  );
}
