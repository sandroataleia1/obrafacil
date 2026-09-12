"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listCustomers } from "@/features/customers/customers-client";
import type { Customer, CustomerListItem } from "@/features/customers/types";
import { formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import { QuickCustomerDialog } from "./quick-customer-dialog";

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 15;
/** No search fires below this many trimmed characters — matches the
 * catalog search's own minimum (`step-items.tsx`) so both autocompletes
 * behave the same way. */
const MIN_SEARCH_LENGTH = 3;

function customerCity(customer: CustomerListItem): string | null {
  return customer.primary_address?.city ?? null;
}

export function StepCustomer({
  selected,
  onSelect,
  requestCompanyId,
  isStaleRequest,
  variant = "wizard",
}: {
  selected: CustomerListItem | Customer | null;
  onSelect: (customer: CustomerListItem | Customer) => void;
  /** Captured by the caller at fire time — see `ServiceOrderWizard`'s tenant-safety contract. */
  requestCompanyId: string | undefined;
  /** True once the active company no longer matches `requestCompanyId` — used to discard a late quick-create response. */
  isStaleRequest: (requestCompanyId: string | undefined) => boolean;
  /**
   * "wizard" (default) is the Nova O.S. step-1 UX: search closes into a
   * compact "Cliente selecionado" card the instant a customer is picked,
   * reopened only via "Trocar cliente". "inline" reproduces this
   * component's PRE-existing behavior exactly — used by
   * `service-order-edit.tsx`'s "Cliente" section, whose own tests (e.g.
   * CDO5/CDO6) rely on the search list staying open and re-selectable
   * (clicking a second result right after the first, to exercise
   * superseded-selection ordering) — the search UI and card can coexist,
   * and selecting never clears/closes anything locally.
   */
  variant?: "wizard" | "inline";
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // Search mode starts open whenever there's no customer selected yet.
  // Selecting one closes it; "Trocar cliente" reopens it WITHOUT clearing
  // `selected` — the currently-selected customer is only ever replaced
  // once a new one is actually chosen from the reopened search below.
  const [searchMode, setSearchMode] = useState(selected === null);

  const searchSequence = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // A customer becoming selected (id change, including from none) closes
  // search mode — this is the ONLY place selection is allowed to close
  // it; clicking "Trocar cliente" alone must never do so.
  const selectedIdRef = useRef(selected?.id);
  useEffect(() => {
    if (variant !== "wizard") return;
    if (selected?.id === selectedIdRef.current) return;
    selectedIdRef.current = selected?.id;
    setSearchMode(selected === null);
  }, [selected, variant]);

  // §Tenant safety: this component can stay mounted across a company
  // switch (the user sitting on step 1) — a full reset, not just the
  // wizard's own state, is required so Company A's search results/error
  // never remain visible under Company B.
  const stepCustomerCompanyIdRef = useRef(requestCompanyId);
  useEffect(() => {
    if (stepCustomerCompanyIdRef.current === requestCompanyId) return;
    stepCustomerCompanyIdRef.current = requestCompanyId;
    setSearchInput("");
    setSearch("");
    setResults([]);
    setLoading(false);
    setError(false);
    setQuickCreateOpen(false);
  }, [requestCompanyId]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightedIndex(0);
  }, [results]);

  useEffect(() => {
    if (search.length < MIN_SEARCH_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setError(false);
      setLoading(false);
      return;
    }
    const requestId = ++searchSequence.current;
    // Captured at fire time, alongside the sequence number — a response
    // is only ever accepted when BOTH still match at settle time.
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
  }, [search, requestCompanyId, isStaleRequest]);

  function handleCreated(customer: Customer) {
    if (isStaleRequest(requestCompanyId)) return;
    onSelect(customer);
  }

  /** Shared by a mouse click on a result and Enter on the search input —
   * both must close the autocomplete identically (wizard variant only —
   * "inline" never clears/closes, matching its pre-existing behavior). */
  function selectCustomer(customer: CustomerListItem | Customer) {
    onSelect(customer);
    if (variant !== "wizard") return;
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
    setSearchMode(true);
    // A clean slate to search from — never re-show a previous customer's
    // stale search text/results under a new search.
    setSearchInput("");
    setSearch("");
    setResults([]);
    setError(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  const trimmedSearch = search;
  const searchVisible = variant === "inline" || searchMode;

  return (
    <div className="space-y-4">
      {variant === "inline" ? (
        selected ? (
          <div className="rounded-xl border border-primary bg-primary/5 p-4">
            <p className="text-sm font-semibold text-foreground">{selected.name}</p>
            {selected.document ? <p className="text-xs text-muted-foreground">{formatCpfCnpj(selected.document)}</p> : null}
          </div>
        ) : null
      ) : selected && !searchMode ? (
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
      ) : null}

      {searchVisible ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar cliente por nome, documento ou telefone"
              aria-label="Buscar cliente"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="customer-search-listbox"
              aria-activedescendant={results.length > 0 ? `customer-option-${highlightedIndex}` : undefined}
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateOpen(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            Novo cliente
          </Button>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível buscar clientes agora.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Buscando...</p>
          ) : trimmedSearch.length >= MIN_SEARCH_LENGTH && results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado para &quot;{trimmedSearch}&quot;.</p>
          ) : results.length > 0 ? (
            <ul id="customer-search-listbox" role="listbox" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {results.map((customer, index) => (
                <li key={customer.id} id={`customer-option-${index}`} role="option" aria-selected={index === highlightedIndex}>
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
          ) : trimmedSearch.length > 0 && trimmedSearch.length < MIN_SEARCH_LENGTH ? (
            <p className="text-sm text-muted-foreground">Digite pelo menos 3 caracteres para buscar.</p>
          ) : null}
        </>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setQuickCreateOpen(true)}>
          <Plus className="size-3.5" aria-hidden="true" />
          Novo cliente
        </Button>
      )}

      {quickCreateOpen ? (
        <QuickCustomerDialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen} onCreated={handleCreated} />
      ) : null}
    </div>
  );
}
