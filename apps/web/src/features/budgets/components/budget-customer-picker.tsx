"use client";

/**
 * §22/§38 CUSTOMER AUTOCOMPLETE for Orçamentos — mirrors
 * `features/service-orders/wizard/step-customer.tsx`'s search/sequence/
 * tenant-safety discipline (0-2 chars = zero requests, 3+ chars = ~300ms
 * debounce, a stale response is discarded via `searchSequence` +
 * `isStaleRequest`, selecting a customer closes the search into a
 * compact "Cliente selecionado" card reopened only via "Trocar
 * cliente"). Trimmed down for Budgets: no quick-create dialog (out of
 * scope for this gate — Budgets never creates a Customer inline).
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listCustomers } from "@/features/customers/customers-client";
import type { Customer, CustomerListItem } from "@/features/customers/types";
import { formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 15;
const MIN_SEARCH_LENGTH = 3;

export function BudgetCustomerPicker({
  selected,
  onSelect,
  requestCompanyId,
  isStaleRequest,
}: {
  selected: CustomerListItem | Customer | null;
  onSelect: (customer: CustomerListItem | Customer) => void;
  requestCompanyId: string | undefined;
  isStaleRequest: (requestCompanyId: string | undefined) => boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchMode, setSearchMode] = useState(selected === null);

  const searchSequence = useRef(0);
  const invalidateSearch = useCallback(() => {
    searchSequence.current += 1;
  }, []);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedIdRef = useRef(selected?.id);
  useEffect(() => {
    if (selected?.id === selectedIdRef.current) return;
    selectedIdRef.current = selected?.id;
    setSearchMode(selected === null);
  }, [selected]);

  const pickerCompanyIdRef = useRef(requestCompanyId);
  useEffect(() => {
    if (pickerCompanyIdRef.current === requestCompanyId) return;
    pickerCompanyIdRef.current = requestCompanyId;
    invalidateSearch();
    setSearchInput("");
    setSearch("");
    setResults([]);
    setLoading(false);
    setError(false);
  }, [requestCompanyId, invalidateSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function handleSearchInputChange(nextValue: string) {
    invalidateSearch();
    setSearchInput(nextValue);
    if (nextValue.trim().length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setError(false);
      setLoading(false);
      setSearch(nextValue.trim());
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightedIndex(0);
  }, [results]);

  useEffect(() => {
    if (search.length < MIN_SEARCH_LENGTH) {
      invalidateSearch();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setError(false);
      setLoading(false);
      return;
    }
    const requestId = ++searchSequence.current;
    const fireCompanyId = requestCompanyId;
    setLoading(true);
    setError(false);
    listCustomers({ search, page: 1, perPage: PER_PAGE })
      .then((response) => {
        if (searchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setResults(response.data);
      })
      .catch(() => {
        if (searchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setError(true);
      })
      .finally(() => {
        if (searchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setLoading(false);
      });
  }, [search, requestCompanyId, isStaleRequest, invalidateSearch]);

  function selectCustomer(customer: CustomerListItem | Customer) {
    invalidateSearch();
    onSelect(customer);
    setSearchInput("");
    setSearch("");
    setResults([]);
    setLoading(false);
    setError(false);
    setSearchMode(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const candidate = results[highlightedIndex] ?? results[0];
      if (candidate) selectCustomer(candidate);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      invalidateSearch();
      setSearchInput("");
      setSearch("");
      setResults([]);
      setError(false);
      return;
    }
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    }
  }

  function openSearchMode() {
    invalidateSearch();
    setSearchMode(true);
    setSearchInput("");
    setSearch("");
    setResults([]);
    setError(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  const trimmedSearch = search;

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">Cliente</span>

      {selected && !searchMode ? (
        <div className="space-y-2 rounded-xl border border-primary bg-primary/5 p-3.5">
          <p className="text-xs font-medium text-muted-foreground">Cliente selecionado</p>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {[
                  selected.document ? formatCpfCnpj(selected.document) : null,
                  selected.phone ? formatE164PhoneForDisplay(selected.phone) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={openSearchMode} className="shrink-0">
              Trocar cliente
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(event) => handleSearchInputChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar cliente por nome, documento ou telefone"
              aria-label="Buscar cliente"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="budget-customer-search-listbox"
              aria-activedescendant={results.length > 0 ? `budget-customer-option-${highlightedIndex}` : undefined}
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível buscar clientes agora.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Buscando...</p>
          ) : trimmedSearch.length >= MIN_SEARCH_LENGTH && results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado para &quot;{trimmedSearch}&quot;.</p>
          ) : results.length > 0 ? (
            <ul
              id="budget-customer-search-listbox"
              role="listbox"
              className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
            >
              {results.map((customer, index) => (
                <li key={customer.id} id={`budget-customer-option-${index}`} role="option" aria-selected={index === highlightedIndex}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex w-full flex-col items-start gap-0.5 p-3.5 text-left transition-colors hover:bg-muted/50 ${
                      index === highlightedIndex ? "bg-muted/50" : ""
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[customer.document ? formatCpfCnpj(customer.document) : null, customer.phone ? formatE164PhoneForDisplay(customer.phone) : null]
                        .filter(Boolean)
                        .join(" · ") || "Sem dados adicionais"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : trimmedSearch.length > 0 && trimmedSearch.length < MIN_SEARCH_LENGTH ? (
            <p className="text-sm text-muted-foreground">Digite pelo menos 3 caracteres para buscar.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
