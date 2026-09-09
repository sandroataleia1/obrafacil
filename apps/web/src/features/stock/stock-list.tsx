"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Boxes, ChevronDown, Eye, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { Pagination as SharedPagination } from "@/features/budgets/components/pagination";
import { formatQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { getMaterial } from "@/features/materials/prototype/material-store";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import { getProject } from "@/features/projects/prototype/project-store";
import { useSupplyPositions } from "./prototype/use-supply-positions";
import type { StockSupplyPosition } from "./prototype/supply-metrics";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

interface EnrichedPosition extends StockSupplyPosition {
  materialName: string;
  unitLabel: string;
  projectName: string;
}

function enrich(position: StockSupplyPosition): EnrichedPosition | null {
  const material = getMaterial(position.materialId);
  const project = getProject(position.projectId);
  if (!material || !project) return null;
  return {
    ...position,
    materialName: material.name,
    unitLabel: formatMaterialUnit(material.defaultUnit),
    projectName: project.name,
  };
}

const ALL_OBRAS_LABEL = "Todas as obras";

/**
 * Searchable single-select Obra filter (Pilot-Ready "Estoque 1.1 —
 * Filtro de Obra Escalável"). Replaces the chip row, which broke down
 * visually with more than a handful of Obras. Hand-rolled instead of
 * `@base-ui/react/combobox` (already a dependency, but its multi-value/
 * chips-oriented API is disproportionate for one single-select filter
 * — mirrors the same "no Combobox primitive yet, building one is
 * disproportionate" call already made for `ProjectTeamAssignmentDialog`)
 * — a small ARIA `combobox`/`listbox` pattern, no dependency on the
 * design system for this one filter.
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

  // "Todas as obras" is always the first selectable row, then the
  // filtered Obras — kept as one flat list so arrow-key navigation
  // moves through both without a special case.
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

function RequiredValue({ required, unitLabel }: { required: number | null; unitLabel: string }) {
  if (required === null) {
    return <span className="text-muted-foreground">Não definido</span>;
  }
  return (
    <span className="tabular-nums">
      {formatQuantity(required)} {unitLabel}
    </span>
  );
}

function MissingValue({ missing, required }: { missing: number | null; required: number | null }) {
  if (required === null || missing === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className={cn("font-semibold tabular-nums", missing > 0 ? "text-destructive" : "text-foreground")}>
      {formatQuantity(missing)}
    </span>
  );
}

function StockCard({ position }: { position: EnrichedPosition }) {
  return (
    <Link
      href={`/estoque/${position.projectId}/${position.materialId}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <p className="truncate text-sm font-semibold text-foreground">{position.materialName}</p>
          <p className="truncate text-xs text-muted-foreground">{position.projectName}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Necessário: <RequiredValue required={position.required} unitLabel={position.unitLabel} />
          </span>
          <span className="text-muted-foreground">
            Estoque:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatQuantity(position.stock)} {position.unitLabel}
            </span>
          </span>
          <span className="text-muted-foreground">
            Comprado:{" "}
            <span className="font-medium tabular-nums text-foreground">{formatQuantity(position.purchased)}</span>
            {position.pendingReceipt > 0 ? (
              <span className="text-amber-700 dark:text-amber-400"> ({formatQuantity(position.pendingReceipt)} a receber)</span>
            ) : null}
          </span>
          <span className="text-muted-foreground">
            Falta comprar: <MissingValue missing={position.missingToPurchase} required={position.required} />
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

function StockTableRow({ position }: { position: EnrichedPosition }) {
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{position.materialName}</p>
        <p className="truncate text-xs text-muted-foreground">{position.projectName}</p>
      </div>
      <span className="text-sm text-muted-foreground">
        <RequiredValue required={position.required} unitLabel={position.unitLabel} />
      </span>
      <div className="text-sm">
        <span className="tabular-nums text-foreground">
          {formatQuantity(position.purchased)} {position.unitLabel}
        </span>
        {position.pendingReceipt > 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {formatQuantity(position.pendingReceipt)} a receber
          </p>
        ) : null}
      </div>
      <div className="text-sm">
        <span className="font-semibold tabular-nums text-foreground">
          {formatQuantity(position.stock)} {position.unitLabel}
        </span>
        {position.consumed > 0 ? (
          <p className="text-xs text-muted-foreground">{formatQuantity(position.consumed)} consumidos</p>
        ) : null}
      </div>
      <span className="text-sm">
        <MissingValue missing={position.missingToPurchase} required={position.required} />
      </span>
      <div className="justify-self-end">
        <Link
          href={`/estoque/${position.projectId}/${position.materialId}`}
          aria-label={`Ver estoque de ${position.materialName} em ${position.projectName}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Eye className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function StockTable({ positions }: { positions: EnrichedPosition[] }) {
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
          <StockTableRow key={`${position.projectId}::${position.materialId}`} position={position} />
        ))}
      </div>
    </div>
  );
}

const PAGE_SIZE = 15;

export function StockList() {
  const { positions } = useSupplyPositions();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const enriched = (positions ?? [])
    .map(enrich)
    .filter((position): position is EnrichedPosition => position !== null);

  const projectOptions = Array.from(
    new Map(enriched.map((position) => [position.projectId, position.projectName])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

  const normalizedSearch = normalize(search.trim());
  const filtered = enriched.filter((position) => {
    if (projectFilter !== "all" && position.projectId !== projectFilter) return false;
    if (normalizedSearch === "") return true;
    return normalize(position.materialName).includes(normalizedSearch);
  });

  function updateSearch(value: string) {
    setSearch(value);
    setPage(0);
  }

  function updateProjectFilter(value: string) {
    setProjectFilter(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(activePage * PAGE_SIZE, activePage * PAGE_SIZE + PAGE_SIZE);

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
            <Link
              href={
                projectFilter === "all"
                  ? "/estoque/ajustar"
                  : `/estoque/ajustar?projectId=${projectFilter}`
              }
            >
              Ajustar estoque
            </Link>
          }
        />
      </div>

      {positions === undefined || enriched.length === 0 ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Buscar por material"
              aria-label="Buscar por material"
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <ObraFilterCombobox
            options={projectOptions.map(([id, name]) => ({ id, name }))}
            value={projectFilter}
            onChange={updateProjectFilter}
          />
        </div>
      )}

      {positions === undefined ? null : enriched.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum material a acompanhar ainda"
          description="Materiais aparecem aqui assim que houver uma necessidade planejada, uma compra, um recebimento, um consumo ou um ajuste manual em alguma obra."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum material encontrado"
          description="Ajuste a busca ou o filtro para ver outros materiais."
        />
      ) : (
        <>
          <div className="space-y-3 xl:hidden">
            {visible.map((position) => (
              <StockCard key={`${position.projectId}::${position.materialId}`} position={position} />
            ))}
            <SharedPagination
              page={activePage}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
              siblingCount={0}
              itemLabel="materiais"
              ariaLabel="Paginação de estoque"
              showSinglePageSummary
            />
          </div>
          <div className="hidden space-y-3 xl:block">
            <StockTable positions={visible} />
            <SharedPagination
              page={activePage}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
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
