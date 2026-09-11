"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { listCatalogItems } from "./catalog-client";
import { CATALOG_ITEM_TYPE_LABELS } from "./labels";
import type { CatalogItem, CatalogItemPaginationResponse, CatalogItemType } from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

type LoadStatus = "loading" | "success" | "error";
type TypeFilter = "" | CatalogItemType;
type StatusFilter = "active" | "inactive" | "all";

function priceDisplay(value: string | null): string {
  return decimalStringToBrlDisplay(value) ?? "—";
}

interface RowActionsProps {
  item: CatalogItem;
}

function RowActions({ item }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/catalogo/${item.id}`}
        aria-label={`Ver ${item.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
      <Link
        href={`/catalogo/${item.id}/editar`}
        aria-label={`Editar ${item.name}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ItemCard({ item }: { item: CatalogItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
          {!item.active ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Inativo
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {CATALOG_ITEM_TYPE_LABELS[item.type]}
          {item.category ? ` · ${item.category}` : ""}
        </p>
        {item.code ? <p className="text-xs text-muted-foreground">{item.code}</p> : null}
        <p className="text-xs text-muted-foreground">{item.unit}</p>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            Venda: <span className="font-medium text-foreground">{priceDisplay(item.sale_price)}</span>
          </span>
          <span className="text-muted-foreground">
            Custo: <span className="font-medium text-foreground">{priceDisplay(item.cost_price)}</span>
          </span>
        </div>
      </div>
      <RowActions item={item} />
    </div>
  );
}

const TABLE_ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_100px_140px_100px_120px_120px_90px_96px] lg:items-center lg:gap-4";

function ItemTableRow({ item }: { item: CatalogItem }) {
  return (
    <div className={cn("flex items-center px-4 py-3.5", TABLE_ROW_GRID)}>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
        {item.code ? <p className="truncate text-xs text-muted-foreground">{item.code}</p> : null}
      </div>
      <span className="text-sm text-muted-foreground">{CATALOG_ITEM_TYPE_LABELS[item.type]}</span>
      <span className="truncate text-sm text-muted-foreground">{item.category ?? "—"}</span>
      <span className="text-sm text-muted-foreground">{item.unit}</span>
      <span className="text-sm text-muted-foreground tabular-nums">{priceDisplay(item.cost_price)}</span>
      <span className="text-sm text-muted-foreground tabular-nums">{priceDisplay(item.sale_price)}</span>
      <span className="text-sm text-muted-foreground">{item.active ? "Ativo" : "Inativo"}</span>
      <div className="justify-self-end">
        <RowActions item={item} />
      </div>
    </div>
  );
}

function ItemTable({ items }: { items: CatalogItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          "border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          TABLE_ROW_GRID
        )}
      >
        <span>Item</span>
        <span>Tipo</span>
        <span>Categoria</span>
        <span>Unidade</span>
        <span>Custo base</span>
        <span>Preço de venda</span>
        <span>Status</span>
        <span className="justify-self-end">Ações</span>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <ItemTableRow key={item.id} item={item} />
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

function ListSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">Carregando produtos e serviços</span>
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-border bg-card p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface LoadedList {
  /** §16: the tenant this response actually belongs to — mirrors
   * CustomerList's tenant-fail-closed pattern exactly. */
  companyId: string | undefined;
  response: CatalogItemPaginationResponse;
}

export function CatalogList() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  // §13: default is "Ativos".
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
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

  const activeParam = statusFilter === "all" ? undefined : statusFilter === "active";

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
      const result = await listCatalogItems({
        search: search || undefined,
        page: effectivePage,
        perPage: PER_PAGE,
        type: typeFilter || undefined,
        active: activeParam,
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, typeFilter, activeParam, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const currentResponse = loaded && loaded.companyId === activeCompanyId ? loaded.response : null;

  function updateTypeFilter(value: TypeFilter) {
    setTypeFilter(value);
    setPage(1);
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  const items = currentResponse?.data ?? [];
  const lastPage = currentResponse?.meta.last_page ?? 1;
  const isCurrentTenant = currentResponse !== null;
  const isEmptyOverall =
    isCurrentTenant && status === "success" && items.length === 0 && search === "" && typeFilter === "" && statusFilter === "active" && page === 1;
  const isEmptySearch = isCurrentTenant && status === "success" && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={Tags}>Produtos e serviços</PageTitle>
          <p className="text-sm text-muted-foreground">Itens comerciais usados em orçamentos e ordens de serviço.</p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/catalogo/novo">
              <Plus className="size-4" aria-hidden="true" />
              Novo item
            </Link>
          }
        />
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nome, código, categoria ou descrição"
          aria-label="Buscar produtos e serviços"
          className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Tipo"
          value={typeFilter}
          onChange={updateTypeFilter}
          options={[
            { value: "", label: "Todos" },
            { value: "product", label: "Produtos" },
            { value: "service", label: "Serviços" },
          ]}
        />
        <SegmentedControl
          label="Status"
          value={statusFilter}
          onChange={updateStatusFilter}
          options={[
            { value: "active", label: "Ativos" },
            { value: "inactive", label: "Inativos" },
            { value: "all", label: "Todos" },
          ]}
        />
      </div>

      {status === "error" ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar os itens agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : !isCurrentTenant || status === "loading" ? (
        <ListSkeleton />
      ) : isEmptyOverall ? (
        <EmptyState
          icon={Tags}
          title="Nenhum produto ou serviço cadastrado"
          description="Cadastre os itens que sua empresa oferece aos clientes."
        />
      ) : isEmptySearch ? (
        <EmptyState icon={Tags} title="Nenhum item encontrado" description="Ajuste a busca ou os filtros para ver outros itens." />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
          <div className="hidden lg:block">
            <ItemTable items={items} />
          </div>
          <Pagination page={currentResponse?.meta.current_page ?? page} lastPage={lastPage} onChange={setPage} />
        </>
      )}
    </div>
  );
}
