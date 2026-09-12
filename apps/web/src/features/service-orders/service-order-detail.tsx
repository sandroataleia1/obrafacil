"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { CATALOG_ITEM_TYPE_LABELS } from "@/features/catalog/labels";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { formatCep, formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import { useAuth } from "@/features/auth/auth-provider";
import { AddItemDialog } from "./items/add-item-dialog";
import { EditItemDialog } from "./items/edit-item-dialog";
import {
  cancelServiceOrder,
  completeServiceOrder,
  deleteServiceOrderItem,
  getServiceOrder,
  startServiceOrder,
} from "./service-orders-client";
import { ServiceOrderStatusBadge } from "./status-badge";
import type { ServiceOrder, ServiceOrderItem } from "./types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function dateTimeDisplay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function addressLines(address: ServiceOrder["execution_address"]): string[] {
  const lines: string[] = [address.label];
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  if (streetLine) lines.push(streetLine);
  if (address.complement) lines.push(address.complement);
  const cityLine = [address.neighborhood, address.city && address.state ? `${address.city}/${address.state}` : address.city]
    .filter(Boolean)
    .join(" · ");
  if (cityLine) lines.push(cityLine);
  if (address.postal_code) lines.push(formatCep(address.postal_code));
  if (address.reference_point) lines.push(address.reference_point);
  return lines;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Carregando ordem de serviço</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}

type ActionKind = "start" | "complete" | "cancel";

/** For open/in_progress orders only — terminal (completed/cancelled)
 * orders are read-only everywhere on this page, items included. */
function isMutableStatus(status: ServiceOrder["status"]): boolean {
  return status === "open" || status === "in_progress";
}

