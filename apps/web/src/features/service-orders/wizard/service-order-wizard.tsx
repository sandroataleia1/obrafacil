"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { useAuth } from "@/features/auth/auth-provider";
import { getCustomer } from "@/features/customers/customers-client";
import type { Customer, CustomerAddress, CustomerContact, CustomerListItem } from "@/features/customers/types";
import { ApiValidationError } from "@/lib/api-client";
import { brlInputToDecimalString } from "@/lib/currency";
import { quantityInputToDecimalString } from "@/lib/quantity";
import { computeOrderPreview, isDiscountWithinSubtotal } from "../money-preview";
import { createServiceOrder, getServiceOrderSettings } from "../service-orders-client";
import type { ServiceOrderCreatePayload } from "../types";
import { StepCustomer } from "./step-customer";
import { StepLocation } from "./step-location";
import { allItemsValid, StepItems } from "./step-items";
import { StepSchedule } from "./step-schedule";
import { CONTACT_NONE, emptyWizardState, findAddress, findContact, type WizardState } from "./wizard-types";

const STEP_TITLES = ["Cliente", "Local e contato", "Produtos e serviços", "Agendamento e resumo"];

function Stepper({ currentStep, maxReachedStep, onJump }: { currentStep: number; maxReachedStep: number; onJump: (step: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground sm:hidden">
        Etapa {currentStep} de 4 — {STEP_TITLES[currentStep - 1]}
      </p>
      <ol className="hidden items-center gap-2 sm:flex" aria-label="Etapas">
        {STEP_TITLES.map((label, index) => {
          const step = index + 1;
          const reachable = step <= maxReachedStep;
          const active = step === currentStep;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(step)}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : reachable
                      ? "border-border bg-card text-foreground hover:bg-muted"
                      : "border-border bg-muted/40 text-muted-foreground"
                }`}
              >
                <span className="flex size-4 items-center justify-center rounded-full bg-current/10 text-[10px]">{step}</span>
                {label}
              </button>
              {step < STEP_TITLES.length ? <span className="h-px w-4 bg-border" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ServiceOrderWizard() {
  const router = useRouter();
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [state, setState] = useState<WizardState>(emptyWizardState);
  const [maxReachedStep, setMaxReachedStep] = useState(1);
  const [customerDetailStatus, setCustomerDetailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [confirmZeroItemsOpen, setConfirmZeroItemsOpen] = useState(false);

  const [travelFeeSettingsStatus, setTravelFeeSettingsStatus] = useState<"loading" | "success" | "error">("loading");
  const [travelFeeTouched, setTravelFeeTouched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [companySwitchNotice, setCompanySwitchNotice] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // §Tenant safety: the tenant this wizard instance was opened for. Any
  // change from this value — at any point, mid-any-step — wipes every
  // piece of wizard state back to step 1, never carrying a UUID from the
  // old tenant forward.
  const wizardCompanyIdRef = useRef(activeCompanyId);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  useEffect(() => {
    if (wizardCompanyIdRef.current === activeCompanyId) return;
    wizardCompanyIdRef.current = activeCompanyId;
    setState(emptyWizardState());
    setMaxReachedStep(1);
    setCustomerDetailStatus("idle");
    setConfirmZeroItemsOpen(false);
    setSubmitErrors({});
    setSubmitError(null);
    setScheduleError(null);
    setTravelFeeTouched(false);
  }, [activeCompanyId]);

  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    []
  );

  // Settings fetched once when the wizard mounts, tagged with the tenant
  // it was requested for — a late response after a tenant switch is
  // discarded rather than prefilling the new tenant's travel fee with the
  // old tenant's default.
  useEffect(() => {
    const requestCompanyId = activeCompanyId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTravelFeeSettingsStatus("loading");
    getServiceOrderSettings()
      .then((settings) => {
        if (isStaleRequest(requestCompanyId)) return;
        setTravelFeeSettingsStatus("success");
        setState((current) => (travelFeeTouched ? current : { ...current, travelFeeInput: settings.default_travel_fee.replace(".", ",") }));
      })
      .catch(() => {
        if (isStaleRequest(requestCompanyId)) return;
        setTravelFeeSettingsStatus("error");
      });
    // Intentionally re-runs only when the tenant changes, mirroring the
    // reset effect above — `travelFeeTouched`/`isStaleRequest` are stable
    // enough not to need re-triggering the network call itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  function retryTravelFeeSettings() {
    const requestCompanyId = activeCompanyId;
    setTravelFeeSettingsStatus("loading");
    getServiceOrderSettings()
      .then((settings) => {
        if (isStaleRequest(requestCompanyId)) return;
        setTravelFeeSettingsStatus("success");
        setState((current) => (travelFeeTouched ? current : { ...current, travelFeeInput: settings.default_travel_fee.replace(".", ",") }));
      })
      .catch(() => {
        if (isStaleRequest(requestCompanyId)) return;
        setTravelFeeSettingsStatus("error");
      });
  }

  // Fetch full customer detail (addresses/contacts) whenever a customer
  // becomes selected — never rely on the abbreviated list-resource shape.
  const selectedCustomerId = state.selectedCustomer?.id;
  useEffect(() => {
    if (!selectedCustomerId) return;
    const requestCompanyId = activeCompanyId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomerDetailStatus("loading");
    getCustomer(selectedCustomerId)
      .then((detail) => {
        if (isStaleRequest(requestCompanyId)) return;
        setState((current) => {
          if (current.selectedCustomer?.id !== selectedCustomerId) return current;
          const primaryAddress = detail.addresses.find((address) => address.is_primary) ?? null;
          const autoAddress =
            current.selectedAddressId && detail.addresses.some((address) => address.id === current.selectedAddressId)
              ? current.selectedAddressId
              : primaryAddress?.id ?? (detail.addresses.length === 1 ? detail.addresses[0]!.id : null);
          const primaryContact = detail.contacts.find((contact) => contact.is_primary && contact.active) ?? null;
          return {
            ...current,
            customerDetail: detail,
            selectedAddressId: autoAddress,
            selectedContactId: primaryContact ? primaryContact.id : CONTACT_NONE,
          };
        });
        setCustomerDetailStatus("success");
      })
      .catch(() => {
        if (isStaleRequest(requestCompanyId)) return;
        setCustomerDetailStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId, activeCompanyId]);

  const preview = useMemo(() => {
    const items = state.items
      .map((item) => {
        const quantity = quantityInputToDecimalString(item.quantityInput);
        const unitPrice = brlInputToDecimalString(item.unitPriceInput);
        if (quantity === null || unitPrice === null) return null;
        return { quantity, unitPrice, lineDiscount: brlInputToDecimalString(item.lineDiscountInput) ?? "0.00" };
      })
      .filter((item): item is { quantity: string; unitPrice: string; lineDiscount: string } => item !== null);
    return computeOrderPreview({
      items,
      orderDiscount: brlInputToDecimalString(state.orderDiscountInput) ?? "0.00",
      travelFee: brlInputToDecimalString(state.travelFeeInput) ?? "0.00",
    });
  }, [state.items, state.orderDiscountInput, state.travelFeeInput]);

  function goToStep(step: 1 | 2 | 3 | 4) {
    setSubmitErrors({});
    setSubmitError(null);
    setState((current) => ({ ...current, step }));
    setMaxReachedStep((current) => Math.max(current, step));
  }

  function handleSelectCustomer(customer: CustomerListItem | Customer) {
    setState((current) => ({
      ...current,
      selectedCustomer: customer,
      customerDetail: null,
      selectedAddressId: null,
      selectedContactId: CONTACT_NONE,
    }));
  }

  function retryCustomerDetail() {
    if (!selectedCustomerId) return;
    const requestCompanyId = activeCompanyId;
    setCustomerDetailStatus("loading");
    getCustomer(selectedCustomerId)
      .then((detail) => {
        if (isStaleRequest(requestCompanyId)) return;
        setState((current) => ({ ...current, customerDetail: detail }));
        setCustomerDetailStatus("success");
      })
      .catch(() => {
        if (isStaleRequest(requestCompanyId)) return;
        setCustomerDetailStatus("error");
      });
  }

  function handleAddressCreated(address: CustomerAddress) {
    setState((current) =>
      current.customerDetail
        ? { ...current, customerDetail: { ...current.customerDetail, addresses: [...current.customerDetail.addresses, address] }, selectedAddressId: address.id }
        : current
    );
  }

  function handleContactCreated(contact: CustomerContact) {
    setState((current) =>
      current.customerDetail
        ? { ...current, customerDetail: { ...current.customerDetail, contacts: [...current.customerDetail.contacts, contact] }, selectedContactId: contact.id }
        : current
    );
  }

  function handleAdvanceFromItems() {
    if (state.items.length === 0) {
      setConfirmZeroItemsOpen(true);
      return;
    }
    proceedToSchedule();
  }

  function proceedToSchedule() {
    setState((current) => {
      const nextTitle =
        current.title.trim() !== ""
          ? current.title
          : current.items.length > 0
            ? current.items[0]!.name
            : `Atendimento - ${current.selectedCustomer?.name ?? ""}`;
      return { ...current, title: nextTitle, step: 4 };
    });
    setMaxReachedStep((current) => Math.max(current, 4));
  }

  function validateSchedule(): boolean {
    if (state.scheduledEnd && !state.scheduledStart) {
      setScheduleError("Informe o início previsto antes do fim previsto.");
      return false;
    }
    if (state.scheduledStart && state.scheduledEnd) {
      const start = new Date(state.scheduledStart);
      const end = new Date(state.scheduledEnd);
      if (end.getTime() < start.getTime()) {
        setScheduleError("O fim previsto deve ser igual ou posterior ao início previsto.");
        return false;
      }
    }
    setScheduleError(null);
    return true;
  }

  async function handleSubmit() {
    if (!state.selectedCustomer || !state.selectedAddressId) return;
    if (state.title.trim() === "") return;
    if (!validateSchedule()) return;
    const orderDiscount = brlInputToDecimalString(state.orderDiscountInput) ?? "0.00";
    if (!isDiscountWithinSubtotal(orderDiscount, preview.subtotal)) {
      setSubmitErrors({ order_discount: ["O desconto não pode ser maior que o subtotal."] });
      return;
    }

    const requestCompanyId = activeCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrors({});

    const payload: ServiceOrderCreatePayload = {
      customer_id: state.selectedCustomer.id,
      customer_address_id: state.selectedAddressId,
      customer_contact_id: state.selectedContactId === CONTACT_NONE ? null : state.selectedContactId,
      responsible_user_id: null,
      title: state.title.trim(),
      description: state.description.trim() || null,
      scheduled_start_at: state.scheduledStart ? new Date(state.scheduledStart).toISOString() : null,
      scheduled_end_at: state.scheduledEnd ? new Date(state.scheduledEnd).toISOString() : null,
      order_discount: orderDiscount,
      travel_fee: brlInputToDecimalString(state.travelFeeInput) ?? "0.00",
      notes: state.notes.trim() || null,
      items: state.items.map((item) => ({
        catalog_item_id: item.catalogItemId,
        quantity: quantityInputToDecimalString(item.quantityInput) ?? "1.000",
        unit_price: brlInputToDecimalString(item.unitPriceInput),
        line_discount: brlInputToDecimalString(item.lineDiscountInput) ?? "0.00",
        notes: item.notes.trim() || null,
      })),
    };

    try {
      const created = await createServiceOrder(payload);
      if (isStaleRequest(requestCompanyId)) {
        setCompanySwitchNotice(
          "A empresa ativa mudou durante o salvamento. Consulte a empresa anterior antes de criar novamente."
        );
        return;
      }
      router.push(`/ordens-servico/${created.id}`);
    } catch (error) {
      if (isStaleRequest(requestCompanyId)) {
        setCompanySwitchNotice(
          "A empresa ativa mudou durante o salvamento. Consulte a empresa anterior antes de criar novamente."
        );
        return;
      }
      if (error instanceof ApiValidationError) {
        const target = targetStepForErrors(error.errors);
        if (target !== state.step) goToStep(target);
        setSubmitErrors(error.errors);
      } else {
        setSubmitError("Não foi possível criar a O.S. agora.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAddress = findAddress(state.customerDetail, state.selectedAddressId);
  const selectedContact = findContact(state.customerDetail, state.selectedContactId);

  const canAdvanceStep1 = state.selectedCustomer !== null;
  const canAdvanceStep2 = state.selectedAddressId !== null;
  const canAdvanceStep3 = allItemsValid(state.items);
  const canSubmit = state.title.trim() !== "" && !submitting;

  const errorMessages = Object.values(submitErrors).flat();

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <BackLink title="Nova O.S." icon={ClipboardCheck} href="/ordens-servico" step={{ current: state.step, total: 4 }} />

      {companySwitchNotice ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {companySwitchNotice}
        </p>
      ) : null}

      <Stepper currentStep={state.step} maxReachedStep={maxReachedStep} onJump={(step) => goToStep(step as 1 | 2 | 3 | 4)} />

      {errorMessages.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMessages.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
      ) : null}

      {state.step === 1 ? (
        <StepCustomer
          selected={state.selectedCustomer}
          onSelect={handleSelectCustomer}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
        />
      ) : null}

      {state.step === 2 && state.selectedCustomer ? (
        <StepLocation
          customerId={state.selectedCustomer.id}
          detail={state.customerDetail}
          detailStatus={customerDetailStatus === "idle" ? "loading" : customerDetailStatus}
          onRetry={retryCustomerDetail}
          selectedAddressId={state.selectedAddressId}
          onSelectAddress={(addressId) => setState((current) => ({ ...current, selectedAddressId: addressId }))}
          selectedContactId={state.selectedContactId}
          onSelectContact={(contactId) => setState((current) => ({ ...current, selectedContactId: contactId }))}
          onAddressCreated={handleAddressCreated}
          onContactCreated={handleContactCreated}
          requestCompanyId={activeCompanyId}
          isStaleRequest={isStaleRequest}
        />
      ) : null}

      {state.step === 3 ? (
        <StepItems
          items={state.items}
          onAdd={(item) => setState((current) => ({ ...current, items: [...current.items, item] }))}
          onUpdate={(clientId, patch) =>
            setState((current) => ({
              ...current,
              items: current.items.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)),
            }))
          }
          onRemove={(clientId) => setState((current) => ({ ...current, items: current.items.filter((item) => item.clientId !== clientId) }))}
        />
      ) : null}

      {state.step === 4 ? (
        <StepSchedule
          title={state.title}
          onTitleChange={(value) => setState((current) => ({ ...current, title: value }))}
          description={state.description}
          onDescriptionChange={(value) => setState((current) => ({ ...current, description: value }))}
          scheduledStart={state.scheduledStart}
          onScheduledStartChange={(value) => setState((current) => ({ ...current, scheduledStart: value }))}
          scheduledEnd={state.scheduledEnd}
          onScheduledEndChange={(value) => setState((current) => ({ ...current, scheduledEnd: value }))}
          scheduleError={scheduleError}
          travelFeeInput={state.travelFeeInput}
          onTravelFeeChange={(value) => {
            setTravelFeeTouched(true);
            setState((current) => ({ ...current, travelFeeInput: value }));
          }}
          travelFeeSettingsStatus={travelFeeSettingsStatus}
          onRetryTravelFeeSettings={retryTravelFeeSettings}
          orderDiscountInput={state.orderDiscountInput}
          onOrderDiscountChange={(value) => setState((current) => ({ ...current, orderDiscountInput: value }))}
          orderDiscountError={submitErrors.order_discount?.[0] ?? null}
          notes={state.notes}
          onNotesChange={(value) => setState((current) => ({ ...current, notes: value }))}
          customerName={state.selectedCustomer?.name ?? ""}
          addressLabel={selectedAddress?.label ?? "—"}
          contactName={selectedContact?.name ?? null}
          preview={preview}
          titleError={submitErrors.title?.[0]}
          orderDiscountDecimal={brlInputToDecimalString(state.orderDiscountInput) ?? "0.00"}
          travelFeeDecimal={brlInputToDecimalString(state.travelFeeInput) ?? "0.00"}
        />
      ) : null}

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <div
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card/95 p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {state.step > 1 ? (
          <Button type="button" variant="outline" onClick={() => goToStep((state.step - 1) as 1 | 2 | 3 | 4)} className="flex-1 sm:flex-none">
            Voltar
          </Button>
        ) : null}
        {state.step === 1 ? (
          <Button type="button" onClick={() => goToStep(2)} disabled={!canAdvanceStep1} className="flex-1 sm:flex-none">
            Avançar
          </Button>
        ) : null}
        {state.step === 2 ? (
          <Button type="button" onClick={() => goToStep(3)} disabled={!canAdvanceStep2} className="flex-1 sm:flex-none">
            Avançar
          </Button>
        ) : null}
        {state.step === 3 ? (
          <Button type="button" onClick={handleAdvanceFromItems} disabled={!canAdvanceStep3} className="flex-1 sm:flex-none">
            Avançar
          </Button>
        ) : null}
        {state.step === 4 ? (
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit} className="flex-1 sm:flex-none">
            {submitting ? "Criando..." : "Criar O.S."}
          </Button>
        ) : null}
      </div>

      <ConfirmActionDialog
        open={confirmZeroItemsOpen}
        onOpenChange={setConfirmZeroItemsOpen}
        title="Continuar sem produtos ou serviços?"
        description="Você poderá complementar a O.S. depois."
        confirmLabel="Continuar"
        cancelLabel="Voltar"
        onConfirm={() => {
          setConfirmZeroItemsOpen(false);
          proceedToSchedule();
        }}
      />
    </div>
  );
}

function targetStepForErrors(errors: Record<string, string[]>): 1 | 2 | 3 | 4 {
  const keys = Object.keys(errors);
  if (keys.some((key) => key === "customer_id")) return 1;
  if (keys.some((key) => key === "customer_address_id" || key === "customer_contact_id")) return 2;
  if (keys.some((key) => key.startsWith("items"))) return 3;
  return 4;
}
