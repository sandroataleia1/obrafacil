"use client";

/**
 * SUPPLY-FRONTEND-01D §15-19. Server-side pagination/filtering via
 * `GET /api/v1/stock/positions` replaces the old client-side
 * filter/paginate over `useSupplyPositions()` — mirrors
 * `features/purchases/purchase-order-list.tsx`'s discipline exactly.
 * The backend already computes and returns the full pair universe
 * (physical movement + Requirement + ordered Purchase + cancelled
 * physical history) — this component never reconstructs it (§18), and
 * never recalculates any metric (§19): every value rendered is read
 * directly off the `StockPosition` Resource.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Boxes, ChevronDown, Eye, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { Pagination as SharedPagination } from "@/features/budgets/components/pagination";
import { cn } from "@/lib/utils";
import { formatMaterialUnitCode } from "@/features/materials/material-unit";
import { useAllProjects } from "@/features/projects/use-all-projects";
import { formatStockQuantity } from "./stock-decimal";
import { useStockPositions } from "./use-stock-positions";
import type { StockPosition } from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const ALL_OBRAS_LABEL = "Todas as obras";

/**
 * Searchable single-select Obra filter (Pilot-Ready "Estoque 1.1 —
 * Filtro de Obra Escalável"). Options come from `useAllProjects()`
 * (real API, full Company list) — never derived from the current page
 * of positions, which would silently drop Obras not present on this
 * page.
 */
