"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listCustomers } from "@/features/customers/customers-client";
import type { Customer, CustomerListItem } from "@/features/customers/types";
import { formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import { QuickCustomerDialog } from "./quick-customer-dialog";

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 15;

function customerCity(customer: CustomerListItem): string | null {
  return customer.primary_address?.city ?? null;
}

export function StepCustomer({
  selected,
  onSelect,
  requestCompanyId,
  isStaleRequest,
}: {
  selected: CustomerListItem | Customer | null;
  onSelect: (customer: CustomerListItem | Customer) => void;
  /** Captured by the caller at fire time — see `ServiceOrderWizard`'s tenant-safety contract. */
  requestCompanyId: string | undefined;
  /** True once the active company no longer matches `requestCompanyId` — used to discard a late quick-create response. */
  isStaleRequest: (requestCompanyId: string | undefined) => boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const searchSequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (search === "") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setError(false);
      return;
    }
    const requestId = ++searchSequence.current;
    setLoading(true);
    setError(false);
    listCustomers({ search, page: 1, perPage: PER_PAGE })
      .then((response) => {
        // Race-guard: ignore a stale response if a newer search has since fired.
        if (searchSequence.current !== requestId) return;
        setResults(response.data);
      })
      .catch(() => {
        if (searchSequence.current !== requestId) return;
        setError(true);
      })
      .finally(() => {
        if (searchSequence.current !== requestId) return;
        setLoading(false);
      });
  }, [search]);

  function handleCreated(customer: Customer) {
    if (isStaleRequest(requestCompanyId)) return;
    onSelect(customer);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar cliente por nome, documento ou telefone"
          aria-label="Buscar cliente"
          className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
        <Plus className="size-3.5" aria-hidden="true" />
        Novo cliente
      </Button>

      {selected ? (
        <div className="rounded-xl border border-primary bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">{selected.name}</p>
          {selected.document ? <p className="text-xs text-muted-foreground">{formatCpfCnpj(selected.document)}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível buscar clientes agora.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Buscando...</p>
      ) : search !== "" && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente encontrado para &quot;{search}&quot;.</p>
      ) : results.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onSelect(customer)}
                className="flex w-full flex-col items-start gap-0.5 p-3.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-medium text-foreground">{customer.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[
                    customer.document ? formatCpfCnpj(customer.document) : null,
                    customer.phone ? formatE164PhoneForDisplay(customer.phone) : null,
                    customerCity(customer),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sem dados adicionais"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <QuickCustomerDialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen} onCreated={handleCreated} />
    </div>
  );
}
