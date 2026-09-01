"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Package, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMaterialUnit } from "./material-unit";
import { useMaterials } from "./prototype/use-materials";
import { MaterialStatusBadge } from "./components/status-badge";
import {
  MATERIAL_STATUS_FILTERS,
  MATERIAL_STATUS_FILTER_LABEL,
  type Material,
  type MaterialStatusFilter,
} from "./types";

function matchesFilter(material: Material, filter: MaterialStatusFilter): boolean {
  if (filter === "all") return true;
  return material.status === filter;
}

function MaterialRow({ material }: { material: Material }) {
  return (
    <Link
      href={`/materiais/${material.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{material.name}</p>
        <p className="text-xs text-muted-foreground">{formatMaterialUnit(material.defaultUnit)}</p>
      </div>
      <MaterialStatusBadge status={material.status} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function MaterialList() {
  const { materials } = useMaterials();
  const [filter, setFilter] = useState<MaterialStatusFilter>("all");

  const filtered = materials ? materials.filter((material) => matchesFilter(material, filter)) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Materiais</h1>
          <p className="text-sm text-muted-foreground">Catálogo de materiais usado nas obras.</p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/materiais/novo">
              <Plus className="size-4" aria-hidden="true" />
              Novo
            </Link>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {MATERIAL_STATUS_FILTERS.map((item) => (
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
            {MATERIAL_STATUS_FILTER_LABEL[item]}
          </button>
        ))}
      </div>

      {materials === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={materials.length === 0 ? "Nenhum material ainda" : "Nenhum material neste filtro"}
          description={
            materials.length === 0
              ? "Cadastre os materiais usados nas obras."
              : "Ajuste o filtro para ver outros materiais."
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((material) => (
            <MaterialRow key={material.id} material={material} />
          ))}
        </div>
      )}

      {materials !== undefined && materials.length === 0 ? (
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/materiais/novo">Cadastrar primeiro material</Link>}
        />
      ) : null}
    </div>
  );
}
