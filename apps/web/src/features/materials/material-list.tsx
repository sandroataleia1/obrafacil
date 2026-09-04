"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { CreateMaterialDialog } from "./create-material-dialog";
import { formatMaterialUnit } from "./material-unit";
import { removeMaterial } from "./prototype/material";
import { useMaterials } from "./prototype/use-materials";
import { MaterialStatusBadge } from "./components/status-badge";
import {
  MATERIAL_STATUS_FILTERS,
  MATERIAL_STATUS_FILTER_LABEL,
  type Material,
  type MaterialStatusFilter,
} from "./types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesFilter(material: Material, filter: MaterialStatusFilter): boolean {
  if (filter === "all") return true;
  return material.status === filter;
}

interface RowActionsProps {
  material: Material;
  onDelete: (material: Material) => void;
}

function RowActions({ material, onDelete }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/materiais/${material.id}`}
        aria-label={`Ver ${material.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      <Link
        href={`/materiais/${material.id}/editar`}
        aria-label={`Editar ${material.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => onDelete(material)}
        aria-label={`Excluir ${material.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function MaterialCard({ material, onDelete }: { material: Material; onDelete: (material: Material) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{material.name}</p>
          <MaterialStatusBadge status={material.status} />
        </div>
        <p className="text-xs text-muted-foreground">{formatMaterialUnit(material.defaultUnit)}</p>
      </div>
      <RowActions material={material} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_120px_140px_112px] lg:items-center lg:gap-4";

function MaterialTableRow({ material, onDelete }: { material: Material; onDelete: (material: Material) => void }) {
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{material.name}</p>
      <span className="text-sm text-muted-foreground">{formatMaterialUnit(material.defaultUnit)}</span>
      <div>
        <MaterialStatusBadge status={material.status} />
      </div>
      <div className="justify-self-end">
        <RowActions material={material} onDelete={onDelete} />
      </div>
    </div>
  );
}

function MaterialTable({
  materials,
  onDelete,
}: {
  materials: Material[];
  onDelete: (material: Material) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Material</span>
        <span>Unidade</span>
        <span>Status</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {materials.map((material) => (
          <MaterialTableRow key={material.id} material={material} onDelete={onDelete} />
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

export function MaterialList() {
  const { materials, refresh } = useMaterials();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("all");
  const [mobilePage, setMobilePage] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  function handleDelete(material: Material) {
    const confirmed = window.confirm(
      `Excluir o material "${material.name}"? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    const result = removeMaterial(material);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    refresh();
  }

  const normalizedSearch = normalize(search.trim());
  const filtered = (materials ?? []).filter(
    (material) =>
      matchesFilter(material, statusFilter) &&
      (normalizedSearch === "" || normalize(material.name).includes(normalizedSearch))
  );

  function updateSearch(value: string) {
    setSearch(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  function updateStatusFilter(value: MaterialStatusFilter) {
    setStatusFilter(value);
    setMobilePage(0);
    setDesktopPage(0);
  }

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / MOBILE_PAGE_SIZE));
  const desktopTotalPages = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  const mobileMaterials = filtered.slice(
    mobilePage * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
  );
  const desktopMaterials = filtered.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    desktopPage * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Materiais</h1>
          <p className="text-sm text-muted-foreground">Catálogo de materiais usado nas obras.</p>
        </div>
        <Button size="sm" type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Novo
        </Button>
      </div>

      {materials === undefined || materials.length === 0 ? null : (
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
              placeholder="Buscar por nome do material"
              aria-label="Buscar por nome do material"
              className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {MATERIAL_STATUS_FILTERS.map((item) => (
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
                {MATERIAL_STATUS_FILTER_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
      )}

      {materials === undefined ? null : materials.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum material ainda"
          description="Cadastre os materiais usados nas obras."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum material encontrado"
          description="Ajuste a busca ou o filtro para ver outros materiais."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {mobileMaterials.map((material) => (
              <MaterialCard key={material.id} material={material} onDelete={handleDelete} />
            ))}
            <Pagination page={mobilePage} totalPages={mobileTotalPages} onChange={setMobilePage} />
          </div>
          <div className="hidden space-y-3 lg:block">
            <MaterialTable materials={desktopMaterials} onDelete={handleDelete} />
            <Pagination page={desktopPage} totalPages={desktopTotalPages} onChange={setDesktopPage} />
          </div>
        </>
      )}

      {materials !== undefined && materials.length === 0 ? (
        <Button size="lg" className="w-full" type="button" onClick={() => setCreateOpen(true)}>
          Cadastrar primeiro material
        </Button>
      ) : null}

      <CreateMaterialDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
  );
}
