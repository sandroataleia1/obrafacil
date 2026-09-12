"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardCheck, Eye, Plus, Search, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { SERVICE_ORDER_STATUS_FILTER_OPTIONS } from "./labels";
import { listServiceOrders } from "./service-orders-client";
import { ServiceOrderStatusBadge } from "./status-badge";
import { TravelFeeSettingsDialog } from "./travel-fee-settings-dialog";
import type { ServiceOrderListItem, ServiceOrderPaginationResponse, ServiceOrderStatus } from "./types";

const PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;

type LoadStatus = "loading" | "success" | "error";

function scheduleDisplay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function addressSummary(address: ServiceOrderListItem["execution_address"]): string {
  const parts = [address.city, address.state].filter(Boolean);
  return parts.length > 0 ? `${address.label} · ${parts.join("/")}` : address.label;
}

interface RowActionsProps {
  order: ServiceOrderListItem;
}

function RowActions({ order }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/ordens-servico/${order.id}`}
        aria-label={`Ver O.S. ${order.number}`}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ServiceOrderCard({ order }: { order: ServiceOrderListItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{order.number}</p>
          <ServiceOrderStatusBadge status={order.status} />
        </div>
        <p className="truncate text-sm text-foreground">{order.title}</p>
        <p className="truncate text-xs text-muted-foreground">{order.customer.name}</p>
        <p className="truncate text-xs text-muted-foreground">{addressSummary(order.execution_address)}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{scheduleDisplay(order.scheduled_start_at)}</span>
          <span className="font-medium text-foreground">{decimalStringToBrlDisplay(order.total)}</span>
        </div>
      </div>
      <RowActions order={order} />
    </div>
  );
}

// §Responsive table: two distinct desktop grids, never one grid squeezed
// to fit. `ServiceOrderTable` is only ever rendered at `lg:` (1024px) and
// up (the caller keeps cards below that, unchanged) — but the sidebar
// (w-64 = 256px, visible from `md:`) plus content padding leaves far less
// usable width than the raw viewport suggests, so the full 8-column
// layout only turns on at `xl:` (1280px), where there's genuinely enough
// room. From `lg:` up to just under `xl:`, a compact 6-column grid merges
// Cliente/Título/Local into one "Atendimento" column instead — never
// truncating so hard that headers or values overlap. Each tier is its own
// explicit `block`/`hidden` wrapper (not a single grid squeezed via
// competing breakpoint utilities) so there's no cascade-order ambiguity
// between the two grids at the `xl:` boundary.
const COMPACT_GRID_COLS = "grid-cols-[88px_minmax(0,1fr)_108px_88px_108px_48px] items-center gap-3";
const FULL_GRID_COLS =
  "grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)_130px_108px_88px_108px_48px] items-center gap-3";

function ServiceOrderCompactRow({ order }: { order: ServiceOrderListItem }) {
  return (
    <div className={cn("grid items-center px-4 py-3.5", COMPACT_GRID_COLS)}>
      <span className="text-sm font-medium text-foreground">{order.number}</span>
      {/* §"Atendimento" hierarchy: Cliente is the emphasized top line,
       * Título the secondary line, Local the muted detail line — matches
       * the exact hierarchy requested, never burying the customer's name
       * under the service title. */}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{order.customer.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{order.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{addressSummary(order.execution_address)}</span>
      </span>
      <span className="truncate text-sm text-muted-foreground">{scheduleDisplay(order.scheduled_start_at)}</span>
      <span className="truncate text-sm font-medium text-foreground">{decimalStringToBrlDisplay(order.total)}</span>
      <ServiceOrderStatusBadge status={order.status} />
      <div className="justify-self-end">
        <RowActions order={order} />
      </div>
    </div>
  );
}

function ServiceOrderFullRow({ order }: { order: ServiceOrderListItem }) {
  return (
    <div className={cn("grid items-center px-4 py-3.5", FULL_GRID_COLS)}>
      <span className="text-sm font-medium text-foreground">{order.number}</span>
      <span className="truncate text-sm text-muted-foreground">{order.customer.name}</span>
      <span className="truncate text-sm text-muted-foreground">{order.title}</span>
      <span className="truncate text-sm text-muted-foreground">{addressSummary(order.execution_address)}</span>
      <span className="truncate text-sm text-muted-foreground">{scheduleDisplay(order.scheduled_start_at)}</span>
      <span className="truncate text-sm font-medium text-foreground">{decimalStringToBrlDisplay(order.total)}</span>
      <ServiceOrderStatusBadge status={order.status} />
      <div className="justify-self-end">
        <RowActions order={order} />
      </div>
    </div>
  );
}

function ServiceOrderTable({ orders }: { orders: ServiceOrderListItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="block xl:hidden">
        <div
          className={cn(
            "grid border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
            COMPACT_GRID_COLS
          )}
        >
          <span>O.S.</span>
          <span>Atendimento</span>
          <span>Agendamento</span>
          <span>Total</span>
          <span>Status</span>
          <span className="justify-self-end">Ações</span>
        </div>
        <div className="divide-y divide-border">
          {orders.map((order) => (
            <ServiceOrderCompactRow key={order.id} order={order} />
          ))}
        </div>
      </div>
      <div className="hidden xl:block">
        <div
          className={cn(
            "grid border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
            FULL_GRID_COLS
          )}
        >
          <span>O.S.</span>
          <span>Cliente</span>
          <span>Serviço/Título</span>
          <span>Local</span>
          <span>Agendamento</span>
          <span>Total</span>
          <span>Status</span>
          <span className="justify-self-end">Ações</span>
        </div>
        <div className="divide-y divide-border">
          {orders.map((order) => (
            <ServiceOrderFullRow key={order.id} order={order} />
          ))}
        </div>
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
      <span className="sr-only">Carregando ordens de serviço</span>
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

interface LoadedList {
  companyId: string | undefined;
  response: ServiceOrderPaginationResponse;
}

export function ServiceOrderList() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceOrderStatus | "">("");
  const [page, setPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);
  const previousCompanyIdRef = useRef(activeCompanyId);

  // §Tenant safety: a company switch must close the global travel-fee
  // settings dialog immediately, the same way any other open dialog
  // would react to a tenant change — never leave Company A's fetched or
  // typed value visible under Company B.
  const previousCompanyIdForSettingsRef = useRef(activeCompanyId);
  useEffect(() => {
    if (previousCompanyIdForSettingsRef.current === activeCompanyId) return;
    previousCompanyIdForSettingsRef.current = activeCompanyId;
    setSettingsOpen(false);
  }, [activeCompanyId]);

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
      const result = await listServiceOrders({
        search: search || undefined,
        page: effectivePage,
        perPage: PER_PAGE,
        status: statusFilter || undefined,
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

  const currentResponse = loaded && loaded.companyId === activeCompanyId ? loaded.response : null;
  const items = currentResponse?.data ?? [];
  const lastPage = currentResponse?.meta.last_page ?? 1;
  const isCurrentTenant = currentResponse !== null;
  // §Tenant safety: an error resolved for a since-departed company must
  // never render — mirrors `ServiceOrderDetail`'s `isResolvedForCurrentTenant`
  // gate. Without this, a stale "error" status can flash for one render
  // under the new company before its own request even fires/resolves.
  const isErrorForCurrentTenant = status === "error" && errorCompanyId === activeCompanyId;
  const isFiltered = search !== "" || statusFilter !== "";
  const isEmptyOverall = isCurrentTenant && status === "success" && items.length === 0 && !isFiltered && page === 1;
  const isEmptySearch = isCurrentTenant && status === "success" && items.length === 0 && !isEmptyOverall;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <PageTitle icon={ClipboardCheck}>Ordens de serviço</PageTitle>
          <p className="text-sm text-muted-foreground">Acompanhe atendimentos e execuções para seus clientes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="size-4" aria-hidden="true" />
            Configurar deslocamento
          </Button>
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link href="/ordens-servico/nova">
                <Plus className="size-4" aria-hidden="true" />
                Nova O.S.
              </Link>
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        {/* §Toolbar: search always gets its own full-width row — it's the
         * priority action here, never squeezed to share a row with the
         * filter pills. */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por O.S., cliente, título ou endereço"
            aria-label="Buscar ordens de serviço"
            className="w-full rounded-xl border border-border bg-card py-3 pr-4 pl-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* Filter pills wrap to as many lines as needed — never a
         * horizontal scroller, which would hide options rather than just
         * take more vertical space. */}
        <div className="flex flex-wrap gap-1.5">
          {SERVICE_ORDER_STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => {
                setStatusFilter(option.value);
                setPage(1);
              }}
              aria-pressed={statusFilter === option.value}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                statusFilter === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isErrorForCurrentTenant ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar as ordens de serviço agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : !isCurrentTenant || status === "loading" ? (
        <ListSkeleton />
      ) : isEmptyOverall ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhuma O.S. ainda"
          description="Crie sua primeira ordem de serviço para organizar um atendimento."
        />
      ) : isEmptySearch ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhuma O.S. encontrada"
          description="Ajuste a busca ou os filtros para ver outras ordens de serviço."
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {items.map((order) => (
              <ServiceOrderCard key={order.id} order={order} />
            ))}
          </div>
          <div className="hidden lg:block">
            <ServiceOrderTable orders={items} />
          </div>
          <Pagination page={currentResponse?.meta.current_page ?? page} lastPage={lastPage} onChange={setPage} />
        </>
      )}

      <TravelFeeSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
