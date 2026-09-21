"use client";

/**
 * SUPPLY-FRONTEND-01A §20-23. Mirrors `features/projects/project-list.tsx`'s
 * tenant-safety/server-pagination/late-request discipline exactly —
 * GET /api/v1/materials is the sole source of truth, never localStorage,
 * never client-side filter()/slice() over a locally-held array.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { CreateMaterialDialog } from "./create-material-dialog";
import { deleteMaterial, listMaterials } from "./materials-client";
import { formatMaterialUnitCode } from "./material-unit";
import { hasAnyLocalMaterialDependency } from "./prototype/material-local-dependencies";
import { MaterialStatusBadge } from "./components/status-badge";
import { MATERIAL_STATUS_FILTERS, MATERIAL_STATUS_FILTER_LABEL } from "./types";
import type { MaterialListItem, MaterialPaginationResponse, MaterialStatusFilter } from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

type LoadStatus = "loading" | "success" | "error";

function statusFilterToActiveParam(filter: MaterialStatusFilter): boolean | undefined {
  if (filter === "active") return true;
  if (filter === "inactive") return false;
  return undefined;
}

interface RowActionsProps {
  material: MaterialListItem;
  onDelete: (material: MaterialListItem) => void;
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

function MaterialCard({ material, onDelete }: RowActionsProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{material.name}</p>
          <MaterialStatusBadge active={material.active} />
        </div>
        <p className="text-xs text-muted-foreground">
          {formatMaterialUnitCode(material.unit_code, material.unit_custom_label)}
        </p>
      </div>
      <RowActions material={material} onDelete={onDelete} />
    </div>
  );
}

const TABLE_ROW_GRID = "grid-cols-[minmax(0,1fr)_120px_140px_112px] items-center gap-3";

function MaterialTableRow({ material, onDelete }: RowActionsProps) {
  return (
    <div className={cn("grid items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{material.name}</p>
      <span className="text-sm text-muted-foreground">
        {formatMaterialUnitCode(material.unit_code, material.unit_custom_label)}
      </span>
      <div>
        <MaterialStatusBadge active={material.active} />
      </div>
      <div className="justify-self-end">
        <RowActions material={material} onDelete={onDelete} />
      </div>
    </div>
  );
}

function MaterialTable({ materials, onDelete }: { materials: MaterialListItem[]; onDelete: (material: MaterialListItem) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "grid border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
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

function Pagination({ page, lastPage, onChange }: { page: number; lastPage: number; onChange: (page: number) => void }) {
  if (lastPage <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Página {page} de {lastPage}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange(page + 1)} disabled={page >= lastPage}>
        Próxima
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

interface LoadedList {
  companyId: string | undefined;
  response: MaterialPaginationResponse;
}

export function MaterialList() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingMaterial, setDeletingMaterial] = useState<MaterialListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);
  const previousCompanyIdRef = useRef(activeCompanyId);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const isCompanySwitch = previousCompanyIdRef.current !== activeCompanyId;
    previousCompanyIdRef.current = activeCompanyId;
    const effectivePage = isCompanySwitch ? 1 : page;
    if (isCompanySwitch) {
      setPage(1);
    }

    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");
    try {
      const result = await listMaterials({
        search: search || undefined,
        page: effectivePage,
        perPage: PER_PAGE,
        active: statusFilterToActiveParam(statusFilter),
      });
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setLoaded({ companyId: requestCompanyId, response: result });
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      if (error instanceof ApiError && error.status === 401) {
        void auth.refresh();
        return;
      }
      setStatus("error");
      setErrorCompanyId(requestCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, statusFilter, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function handleDelete(material: MaterialListItem) {
    if (hasAnyLocalMaterialDependency(material.id)) {
      setDeleteError(
        "Este material possui registros locais vinculados e não pode ser excluído enquanto esses módulos ainda não foram migrados."
      );
      setDeletingMaterial(material);
      return;
    }
    setDeleteError(null);
    setDeletingMaterial(material);
  }

  async function handleConfirmDelete() {
    if (!deletingMaterial) return;
    if (hasAnyLocalMaterialDependency(deletingMaterial.id)) return;
    try {
      await deleteMaterial(deletingMaterial.id);
      setDeletingMaterial(null);
      setDeleteError(null);
      void load();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setDeleteError(error.serverMessage ?? Object.values(error.errors)[0]?.[0] ?? "Não foi possível excluir agora.");
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setDeletingMaterial(null);
        setDeleteError(null);
        void load();
        return;
      }
      setDeleteError("Não foi possível excluir agora.");
    }
  }

  const currentResponse = loaded && loaded.companyId === activeCompanyId ? loaded.response : null;
  const items = currentResponse?.data ?? [];
  const lastPage = currentResponse?.meta.last_page ?? 1;
  const isCurrentTenant = currentResponse !== null;
  const isErrorForCurrentTenant = status === "error" && errorCompanyId === activeCompanyId;
  const isFiltered = search !== "" || statusFilter !== "all";
  const isEmptyOverall = isCurrentTenant && status === "success" && items.length === 0 && !isFiltered && page === 1;
  const isEmptySearch = isCurrentTenant && status === "success" && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={Package}>Materiais</PageTitle>
          <p className="text-sm text-muted-foreground">Catálogo de materiais usado nas obras.</p>
        </div>
        <Button size="sm" type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Novo
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nome do material"
            aria-label="Buscar por nome do material"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MATERIAL_STATUS_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={statusFilter === item}
              onClick={() => {
                setStatusFilter(item);
                setPage(1);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                statusFilter === item
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {MATERIAL_STATUS_FILTER_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {isErrorForCurrentTenant ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar os materiais agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : !isCurrentTenant || status === "loading" ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Carregando materiais</span>
        </div>
      ) : isEmptyOverall ? (
        <EmptyState icon={Package} title="Nenhum material ainda" description="Cadastre os materiais usados nas obras." />
      ) : isEmptySearch ? (
        <EmptyState icon={Package} title="Nenhum material encontrado" description="Ajuste a busca ou o filtro para ver outros materiais." />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((material) => (
              <MaterialCard key={material.id} material={material} onDelete={handleDelete} />
            ))}
          </div>
          <div className="hidden lg:block">
            <MaterialTable materials={items} onDelete={handleDelete} />
          </div>
          <Pagination page={currentResponse?.meta.current_page ?? page} lastPage={lastPage} onChange={setPage} />
        </>
      )}

      {isCurrentTenant && status === "success" && items.length === 0 && !isFiltered ? (
        <Button size="lg" className="w-full" type="button" onClick={() => setCreateOpen(true)}>
          Cadastrar primeiro material
        </Button>
      ) : null}

      <CreateMaterialDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />

      <ConfirmActionDialog
        open={deletingMaterial !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingMaterial(null);
            setDeleteError(null);
          }
        }}
        title="Excluir material?"
        description={
          deletingMaterial && !hasAnyLocalMaterialDependency(deletingMaterial.id)
            ? `Excluir o material "${deletingMaterial.name}"? Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={handleConfirmDelete}
      >
        {deleteError ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteError}
          </p>
        ) : null}
      </ConfirmActionDialog>
    </div>
  );
}
