"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPhoneInput } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { removeSupplier } from "./prototype/supplier-store";
import { useSuppliers } from "./prototype/use-suppliers";
import { SupplierStatusBadge } from "./components/status-badge";
import {
  SUPPLIER_STATUS_FILTERS,
  SUPPLIER_STATUS_FILTER_LABEL,
  type Supplier,
  type SupplierStatusFilter,
} from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesFilter(supplier: Supplier, filter: SupplierStatusFilter): boolean {
  if (filter === "all") return true;
  return supplier.status === filter;
}

interface RowActionsProps {
  supplier: Supplier;
  onDelete: (supplier: Supplier) => void;
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

function SupplierCard({ supplier, onDelete }: { supplier: Supplier; onDelete: (supplier: Supplier) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{supplier.name}</p>
          <SupplierStatusBadge status={supplier.status} />
        </div>
        {supplier.contactName ? (
          <p className="truncate text-xs text-muted-foreground">{supplier.contactName}</p>
        ) : null}
        {supplier.phone ? (
          <p className="text-xs text-muted-foreground">{formatPhoneInput(supplier.phone)}</p>
        ) : null}
      </div>
      <RowActions supplier={supplier} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_160px_140px_112px] lg:items-center lg:gap-4";

function SupplierTableRow({ supplier, onDelete }: { supplier: Supplier; onDelete: (supplier: Supplier) => void }) {
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{supplier.name}</p>
        {supplier.contactName ? (
          <p className="truncate text-xs text-muted-foreground">{supplier.contactName}</p>
        ) : null}
      </div>
      <span className="text-sm text-muted-foreground">
        {supplier.phone ? formatPhoneInput(supplier.phone) : "—"}
      </span>
      <div>
        <SupplierStatusBadge status={supplier.status} />
      </div>
      <div className="justify-self-end">
        <RowActions supplier={supplier} onDelete={onDelete} />
      </div>
    </div>
  );
}

function SupplierTable({
  suppliers,
  onDelete,
}: {
  suppliers: Supplier[];
  onDelete: (supplier: Supplier) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
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

export function SupplierList() {
  const { suppliers, refresh } = useSuppliers();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);

  function handleDelete(supplier: Supplier) {
    const confirmed = window.confirm(
      `Excluir o fornecedor "${supplier.name}"? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    const result = removeSupplier(supplier);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  const normalizedSearch = normalize(search.trim());
  const filtered = (suppliers ?? []).filter(
    (supplier) =>
      matchesFilter(supplier, statusFilter) &&
      (normalizedSearch === "" || normalize(supplier.name).includes(normalizedSearch))
  );

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: SupplierStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobileSuppliers = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopSuppliers = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Quem fornece materiais e serviços.</p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/fornecedores/novo">
              <Plus className="size-4" aria-hidden="true" />
              Novo
            </Link>
          }
        />
      </div>

      {suppliers === undefined || suppliers.length === 0 ? null : (
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
                onClick={() => updateStatusFilter(item)}
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
      )}

      {suppliers === undefined ? null : suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum fornecedor ainda"
          description="Cadastre os fornecedores de materiais e serviços."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum fornecedor encontrado"
          description="Ajuste a busca ou o filtro para ver outros fornecedores."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobileSuppliers.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} onDelete={handleDelete} />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <SupplierTable suppliers={desktopSuppliers} onDelete={handleDelete} />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
      )}

      {suppliers !== undefined && suppliers.length === 0 ? (
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/fornecedores/novo">Cadastrar primeiro fornecedor</Link>}
        />
      ) : null}
    </div>
  );
}