export function ServiceOrderDetail({ id }: { id: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<"loading" | "success" | "error" | "not_found">("loading");
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | undefined>(undefined);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Item management — each of add/edit/remove is its own immediate,
  // independent action (its own request, its own dialog) per this
  // round's "no fake atomicity" rule; never batched with the header PUT.
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ServiceOrderItem | null>(null);
  const [removingItem, setRemovingItem] = useState<ServiceOrderItem | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [itemMutationInFlight, setItemMutationInFlight] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    []
  );

  // Ordering primitive shared by EVERY `ServiceOrder` GET that can reach
  // the screen (initial load, retry, and every post-mutation/status-action
  // refresh) — see module docs on `refreshOrderAfterMutation` below.
  // `orderReadSequenceRef` is incremented at FIRE time, so a read started
  // AFTER this one always carries a higher id; checking the ref's CURRENT
  // value against the id captured at fire time correctly rejects an
  // older read even if it resolves after a newer one. `currentOrderIdRef`
  // additionally guards against navigating from order X to order Y within
  // the same company — a late X response must never paint onto Y's view.
  const orderReadSequenceRef = useRef(0);
  const currentOrderIdRef = useRef(id);
  useEffect(() => {
    currentOrderIdRef.current = id;
  }, [id]);

  function nextOrderReadContext() {
    return ++orderReadSequenceRef.current;
  }

  /** True when a `ServiceOrder` read fired for (`myReadId`, `requestCompanyId`,
   * `requestOrderId`) is still allowed to paint the screen: no newer read
   * has since started, the active company hasn't changed, and the order
   * being viewed hasn't changed. This is the ONE check every GET on this
   * page must pass before calling `setOrder`/related state — never a
   * separate, weaker check. */
  function isCurrentOrderRead(myReadId: number, requestCompanyId: string | undefined, requestOrderId: string) {
    return (
      orderReadSequenceRef.current === myReadId &&
      activeCompanyIdRef.current === requestCompanyId &&
      currentOrderIdRef.current === requestOrderId
    );
  }

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    const requestOrderId = id;
    const myReadId = nextOrderReadContext();
    setStatus("loading");
    setOrder(null);
    setPendingAction(null);
    setActionError(null);
    setActionLoading(false);
    setCancelReason("");
    setAddItemOpen(false);
    setEditingItem(null);
    setRemovingItem(null);
    setItemActionError(null);
    setItemMutationInFlight(null);
    try {
      const data = await getServiceOrder(id);
      if (requestSequence.current !== requestId) return;
      if (!isCurrentOrderRead(myReadId, requestCompanyId, requestOrderId)) return;
      setOrder(data);
      setLoadedCompanyId(requestCompanyId);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (!isCurrentOrderRead(myReadId, requestCompanyId, requestOrderId)) return;
      setResolvedCompanyId(requestCompanyId);
      if (error instanceof ApiError && error.status === 404) {
        setStatus("not_found");
        return;
      }
      setStatus("error");
    }
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /**
   * Re-fetches the O.S. without clearing whatever conflict/error message
   * the caller already set (unlike `load()`, which resets `actionError`
   * as part of its own full-reload contract). This is the ONE shared
   * refresh path for every post-mutation re-GET on this page — status
   * actions (start/complete/cancel, success AND 409) AND every item
   * mutation (add/edit/remove success, or a 409 on any of them) — so
   * there is never a second, slightly-different tenant-guard or
   * ordering implementation. Item mutations never return the parent's
   * totals themselves, so this is the ONLY way the Detail page's
   * subtotal/total/updated_at ever reflect a just-added/edited/removed
   * line. Participates in the same `orderReadSequenceRef` ordering as
   * `load()` — an older refresh can never overwrite a newer one, no
   * matter which HTTP response comes back first.
   */
  async function refreshOrderAfterMutation() {
    const requestCompanyId = activeCompanyId;
    const requestOrderId = id;
    const myReadId = nextOrderReadContext();
    try {
      const data = await getServiceOrder(id);
      if (!isCurrentOrderRead(myReadId, requestCompanyId, requestOrderId)) return;
      setOrder(data);
    } catch {
      // The conflict/error message already surfaced; a failed refresh
      // here is secondary and never replaces it with a second,
      // contradicting error.
    }
  }

  const isCurrentTenant = order !== null && loadedCompanyId === activeCompanyId;
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  /** True when a status action fired for (`requestCompanyId`, `requestOrderId`)
   * — captured at the moment the button was clicked — is stale: either the
   * active company or the order currently being viewed has since changed.
   * Every state update inside `handleStart`/`handleComplete`/`handleCancel`
   * (success, 409, other error, AND `finally`) must be gated on this, so a
   * stale response never paints onto whatever is now on screen. */
  function isActionStale(requestCompanyId: string | undefined, requestOrderId: string) {
    return activeCompanyIdRef.current !== requestCompanyId || currentOrderIdRef.current !== requestOrderId;
  }

  /**
   * Status actions keep trusting the Resource returned directly by their
   * own POST (kept intentionally — several existing tests, e.g. D6/D7/D10,
   * assert the O.S. updates immediately from that response without a
   * second network round-trip, and forcing an always-refetch architecture
   * here would add a network hop for no behavioral benefit). To still get
   * the exact same ordering safety as every GET-driven paint on this page
   * (bug #2's requirement), the direct response is gated through the SAME
   * `orderReadSequenceRef`/`isCurrentOrderRead` primitive — a `nextOrderReadContext()`
   * id is captured the moment the action fires, so if a competing refresh
   * (e.g. an item-mutation refresh already in flight) resolves in between
   * and paints a newer snapshot, this action's own response is correctly
   * treated as stale and never overwrites it — never a separate, weaker check.
   * Company/order-switch staleness (bug #1) is checked independently via
   * `isActionStale` since it must also gate `actionError`/`actionLoading`/
   * `pendingAction`, which never touch `order` and so don't need the
   * read-sequence check.
   */
  async function runStatusAction(action: () => Promise<ServiceOrder>, kind: ActionKind, conflictMessage: string, otherErrorMessage: string) {
    if (!order) return;
    const requestCompanyId = activeCompanyId;
    const requestOrderId = order.id;
    const myReadId = nextOrderReadContext();
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await action();
      if (isActionStale(requestCompanyId, requestOrderId)) return;
      if (isCurrentOrderRead(myReadId, requestCompanyId, requestOrderId)) {
        setOrder(updated);
      }
      setPendingAction(null);
      if (kind === "cancel") setCancelReason("");
    } catch (error) {
      if (isActionStale(requestCompanyId, requestOrderId)) return;
      if (error instanceof ApiError && error.status === 409) {
        setActionError(conflictMessage);
        void refreshOrderAfterMutation();
      } else {
        setActionError(otherErrorMessage);
      }
    } finally {
      if (!isActionStale(requestCompanyId, requestOrderId)) setActionLoading(false);
    }
  }

  async function handleStart() {
    if (!order) return;
    await runStatusAction(
      () => startServiceOrder(order.id),
      "start",
      "Esta O.S. não pode mais ser iniciada. Os dados foram atualizados.",
      "Não foi possível iniciar esta O.S. agora."
    );
  }

  async function handleComplete() {
    if (!order) return;
    await runStatusAction(
      () => completeServiceOrder(order.id),
      "complete",
      "Esta O.S. não pode mais ser concluída. Os dados foram atualizados.",
      "Não foi possível concluir esta O.S. agora."
    );
  }

  async function handleCancel() {
    if (!order || cancelReason.trim() === "") return;
    const reason = cancelReason.trim();
    await runStatusAction(
      () => cancelServiceOrder(order.id, reason),
      "cancel",
      "Esta O.S. não pode mais ser cancelada. Os dados foram atualizados.",
      "Não foi possível cancelar esta O.S. agora."
    );
  }

  /** Shared success path for Add/Edit item dialogs — neither response
   * carries the parent's new totals, so this is the ONLY place that
   * refreshes them. */
  function handleItemMutated() {
    setItemActionError(null);
    void refreshOrderAfterMutation();
  }

  /** Shared 409 path for Add/Edit/Remove item — the message differs per
   * caller (e.g. the quick-create/catalog-survives special case), but
   * every one of them re-fetches so the order renders as terminal once
   * it actually is. */
  function handleItemConflict(message: string) {
    setItemActionError(message);
    void refreshOrderAfterMutation();
  }

  async function handleRemoveItem() {
    if (!order || !removingItem) return;
    const targetItem = removingItem;
    const requestCompanyId = activeCompanyId;
    setItemMutationInFlight(targetItem.id);
    setItemActionError(null);
    try {
      await deleteServiceOrderItem(order.id, targetItem.id);
      if (isStaleRequest(requestCompanyId)) return;
      setRemovingItem(null);
      handleItemMutated();
    } catch (error) {
      if (isStaleRequest(requestCompanyId)) return;
      setRemovingItem(null);
      if (error instanceof ApiError && error.status === 409) {
        handleItemConflict("A O.S. foi alterada por outro usuário.");
      } else if (error instanceof ApiValidationError) {
        // The item was NOT deleted server-side — never refetch as if
        // something changed (nothing did), and never auto-adjust the
        // order's discount ourselves.
        setItemActionError(
          error.errors.order_discount?.[0] ??
            "O desconto da O.S. não pode ser maior que o novo subtotal. Reduza o desconto antes de remover este item."
        );
      } else {
        setItemActionError("Não foi possível remover este item agora.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setItemMutationInFlight(null);
    }
  }

  if (status === "error" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4">
        <BackLink title="Ordem de serviço" icon={ClipboardCheck} href="/ordens-servico" />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar esta O.S. agora.
          </p>
          <Button type="button" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (status === "not_found" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4">
        <BackLink title="Ordem de serviço" icon={ClipboardCheck} href="/ordens-servico" />
        <EmptyState icon={ClipboardCheck} title="O.S. não encontrada" description="Ela pode ter sido removida ou pertencer a outra empresa." />
      </div>
    );
  }

  if (!isCurrentTenant || status === "loading" || !order) {
    return (
      <div className="space-y-4">
        <BackLink title="Ordem de serviço" icon={ClipboardCheck} href="/ordens-servico" />
        <DetailSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <BackLink title={order.number} description={order.title} icon={ClipboardCheck} href="/ordens-servico" />
        <ServiceOrderStatusBadge status={order.status} />
      </div>

      {actionError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {itemActionError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {itemActionError}
        </p>
      ) : null}

      {isMutableStatus(order.status) ? (
        <div>
          <Link
            href={`/ordens-servico/${order.id}/editar`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar dados
          </Link>
        </div>
      ) : null}

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Dados da O.S.</h2>
        <InfoRow label="Número" value={order.number} />
        <InfoRow label="Título" value={order.title} />
        {order.description ? (
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">{order.description}</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-sm font-semibold text-foreground">Cliente</h2>
          <Link
            href={`/clientes/${order.customer_id}`}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver cliente
            <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
        </div>
        <InfoRow label="Nome" value={order.customer.name} />
        {order.customer.document ? <InfoRow label="Documento" value={formatCpfCnpj(order.customer.document)} /> : null}
        {order.customer.phone ? <InfoRow label="Telefone" value={formatE164PhoneForDisplay(order.customer.phone)} /> : null}
        {order.customer.email ? <InfoRow label="E-mail" value={order.customer.email} /> : null}
      </section>

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Local da execução</h2>
        {addressLines(order.execution_address).map((line, index) => (
          <p key={index} className="text-sm text-foreground">
            {line}
          </p>
        ))}
      </section>

      {order.contact ? (
        <section className="space-y-1 rounded-xl border border-border bg-card p-4">
          <h2 className="pb-2 text-sm font-semibold text-foreground">Contato</h2>
          <InfoRow label="Nome" value={order.contact.name} />
          {order.contact.role ? <InfoRow label="Cargo" value={order.contact.role} /> : null}
          {order.contact.department ? <InfoRow label="Departamento" value={order.contact.department} /> : null}
          {order.contact.phone ? <InfoRow label="Telefone" value={formatE164PhoneForDisplay(order.contact.phone)} /> : null}
          {order.contact.whatsapp ? <InfoRow label="WhatsApp" value={formatE164PhoneForDisplay(order.contact.whatsapp)} /> : null}
          {order.contact.email ? <InfoRow label="E-mail" value={order.contact.email} /> : null}
        </section>
      ) : null}

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Agendamento</h2>
        <InfoRow label="Início previsto" value={dateTimeDisplay(order.scheduled_start_at)} />
        <InfoRow label="Fim previsto" value={dateTimeDisplay(order.scheduled_end_at)} />
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-sm font-semibold text-foreground">Itens</h2>
          {isMutableStatus(order.status) ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAddItemOpen(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              Adicionar item
            </Button>
          ) : null}
        </div>
        {!order.items || order.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto ou serviço nesta O.S.</p>
        ) : (
          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {CATALOG_ITEM_TYPE_LABELS[item.type]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} × {decimalStringToBrlDisplay(item.unit_price)}
                  </p>
                  {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{decimalStringToBrlDisplay(item.line_total)}</p>
                  {isMutableStatus(order.status) ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        disabled={itemMutationInFlight === item.id}
                        aria-label={`Editar ${item.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovingItem(item)}
                        disabled={itemMutationInFlight === item.id}
                        aria-label={`Remover ${item.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Financeiro</h2>
        <InfoRow label="Subtotal" value={decimalStringToBrlDisplay(order.subtotal) ?? "—"} />
        <InfoRow label="Desconto" value={decimalStringToBrlDisplay(order.order_discount) ?? "—"} />
        <InfoRow label="Deslocamento" value={decimalStringToBrlDisplay(order.travel_fee) ?? "—"} />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-base font-semibold text-foreground">{decimalStringToBrlDisplay(order.total)}</span>
        </div>
      </section>

      {order.notes ? (
        <section className="space-y-1 rounded-xl border border-border bg-card p-4">
          <h2 className="pb-2 text-sm font-semibold text-foreground">Observações</h2>
          <p className="text-sm text-foreground">{order.notes}</p>
        </section>
      ) : null}

      <section className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Histórico</h2>
        <InfoRow label="Criada em" value={dateTimeDisplay(order.created_at)} />
        {order.started_at ? <InfoRow label="Iniciada em" value={dateTimeDisplay(order.started_at)} /> : null}
        {order.status === "completed" && order.completed_at ? (
          <InfoRow label="Concluída em" value={dateTimeDisplay(order.completed_at)} />
        ) : null}
        {order.status === "cancelled" ? (
          <>
            <InfoRow label="Cancelada em" value={dateTimeDisplay(order.cancelled_at)} />
            {order.cancellation_reason ? (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground">Motivo</p>
                <p className="text-sm text-foreground">{order.cancellation_reason}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {order.status === "open" || order.status === "in_progress" ? (
        <div className="flex flex-wrap gap-2">
          {order.status === "open" ? (
            <Button type="button" onClick={() => void handleStart()} disabled={actionLoading}>
              Iniciar
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setPendingAction("complete")} disabled={actionLoading}>
            Concluir
          </Button>
          <Button type="button" variant="destructive" onClick={() => setPendingAction("cancel")} disabled={actionLoading}>
            Cancelar
          </Button>
        </div>
      ) : null}

      <ConfirmActionDialog
        open={pendingAction === "complete"}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Concluir esta O.S.?"
        description="Após a conclusão, ela não poderá mais ser editada."
        confirmLabel="Concluir"
        disabled={actionLoading}
        onConfirm={() => void handleComplete()}
      />

      <ConfirmActionDialog
        open={pendingAction === "cancel"}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
            setCancelReason("");
          }
        }}
        title="Cancelar esta O.S.?"
        description="Informe o motivo do cancelamento."
        confirmLabel="Cancelar O.S."
        destructive
        disabled={actionLoading || cancelReason.trim() === ""}
        onConfirm={() => void handleCancel()}
      >
        <div className="space-y-1.5">
          <label htmlFor="cancel-reason" className="text-sm font-medium text-foreground">
            Motivo
          </label>
          <textarea
            id="cancel-reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </ConfirmActionDialog>

      {addItemOpen ? (
        <AddItemDialog
          open={addItemOpen}
          onOpenChange={setAddItemOpen}
          orderId={order.id}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
          onAdded={handleItemMutated}
          onConflict={handleItemConflict}
        />
      ) : null}

      {editingItem ? (
        <EditItemDialog
          open={editingItem !== null}
          onOpenChange={(open) => !open && setEditingItem(null)}
          orderId={order.id}
          item={editingItem}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
          onUpdated={() => {
            setEditingItem(null);
            handleItemMutated();
          }}
          onConflict={(message) => {
            setEditingItem(null);
            handleItemConflict(message);
          }}
        />
      ) : null}

      <ConfirmActionDialog
        open={removingItem !== null}
        onOpenChange={(open) => !open && setRemovingItem(null)}
        title="Remover este item da O.S.?"
        description="O item continua disponível no catálogo — apenas esta linha é removida da O.S."
        confirmLabel="Remover"
        destructive
        disabled={removingItem !== null && itemMutationInFlight === removingItem.id}
        onConfirm={() => void handleRemoveItem()}
      />
    </div>
  );
}
