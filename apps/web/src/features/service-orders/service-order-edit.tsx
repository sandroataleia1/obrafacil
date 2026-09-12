"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/shared/money-field";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getCustomer } from "@/features/customers/customers-client";
import type { Customer, CustomerAddress, CustomerContact, CustomerListItem } from "@/features/customers/types";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString, decimalStringToMoneyInputValue } from "@/lib/currency";
import { isoToDatetimeLocalValue } from "@/lib/date";
import { formatCpfCnpj } from "@/lib/document";
import { useAuth } from "@/features/auth/auth-provider";
import { isDiscountWithinSubtotal } from "./money-preview";
import { getServiceOrder, updateServiceOrder } from "./service-orders-client";
import type { ServiceOrder, ServiceOrderUpdatePayload } from "./types";
import { StepCustomer } from "./wizard/step-customer";
import { StepLocation } from "./wizard/step-location";
import { CONTACT_NONE, computeCustomerAutoSelection } from "./wizard/wizard-types";

type LoadStatus = "loading" | "success" | "error" | "not_found";
type CustomerDetailStatus = "loading" | "success" | "error";

function EditSkeleton() {
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

/**
 * Header-only edit page for an existing O.S. — never touches items or
 * status (this round's explicit "no fake atomicity" rule: there is no
 * batch-transaction endpoint, so header and items are separately
 * mutated resources; item management lives entirely on the Detail page).
 * "Salvar alterações" here ONLY ever fires the header `PUT`.
 */
export function ServiceOrderEdit({ id }: { id: string }) {
  const router = useRouter();
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | undefined>(undefined);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    []
  );

  // Ordering primitive for customer-detail fetches — the same "started
  // AFTER wins, regardless of resolution order" discipline as the
  // service-orders-detail page's `orderReadSequenceRef`, scoped to
  // `getCustomer` reads instead of `getServiceOrder` reads.
  // `selectedCustomerIdRef` is updated synchronously the moment a new
  // customer is selected (never waits for a render), so a late fetch for
  // a superseded customer id is rejected even if it happens to still be
  // the "latest sequence" (it never is, in practice, since selecting a
  // new customer always fires a new fetch — but both guards are kept, one
  // for each half of the race described in bug #3).
  const customerDetailSequenceRef = useRef(0);
  const selectedCustomerIdRef = useRef<string | null>(null);

  function nextCustomerDetailContext() {
    return ++customerDetailSequenceRef.current;
  }

  /** True when a customer-detail read fired for (`myReadId`, `requestCompanyId`,
   * `customerId`) is still allowed to apply its result: no newer
   * customer-detail read has since started, the active company hasn't
   * changed, and the customer currently selected is still the one this
   * read was FOR. Every place that fetches a customer's detail must pass
   * this same check before calling `setCustomerDetail`/`setSelectedAddressId`/
   * `setSelectedContactId`/`setCustomerDetailStatus` — never a separate,
   * weaker one. */
  function isCurrentCustomerDetailRead(myReadId: number, requestCompanyId: string | undefined, customerId: string) {
    return (
      customerDetailSequenceRef.current === myReadId &&
      activeCompanyIdRef.current === requestCompanyId &&
      selectedCustomerIdRef.current === customerId
    );
  }

  // The customer/address/contact this O.S. was loaded with — used to
  // decide whether the loaded customer's LIVE address/contact lists
  // still contain the O.S.'s original selection (§ prefill rule), never
  // to build the submit payload directly.
  const originalCustomerIdRef = useRef<string | null>(null);
  const originalAddressIdRef = useRef<string | null>(null);
  const originalContactIdRef = useRef<string | null>(null);
  /** Preserved from the loaded order and sent back UNCHANGED on save —
   * there is no Company-members endpoint yet, so this is never mutated
   * and never rendered as an editable field. */
  const responsibleUserIdRef = useRef<string | null>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | CustomerListItem | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [customerDetailStatus, setCustomerDetailStatus] = useState<CustomerDetailStatus>("loading");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string>(CONTACT_NONE);
  const [addressMissingWarning, setAddressMissingWarning] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [travelFeeInput, setTravelFeeInput] = useState("");
  const [orderDiscountInput, setOrderDiscountInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  /**
   * Fetches one customer's LIVE detail (never the O.S.'s historical
   * snapshot) and applies either the "still the original customer"
   * matching rule (preserve the original address/contact if they still
   * resolve; otherwise block on address, silently fall back to "Sem
   * contato" on contact) or, for any OTHER customer, the wizard's own
   * `computeCustomerAutoSelection` (primary/only address + primary
   * active contact) — shared by the initial load and every subsequent
   * customer change so the two paths never drift from each other.
   */
  const fetchCustomerDetail = useCallback(
    async (customerId: string, isOriginalCustomer: boolean) => {
      const requestCompanyId = activeCompanyId;
      const myReadId = nextCustomerDetailContext();
      setCustomerDetailStatus("loading");
      try {
        const detail = await getCustomer(customerId);
        if (!isCurrentCustomerDetailRead(myReadId, requestCompanyId, customerId)) return;
        setSelectedCustomer(detail);
        setCustomerDetail(detail);
        if (isOriginalCustomer) {
          const addressStillValid =
            originalAddressIdRef.current !== null &&
            detail.addresses.some((address) => address.id === originalAddressIdRef.current);
          setSelectedAddressId(addressStillValid ? originalAddressIdRef.current : null);
          setAddressMissingWarning(!addressStillValid);
          const contactStillValid =
            originalContactIdRef.current !== null &&
            detail.contacts.some((contact) => contact.id === originalContactIdRef.current);
          setSelectedContactId(contactStillValid ? originalContactIdRef.current! : CONTACT_NONE);
        } else {
          const auto = computeCustomerAutoSelection(detail, null);
          setSelectedAddressId(auto.selectedAddressId);
          setSelectedContactId(auto.selectedContactId);
          setAddressMissingWarning(false);
        }
        setCustomerDetailStatus("success");
      } catch {
        if (!isCurrentCustomerDetailRead(myReadId, requestCompanyId, customerId)) return;
        setCustomerDetailStatus("error");
      }
    },
    [activeCompanyId]
  );

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");
    setOrder(null);
    setSelectedCustomer(null);
    setCustomerDetail(null);
    setCustomerDetailStatus("loading");
    setSelectedAddressId(null);
    setSelectedContactId(CONTACT_NONE);
    setAddressMissingWarning(false);
    selectedCustomerIdRef.current = null;
    setSubmitErrors({});
    setSubmitError(null);
    setScheduleError(null);
    try {
      const data = await getServiceOrder(id);
      if (requestSequence.current !== requestId || isStaleRequest(requestCompanyId)) return;
      setOrder(data);
      setLoadedCompanyId(requestCompanyId);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");

      if (data.status === "completed" || data.status === "cancelled") return;

      setTitle(data.title);
      setDescription(data.description ?? "");
      setScheduledStart(isoToDatetimeLocalValue(data.scheduled_start_at));
      setScheduledEnd(isoToDatetimeLocalValue(data.scheduled_end_at));
      setTravelFeeInput(decimalStringToMoneyInputValue(data.travel_fee));
      setOrderDiscountInput(decimalStringToMoneyInputValue(data.order_discount));
      setNotesInput(data.notes ?? "");
      responsibleUserIdRef.current = data.responsible_user_id;
      originalCustomerIdRef.current = data.customer_id;
      originalAddressIdRef.current = data.customer_address_id;
      originalContactIdRef.current = data.customer_contact_id;
      selectedCustomerIdRef.current = data.customer_id;
      void fetchCustomerDetail(data.customer_id, true);
    } catch (error) {
      if (requestSequence.current !== requestId || isStaleRequest(requestCompanyId)) return;
      setResolvedCompanyId(requestCompanyId);
      if (error instanceof ApiError && error.status === 404) {
        setStatus("not_found");
        return;
      }
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const isCurrentTenant = order !== null && loadedCompanyId === activeCompanyId;
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  function handleSelectCustomer(customer: CustomerListItem | Customer) {
    // Updated synchronously, before the fetch fires — this is what lets a
    // still-in-flight fetch for a previously-selected customer recognize
    // itself as superseded the instant a newer selection happens, even
    // before that newer fetch's own promise resolves.
    selectedCustomerIdRef.current = customer.id;
    setSelectedCustomer(customer);
    setCustomerDetail(null);
    setSelectedAddressId(null);
    setSelectedContactId(CONTACT_NONE);
    setAddressMissingWarning(false);
    void fetchCustomerDetail(customer.id, customer.id === originalCustomerIdRef.current);
  }

  /** Goes through the exact same guarded `fetchCustomerDetail` path as
   * every other customer-detail fetch — never a separately-written retry
   * with a different (weaker) staleness check. */
  function retryCustomerDetail() {
    if (!selectedCustomer) return;
    void fetchCustomerDetail(selectedCustomer.id, selectedCustomer.id === originalCustomerIdRef.current);
  }

  function handleAddressCreated(address: CustomerAddress) {
    if (isStaleRequest(activeCompanyId)) return;
    setCustomerDetail((current) => (current ? { ...current, addresses: [...current.addresses, address] } : current));
    setSelectedAddressId(address.id);
    setAddressMissingWarning(false);
  }

  function handleContactCreated(contact: CustomerContact) {
    if (isStaleRequest(activeCompanyId)) return;
    setCustomerDetail((current) => (current ? { ...current, contacts: [...current.contacts, contact] } : current));
    setSelectedContactId(contact.id);
  }

  function validateSchedule(): boolean {
    if (scheduledEnd && !scheduledStart) {
      setScheduleError("Informe o início previsto antes do fim previsto.");
      return false;
    }
    if (scheduledStart && scheduledEnd) {
      const start = new Date(scheduledStart);
      const end = new Date(scheduledEnd);
      if (end.getTime() < start.getTime()) {
        setScheduleError("O fim previsto deve ser igual ou posterior ao início previsto.");
        return false;
      }
    }
    setScheduleError(null);
    return true;
  }

  /** Re-GETs the order after a 409 on the PUT — if it's now terminal,
   * the component's own render logic switches to the readonly block on
   * the very next render, since that check reads `order.status`
   * directly. Never automatically retries the PUT itself. */
  async function refetchAfterConflict() {
    const requestCompanyId = activeCompanyId;
    try {
      const data = await getServiceOrder(id);
      if (isStaleRequest(requestCompanyId)) return;
      setOrder(data);
    } catch {
      // The conflict message already surfaced; a failed refresh here is secondary.
    }
  }

  /**
   * Full-scratch revalidation right before the actual PUT — never trusts
   * that reaching this point means every field is still valid (mirrors
   * the wizard's own submit-time discipline). `order_discount` is
   * checked against `order.subtotal` as loaded from the server — items
   * are NOT touched by this PUT, so there is no locally-recomputed
   * subtotal to validate against here.
   */
  async function handleSubmit() {
    if (!order) return;
    if (!selectedCustomer) {
      setSubmitErrors({ customer_id: ["Selecione um cliente."] });
      return;
    }
    if (!selectedAddressId) {
      setSubmitErrors({ customer_address_id: ["Selecione um endereço."] });
      return;
    }
    if (title.trim() === "") {
      setSubmitErrors({ title: ["Informe um título."] });
      return;
    }
    if (!validateSchedule()) return;

    const orderDiscount = brlInputToDecimalString(orderDiscountInput) ?? "0.00";
    if (!isDiscountWithinSubtotal(orderDiscount, order.subtotal)) {
      setSubmitErrors({ order_discount: ["O desconto não pode ser maior que o subtotal."] });
      return;
    }
    const travelFee = brlInputToDecimalString(travelFeeInput) ?? "0.00";

    const requestCompanyId = activeCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrors({});

    const payload: ServiceOrderUpdatePayload = {
      customer_id: selectedCustomer.id,
      customer_address_id: selectedAddressId,
      customer_contact_id: selectedContactId === CONTACT_NONE ? null : selectedContactId,
      responsible_user_id: responsibleUserIdRef.current,
      title: title.trim(),
      description: description.trim() || null,
      scheduled_start_at: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      scheduled_end_at: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
      order_discount: orderDiscount,
      travel_fee: travelFee,
      notes: notesInput.trim() || null,
    };

    try {
      const updated = await updateServiceOrder(order.id, payload);
      if (isStaleRequest(requestCompanyId)) return;
      router.push(`/ordens-servico/${updated.id}`);
    } catch (error) {
      if (isStaleRequest(requestCompanyId)) return;
      if (error instanceof ApiValidationError) {
        setSubmitErrors(error.errors);
      } else if (error instanceof ApiError && error.status === 409) {
        setSubmitError("Esta O.S. foi alterada e não pode mais ser editada.");
        await refetchAfterConflict();
      } else {
        setSubmitError("Não foi possível salvar as alterações agora.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setSubmitting(false);
    }
  }

  if (status === "error" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4">
        <BackLink title="Editar O.S." icon={ClipboardCheck} href={`/ordens-servico/${id}`} />
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
        <BackLink title="Editar O.S." icon={ClipboardCheck} href="/ordens-servico" />
        <EmptyState icon={ClipboardCheck} title="O.S. não encontrada" description="Ela pode ter sido removida ou pertencer a outra empresa." />
      </div>
    );
  }

  if (!isCurrentTenant || status === "loading" || !order) {
    return (
      <div className="space-y-4">
        <BackLink title="Editar O.S." icon={ClipboardCheck} href="/ordens-servico" />
        <EditSkeleton />
      </div>
    );
  }

  // Terminal guard — never rendered as a mutable form, including on a
  // direct URL navigation or a refresh straight into this route, and
  // never re-checked away once a 409 refetch (`refetchAfterConflict`)
  // brings `order.status` here.
  if (order.status === "completed" || order.status === "cancelled") {
    const message =
      order.status === "completed"
        ? "Esta O.S. está concluída e não pode mais ser editada."
        : "Esta O.S. está cancelada e não pode mais ser editada.";
    return (
      <div className="space-y-4">
        <BackLink title={order.number} description="Editar O.S." icon={ClipboardCheck} href={`/ordens-servico/${order.id}`} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            {message}
          </p>
          <Link href={`/ordens-servico/${order.id}`} className="text-sm font-medium text-primary hover:underline">
            Voltar para a O.S.
          </Link>
        </div>
      </div>
    );
  }

  const errorMessages = Object.values(submitErrors).flat();
  const canSubmit = title.trim() !== "" && !submitting;

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <BackLink title={order.number} description="Editar dados da O.S." icon={ClipboardCheck} href={`/ordens-servico/${order.id}`} />

      {errorMessages.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMessages.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
      ) : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Cliente</h2>
        <p className="text-xs text-muted-foreground">
          Cliente atual: {order.customer.name}
          {order.customer.document ? ` · ${formatCpfCnpj(order.customer.document)}` : ""}
        </p>
        <StepCustomer
          selected={selectedCustomer}
          onSelect={handleSelectCustomer}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
          variant="inline"
        />
      </section>

      {selectedCustomer ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          {addressMissingWarning ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              O endereço usado originalmente não está mais disponível no cadastro. Selecione um novo endereço.
            </p>
          ) : null}
          <StepLocation
            customerId={selectedCustomer.id}
            detail={customerDetail}
            detailStatus={customerDetailStatus}
            onRetry={retryCustomerDetail}
            selectedAddressId={selectedAddressId}
            onSelectAddress={(addressId) => {
              setSelectedAddressId(addressId);
              setAddressMissingWarning(false);
            }}
            selectedContactId={selectedContactId}
            onSelectContact={setSelectedContactId}
            onAddressCreated={handleAddressCreated}
            onContactCreated={handleContactCreated}
            requestCompanyId={activeCompanyId}
            isStaleRequest={isStaleRequest}
          />
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Dados da O.S.</h2>
        <div className="space-y-1.5">
          <label htmlFor="os-edit-title" className="text-sm font-medium text-foreground">
            Título
          </label>
          <input
            id="os-edit-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {submitErrors.title?.[0] ? (
            <p role="alert" className="text-xs text-destructive">
              {submitErrors.title[0]}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="os-edit-description" className="text-sm font-medium text-foreground">
            Descrição <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="os-edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Agendamento</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="os-edit-start" className="text-sm font-medium text-foreground">
              Início previsto <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="os-edit-start"
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="os-edit-end" className="text-sm font-medium text-foreground">
              Fim previsto <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="os-edit-end"
              type="datetime-local"
              value={scheduledEnd}
              onChange={(event) => setScheduledEnd(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        {scheduleError ? (
          <p role="alert" className="text-xs text-destructive">
            {scheduleError}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Valores</h2>
        <MoneyField id="os-edit-travel-fee" label="Deslocamento" value={travelFeeInput} onChange={setTravelFeeInput} />
        <MoneyField id="os-edit-order-discount" label="Desconto" value={orderDiscountInput} onChange={setOrderDiscountInput} />
        {submitErrors.order_discount?.[0] ? (
          <p role="alert" className="text-xs text-destructive">
            {submitErrors.order_discount[0]}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <label htmlFor="os-edit-notes" className="text-sm font-medium text-foreground">
            Observações <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="os-edit-notes"
            value={notesInput}
            onChange={(event) => setNotesInput(event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <div
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card/95 p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <Button type="button" variant="outline" onClick={() => router.push(`/ordens-servico/${order.id}`)} className="flex-1 sm:flex-none">
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit} className="flex-1 sm:flex-none">
          {submitting ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
