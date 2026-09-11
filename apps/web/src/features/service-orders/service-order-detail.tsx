"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ExternalLink } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { formatCep, formatCpfCnpj, formatE164PhoneForDisplay } from "@/lib/document";
import { useAuth } from "@/features/auth/auth-provider";
import { cancelServiceOrder, completeServiceOrder, getServiceOrder, startServiceOrder } from "./service-orders-client";
import { ServiceOrderStatusBadge } from "./status-badge";
import type { ServiceOrder } from "./types";

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

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");
    setOrder(null);
    setPendingAction(null);
    setActionError(null);
    setCancelReason("");
    try {
      const data = await getServiceOrder(id);
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setOrder(data);
      setLoadedCompanyId(requestCompanyId);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (activeCompanyIdRef.current !== requestCompanyId) return;
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

  /** Re-fetches the O.S. after a 409 conflict without clearing the
   * conflict message `load()` itself would wipe (it resets actionError
   * as part of its own full-reload contract). */
  async function silentReload() {
    const requestCompanyId = activeCompanyId;
    try {
      const data = await getServiceOrder(id);
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setOrder(data);
    } catch {
      // The conflict message already surfaced; a failed refresh here is
      // secondary and never replaces it with a second, contradicting error.
    }
  }

  const isCurrentTenant = order !== null && loadedCompanyId === activeCompanyId;
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  async function handleStart() {
    if (!order) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await startServiceOrder(order.id);
      setOrder(updated);
      setPendingAction(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setActionError("Esta O.S. não pode mais ser iniciada. Os dados foram atualizados.");
        void silentReload();
      } else {
        setActionError("Não foi possível iniciar esta O.S. agora.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    if (!order) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await completeServiceOrder(order.id);
      setOrder(updated);
      setPendingAction(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setActionError("Esta O.S. não pode mais ser concluída. Os dados foram atualizados.");
        void silentReload();
      } else {
        setActionError("Não foi possível concluir esta O.S. agora.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!order || cancelReason.trim() === "") return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await cancelServiceOrder(order.id, cancelReason.trim());
      setOrder(updated);
      setPendingAction(null);
      setCancelReason("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setActionError("Esta O.S. não pode mais ser cancelada. Os dados foram atualizados.");
        void silentReload();
      } else {
        setActionError("Não foi possível cancelar esta O.S. agora.");
      }
    } finally {
      setActionLoading(false);
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
        <h2 className="pb-1 text-sm font-semibold text-foreground">Itens</h2>
        {!order.items || order.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto ou serviço nesta O.S.</p>
        ) : (
          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} × {decimalStringToBrlDisplay(item.unit_price)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-foreground">{decimalStringToBrlDisplay(item.line_total)}</p>
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
    </div>
  );
}