function ObraFilterCombobox({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedName = value === "all" ? null : options.find((option) => option.id === value)?.name;

  const filtered =
    query.trim() === ""
      ? options
      : options.filter((option) => normalize(option.name).includes(normalize(query)));

  const rows: { id: string; label: string }[] = [
    { id: "all", label: ALL_OBRAS_LABEL },
    ...filtered.map((option) => ({ id: option.id, label: option.name })),
  ];

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function openList() {
    setOpen(true);
    setQuery("");
    setHighlighted(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, rows.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[highlighted];
      if (row) select(row.id);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-72">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar por obra"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
      >
        <span className="truncate">{selectedName ?? ALL_OBRAS_LABEL}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-md">
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Buscar obra"
              aria-label="Buscar obra"
              role="combobox"
              aria-expanded={open}
              aria-controls="obra-filter-listbox"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <ul id="obra-filter-listbox" role="listbox" aria-label="Obras" className="max-h-64 overflow-y-auto p-1">
            {rows.map((row, index) => (
              <li key={row.id} role="option" aria-selected={row.id === value}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => select(row.id)}
                  className={cn(
                    "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm",
                    row.id === value ? "font-semibold text-primary" : "text-foreground",
                    index === highlighted ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  {row.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && query.trim() !== "" ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Nenhuma obra encontrada.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RequiredValue({ required, unitLabel }: { required: string | null; unitLabel: string }) {
  if (required === null) {
    return <span className="text-muted-foreground">Não definido</span>;
  }
  return (
    <span className="tabular-nums">
      {formatStockQuantity(required)} {unitLabel}
    </span>
  );
}

function MissingValue({ missing, required }: { missing: string | null; required: string | null }) {
  if (required === null || missing === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className={cn("font-semibold tabular-nums", Number(missing) > 0 ? "text-destructive" : "text-foreground")}>
      {formatStockQuantity(missing)}
    </span>
  );
}

function StockCard({ position }: { position: StockPosition }) {
  const unitLabel = formatMaterialUnitCode(position.material.unit_code, position.material.unit_custom_label);
  return (
    <Link
      href={`/estoque/${position.project.id}/${position.material.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <p className="truncate text-sm font-semibold text-foreground">{position.material.name}</p>
          <p className="truncate text-xs text-muted-foreground">{position.project.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Necessário: <RequiredValue required={position.required_quantity} unitLabel={unitLabel} />
          </span>
          <span className="text-muted-foreground">
            Estoque:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatStockQuantity(position.stock_quantity)} {unitLabel}
            </span>
          </span>
          <span className="text-muted-foreground">
            Comprado:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatStockQuantity(position.purchased_quantity)}
            </span>
            {Number(position.pending_receipt_quantity) > 0 ? (
              <span className="text-amber-700 dark:text-amber-400">
                {" "}
                ({formatStockQuantity(position.pending_receipt_quantity)} a receber)
              </span>
            ) : null}
          </span>
          <span className="text-muted-foreground">
            Falta comprar:{" "}
            <MissingValue missing={position.missing_to_purchase_quantity} required={position.required_quantity} />
          </span>
        </div>
      </div>
      <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

// The dense table only switches on at `xl` (1280px): at `lg` (1024px) the
// fixed-width metric columns leave too little room for Material/Obra —
// the most important cell — and it collapses to a near-unreadable
// truncation ("Ci…", "Edic…"). Below `xl`, the card layout (already
// full-width and legible at any size) is used instead.
const TABLE_ROW_GRID =
  "xl:grid xl:grid-cols-[minmax(0,1.5fr)_110px_130px_130px_100px_56px] xl:items-center xl:gap-4";

function StockTableRow({ position }: { position: StockPosition }) {
  const unitLabel = formatMaterialUnitCode(position.material.unit_code, position.material.unit_custom_label);
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{position.material.name}</p>
        <p className="truncate text-xs text-muted-foreground">{position.project.name}</p>
      </div>
      <span className="text-sm text-muted-foreground">
        <RequiredValue required={position.required_quantity} unitLabel={unitLabel} />
      </span>
      <div className="text-sm">
        <span className="tabular-nums text-foreground">
          {formatStockQuantity(position.purchased_quantity)} {unitLabel}
        </span>
        {Number(position.pending_receipt_quantity) > 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {formatStockQuantity(position.pending_receipt_quantity)} a receber
          </p>
        ) : null}
      </div>
      <div className="text-sm">
        <span className="font-semibold tabular-nums text-foreground">
          {formatStockQuantity(position.stock_quantity)} {unitLabel}
        </span>
        {Number(position.consumed_quantity) > 0 ? (
          <p className="text-xs text-muted-foreground">{formatStockQuantity(position.consumed_quantity)} consumidos</p>
        ) : null}
      </div>
      <span className="text-sm">
        <MissingValue missing={position.missing_to_purchase_quantity} required={position.required_quantity} />
      </span>
      <div className="justify-self-end">
        <Link
          href={`/estoque/${position.project.id}/${position.material.id}`}
          aria-label={`Ver estoque de ${position.material.name} em ${position.project.name}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Eye className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function StockTable({ positions }: { positions: StockPosition[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Material / Obra</span>
        <span>Necessário</span>
        <span>Comprado</span>
        <span>Estoque</span>
        <span>Falta comprar</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {positions.map((position) => (
          <StockTableRow key={`${position.project.id}::${position.material.id}`} position={position} />
        ))}
      </div>
    </div>
  );
}

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

export function StockList() {
  const { projects: allProjects } = useAllProjects();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { response, error, loading, reload } = useStockPositions({
    search: search || undefined,
    projectId: projectFilter === "all" ? undefined : projectFilter,
    page,
    perPage: PER_PAGE,
  });

  function updateProjectFilter(value: string) {
    setProjectFilter(value);
    setPage(1);
  }

  const projectOptions = (allProjects ?? [])
    .map((project) => ({ id: project.id, name: project.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const items = response?.data ?? [];
  const lastPage = response?.meta.last_page ?? 1;
  const isFiltered = search !== "" || projectFilter !== "all";
  const isEmptyOverall = response !== undefined && items.length === 0 && !isFiltered && page === 1;
  const isEmptySearch = response !== undefined && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <PageTitle icon={Boxes}>Estoque</PageTitle>
          <p className="text-sm text-muted-foreground">
            Acompanhe necessidade, compra, recebimento e saldo de materiais nas obras.
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 self-start"
          nativeButton={false}
          render={
            <Link href={projectFilter === "all" ? "/estoque/ajustar" : `/estoque/ajustar?projectId=${projectFilter}`}>
              Ajustar estoque
            </Link>
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por material"
            aria-label="Buscar por material"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <ObraFilterCombobox options={projectOptions} value={projectFilter} onChange={updateProjectFilter} />
      </div>

      {error ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar o estoque agora.
          </p>
          <Button type="button" onClick={() => reload()}>
            Tentar novamente
          </Button>
        </div>
      ) : loading || response === undefined ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Carregando estoque</span>
        </div>
      ) : isEmptyOverall ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum material a acompanhar ainda"
          description="Materiais aparecem aqui assim que houver uma necessidade planejada, uma compra, um recebimento, um consumo ou um ajuste manual em alguma obra."
        />
      ) : isEmptySearch ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum material encontrado"
          description="Ajuste a busca ou o filtro para ver outros materiais."
        />
      ) : (
        <>
          <div className="space-y-3 xl:hidden">
            {items.map((position) => (
              <StockCard key={`${position.project.id}::${position.material.id}`} position={position} />
            ))}
            <SharedPagination
              page={(response.meta.current_page ?? page) - 1}
              totalPages={lastPage}
              totalItems={response.meta.total}
              pageSize={PER_PAGE}
              onChange={(zeroBasedPage) => setPage(zeroBasedPage + 1)}
              siblingCount={0}
              itemLabel="materiais"
              ariaLabel="Paginação de estoque"
              showSinglePageSummary
            />
          </div>
          <div className="hidden space-y-3 xl:block">
            <StockTable positions={items} />
            <SharedPagination
              page={(response.meta.current_page ?? page) - 1}
              totalPages={lastPage}
              totalItems={response.meta.total}
              pageSize={PER_PAGE}
              onChange={(zeroBasedPage) => setPage(zeroBasedPage + 1)}
              itemLabel="materiais"
              ariaLabel="Paginação de estoque"
              showSinglePageSummary
            />
          </div>
        </>
      )}
    </div>
  );
}
