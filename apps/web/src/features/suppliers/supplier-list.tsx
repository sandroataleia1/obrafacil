"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPhoneInput } from "@/lib/phone";
import { useSuppliers } from "./prototype/use-suppliers";
import { SupplierStatusBadge } from "./components/status-badge";
import {
  SUPPLIER_STATUS_FILTERS,
  SUPPLIER_STATUS_FILTER_LABEL,
  type Supplier,
  type SupplierStatusFilter,
} from "./types";

function matchesFilter(supplier: Supplier, filter: SupplierStatusFilter): boolean {
  if (filter === "all") return true;
  return supplier.status === filter;
}

function SupplierRow({ supplier }: { supplier: Supplier }) {
  return (
    <Link
      href={`/fornecedores/${supplier.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{supplier.name}</p>
        {supplier.contactName ? (
          <p className="truncate text-xs text-muted-foreground">{supplier.contactName}</p>
        ) : null}
        {supplier.phone ? (
          <p className="text-xs text-muted-foreground">{formatPhoneInput(supplier.phone)}</p>
        ) : null}
      </div>
      <SupplierStatusBadge status={supplier.status} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function SupplierList() {
  const { suppliers } = useSuppliers();
  const [filter, setFilter] = useState<SupplierStatusFilter>("all");

  const filtered = suppliers ? suppliers.filter((supplier) => matchesFilter(supplier, filter)) : [];

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

      <div className="flex flex-wrap gap-2">
        {SUPPLIER_STATUS_FILTERS.map((item) => (
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
            {SUPPLIER_STATUS_FILTER_LABEL[item]}
          </button>
        ))}
      </div>

      {suppliers === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={suppliers.length === 0 ? "Nenhum fornecedor ainda" : "Nenhum fornecedor neste filtro"}
          description={
            suppliers.length === 0
              ? "Cadastre os fornecedores de materiais e serviços."
              : "Ajuste o filtro para ver outros fornecedores."
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((supplier) => (
            <SupplierRow key={supplier.id} supplier={supplier} />
          ))}
        </div>
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
