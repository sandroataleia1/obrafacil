"use client";

import { useState } from "react";
import Link from "next/link";
import { Boxes, Eye, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination as SharedPagination } from "@/features/budgets/components/pagination";
import { formatQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { getMaterial } from "@/features/materials/prototype/material-store";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import { getProject } from "@/features/projects/prototype/project-store";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { useStockPositions } from "./prototype/use-stock-positions";
import type { StockPosition } from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

interface EnrichedPosition extends StockPosition {
  materialName: string;
  unitLabel: string;
  projectName: string;
}

function enrich(position: StockPosition): EnrichedPosition | null {
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

function StockCard({ position }: { position: EnrichedPosition }) {
  return (
    <Link
      href={`/estoque/${position.projectId}/${position.materialId}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-semibold text-foreground">{position.materialName}</p>
        <p className="truncate text-xs text-muted-foreground">{position.projectName}</p>
        <div className="flex items-center gap-3 pt-1 text-xs">
          <span className="text-primary">+{formatQuantity(position.totalIn)}</span>
          <span className="text-destructive">−{formatQuantity(position.totalOut)}</span>
          <span className="font-semibold tabular-nums text-foreground">
            Saldo: {formatQuantity(position.balance)} {position.unitLabel}
          </span>
        </div>
      </div>
      <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

const TABLE_ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_100px_100px_120px_56px] lg:items-center lg:gap-4";

function StockTableRow({ position }: { position: EnrichedPosition }) {
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <span className="min-w-0 truncate text-sm font-medium text-foreground">
        {position.materialName}
      </span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{position.projectName}</span>
      <span className="text-sm text-muted-foreground">{position.unitLabel}</span>
      <span className="text-sm tabular-nums text-primary">+{formatQuantity(position.totalIn)}</span>
      <span className="text-sm tabular-nums text-destructive">−{formatQuantity(position.totalOut)}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatQuantity(position.balance)}
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
        <span>Material</span>
        <span>Obra</span>
        <span>Unidade</span>
        <span>Entradas</span>
        <span>Saídas</span>
        <span>Saldo</span>
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
  const { positions, refresh } = useStockPositions();
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [adjustOpen, setAdjustOpen] = useState(false);

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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Estoque</h1>
          <p className="text-sm text-muted-foreground">Acompanhe materiais disponíveis nas obras.</p>
        </div>
        <Button size="sm" type="button" className="shrink-0 self-start" onClick={() => setAdjustOpen(true)}>
          Ajustar estoque
        </Button>
      </div>

      {positions === undefined || enriched.length === 0 ? null : (
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
              placeholder="Buscar por material"
              aria-label="Buscar por material"
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={projectFilter === "all"}
              onClick={() => updateProjectFilter("all")}
              className={
                projectFilter === "all"
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
              }
            >
              Todas as obras
            </button>
            {projectOptions.map(([projectId, projectName]) => (
              <button
                key={projectId}
                type="button"
                aria-pressed={projectFilter === projectId}
                onClick={() => updateProjectFilter(projectId)}
                className={
                  projectFilter === projectId
                    ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
                }
              >
                {projectName}
              </button>
            ))}
          </div>
        </div>
      )}

      {positions === undefined ? null : enriched.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhuma movimentação de estoque ainda"
          description="O estoque aparece aqui assim que houver um recebimento, um consumo ou um ajuste manual registrado em alguma obra."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum material encontrado"
          description="Ajuste a busca ou o filtro para ver outros materiais."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
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
          <div className="hidden space-y-3 lg:block">
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

      <AdjustStockDialog open={adjustOpen} onOpenChange={setAdjustOpen} onAdjusted={refresh} />
    </div>
  );
}
