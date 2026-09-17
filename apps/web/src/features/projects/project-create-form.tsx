"use client";

/**
 * FRONTEND-PROJECTS-01 §10-25. `/obras/nova` (with or without
 * `?sourceBudgetId=`) and `/obras/nova?customerId=...` (from Cliente).
 *
 * Tenant-race wrapper (`ProjectCreateForm`) mirrors
 * `features/customers/customer-create-form.tsx` exactly: `key={activeCompanyId}`
 * force-remounts the inner form on a Company switch, and
 * `activeCompanyIdRef` (created in the wrapper, which never unmounts)
 * is assigned in a `useLayoutEffect` so a dangling POST from the OLD
 * instance can never navigate/paint under the new Company (§25/TR5/TR6).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { decimalStringToBrlDisplay } from "@/lib/currency";
import { useAuth } from "@/features/auth/auth-provider";
import { getBudget } from "@/features/budgets/budgets-client";
import type { Budget } from "@/features/budgets/types";
import { getCustomer } from "@/features/customers/customers-client";
import type { Customer, CustomerListItem } from "@/features/customers/types";
import { BudgetCustomerPicker } from "@/features/budgets/components/budget-customer-picker";
import {
  EMPTY_PROJECT_ADDRESS_FIELDS,
  isProjectAddressFieldsEmpty,
  ProjectAddressFields,
  type ProjectAddressFieldsValue,
} from "./components/project-address-fields";
import { createProject } from "./projects-client";
import type { ProjectAddressInput, ProjectCreatePayload } from "./types";

type AddressSource = "none" | "customer-address" | "manual";

type SourceBudgetState = "idle" | "loading" | "ready" | "invalid";

function addressFieldsFromCustomerAddress(address: Customer["addresses"][number]): ProjectAddressFieldsValue {
  return {
    postal_code: address.postal_code ?? "",
    street: address.street ?? "",
    number: address.number ?? "",
    complement: address.complement ?? "",
    neighborhood: address.neighborhood ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    reference_point: address.reference_point ?? "",
  };
}

function toAddressInput(fields: ProjectAddressFieldsValue): ProjectAddressInput {
  return {
    postal_code: fields.postal_code || null,
    street: fields.street || null,
    number: fields.number || null,
    complement: fields.complement || null,
    neighborhood: fields.neighborhood || null,
    city: fields.city || null,
    state: fields.state || null,
    reference_point: fields.reference_point || null,
  };
}

function invalidSourceMessage(reason: "not_found" | "not_approved"): string {
  return reason === "not_found"
    ? "Não foi possível carregar este orçamento. Ele pode ter sido removido ou pertencer a outra empresa."
    : "Este orçamento não está aprovado — apenas orçamentos aprovados podem originar uma obra.";
}

function ProjectCreateFormInner({
  activeCompanyIdRef,
}: {
  activeCompanyIdRef: MutableRefObject<string | undefined>;
}) {
  const router = useRouter();
  const auth = useAuth();
  const searchParams = useSearchParams();
  const sourceBudgetId = searchParams.get("sourceBudgetId");
  const preselectedCustomerId = searchParams.get("customerId");
  const hasSource = Boolean(sourceBudgetId);

  const [sourceState, setSourceState] = useState<SourceBudgetState>(hasSource ? "loading" : "idle");
  const [sourceInvalidReason, setSourceInvalidReason] = useState<"not_found" | "not_approved">("not_found");
  const [sourceBudget, setSourceBudget] = useState<Budget | null>(null);

  const [pickedCustomer, setPickedCustomer] = useState<CustomerListItem | Customer | null>(null);
  const [preselectedInvalid, setPreselectedInvalid] = useState(false);

  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [customerDetailStatus, setCustomerDetailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [reference, setReference] = useState("");
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [expectedStartDate, setExpectedStartDate] = useState("");
  const [expectedEndDate, setExpectedEndDate] = useState("");

  const [addressSource, setAddressSource] = useState<AddressSource>("none");
  const [selectedCustomerAddressId, setSelectedCustomerAddressId] = useState<string | null>(null);
  const [addressFields, setAddressFields] = useState<ProjectAddressFieldsValue>(EMPTY_PROJECT_ADDRESS_FIELDS);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const requestCompanyId = auth.activeCompany?.id;
  const isStaleRequest = useCallback(
    (fireCompanyId: string | undefined) => activeCompanyIdRef.current !== fireCompanyId,
    [activeCompanyIdRef]
  );

  // §11: resolved customer id, whichever source it came from.
  const customerId = hasSource ? (sourceBudget?.customer_id ?? null) : (pickedCustomer?.id ?? null);

  // Load the source Budget once (§11/§14).
  useEffect(() => {
    if (!sourceBudgetId) return;
    const fireCompanyId = activeCompanyIdRef.current;
    let cancelled = false;
    getBudget(sourceBudgetId)
      .then((budget) => {
        if (cancelled || isStaleRequest(fireCompanyId)) return;
        if (budget.status !== "approved") {
          setSourceInvalidReason("not_approved");
          setSourceState("invalid");
          return;
        }
        setSourceBudget(budget);
        setSourceState("ready");
      })
      .catch(() => {
        if (cancelled || isStaleRequest(fireCompanyId)) return;
        setSourceInvalidReason("not_found");
        setSourceState("invalid");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBudgetId]);

  // §16: validate a preselected ?customerId= via the API — never trust the bare UUID.
  useEffect(() => {
    if (hasSource || !preselectedCustomerId) return;
    const fireCompanyId = activeCompanyIdRef.current;
    let cancelled = false;
    getCustomer(preselectedCustomerId)
      .then((customer) => {
        if (cancelled || isStaleRequest(fireCompanyId)) return;
        setPickedCustomer(customer);
      })
      .catch(() => {
        if (cancelled || isStaleRequest(fireCompanyId)) return;
        setPreselectedInvalid(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSource, preselectedCustomerId]);

  // §17: async ownership guard — a fetch for Customer A must never paint
  // once the user (or the source Budget) has moved on to Customer B.
  const customerFetchSequence = useRef(0);
  useEffect(() => {
    if (!customerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerDetail(null);
      setCustomerDetailStatus("idle");
      return;
    }
    const fireCompanyId = activeCompanyIdRef.current;
    const requestId = ++customerFetchSequence.current;
    setCustomerDetailStatus("loading");
    getCustomer(customerId)
      .then((data) => {
        if (customerFetchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setCustomerDetail(data);
        setCustomerDetailStatus("success");
      })
      .catch(() => {
        if (customerFetchSequence.current !== requestId) return;
        if (isStaleRequest(fireCompanyId)) return;
        setCustomerDetailStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // §12: prefill name/reference from the source Budget, only while
  // untouched by the user.
  useEffect(() => {
    if (!sourceBudget) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!nameTouched) setName(sourceBudget.title);
    if (!referenceTouched && sourceBudget.reference) setReference(sourceBudget.reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBudget]);

  function handleAddressSourceChange(next: AddressSource, customerAddress?: Customer["addresses"][number]) {
    setAddressSource(next);
    if (next === "customer-address" && customerAddress) {
      setSelectedCustomerAddressId(customerAddress.id);
      setAddressFields(addressFieldsFromCustomerAddress(customerAddress));
    } else if (next === "manual") {
      setSelectedCustomerAddressId(null);
    } else {
      setSelectedCustomerAddressId(null);
      setAddressFields(EMPTY_PROJECT_ADDRESS_FIELDS);
    }
  }

  const canSubmit = name.trim() !== "" && customerId !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !customerId) return;

    const fireCompanyId = activeCompanyIdRef.current;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    const payload: ProjectCreatePayload = {
      name: name.trim(),
      reference: reference.trim() || null,
      customer_id: customerId,
      customer_address_id: addressSource === "customer-address" ? selectedCustomerAddressId : null,
      address:
        addressSource === "none"
          ? null
          : addressSource === "manual" && isProjectAddressFieldsEmpty(addressFields)
            ? null
            : toAddressInput(addressFields),
      expected_start_date: expectedStartDate || null,
      expected_end_date: expectedEndDate || null,
      source_budget_id: sourceBudget?.id ?? null,
    };

    try {
      const created = await createProject(payload);
      if (isStaleRequest(fireCompanyId)) return;
      router.push(`/obras/${created.id}`);
    } catch (error) {
      if (isStaleRequest(fireCompanyId)) return;
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
        setSubmitError(error.serverMessage ?? "Verifique os dados informados.");
      } else if (error instanceof ApiError) {
        setSubmitError("Não foi possível criar a obra agora.");
      } else {
        setSubmitError("Não foi possível criar a obra agora.");
      }
    } finally {
      if (!isStaleRequest(fireCompanyId)) setSubmitting(false);
    }
  }

  const fieldError = (field: string) => fieldErrors[field]?.[0];

  if (hasSource && sourceState === "loading") {
    return (
      <div className="space-y-6">
        <BackLink href="/obras" title="Nova obra" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (hasSource && sourceState === "invalid") {
    return (
      <div className="space-y-6">
        <BackLink href="/obras" title="Nova obra" />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            {invalidSourceMessage(sourceInvalidReason)}
          </p>
          <Button type="button" nativeButton={false} render={<Link href="/obras/nova">Criar obra sem orçamento</Link>} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackLink href="/obras" title="Nova obra" />
        <p className="pl-11 text-sm text-muted-foreground">Informe o essencial para começar a acompanhar a execução.</p>
      </div>

      {sourceBudget ? (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">Orçamento de origem</p>
              <p className="text-sm font-medium text-foreground">
                {sourceBudget.number} · {sourceBudget.title}
              </p>
              <p className="text-sm text-foreground">{decimalStringToBrlDisplay(sourceBudget.total)}</p>
              <p className="text-xs text-muted-foreground">Cliente: {sourceBudget.customer.name}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="project-name" className="text-sm font-medium text-foreground">
            Nome da obra
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(event) => {
              setNameTouched(true);
              setName(event.target.value);
            }}
            placeholder="Casa Oliveira"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldError("name") ? <p className="text-xs text-destructive">{fieldError("name")}</p> : null}
        </div>

        {sourceBudget ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Cliente</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {sourceBudget.customer.name}
            </div>
            <p className="text-xs text-muted-foreground">
              Esta obra será criada para o mesmo cliente do orçamento aprovado.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span />
              <Link
                href="/clientes/novo?returnTo=/obras/nova"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3" aria-hidden="true" />
                Novo cliente
              </Link>
            </div>
            {preselectedInvalid ? (
              <p className="text-xs text-destructive">
                Não foi possível carregar o cliente informado. Selecione um cliente abaixo.
              </p>
            ) : null}
            <BudgetCustomerPicker
              selected={pickedCustomer}
              onSelect={setPickedCustomer}
              requestCompanyId={requestCompanyId}
              isStaleRequest={isStaleRequest}
            />
            {fieldError("customer_id") ? <p className="text-xs text-destructive">{fieldError("customer_id")}</p> : null}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="project-reference" className="text-sm font-medium text-foreground">
            Referência <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="project-reference"
            type="text"
            value={reference}
            onChange={(event) => {
              setReferenceTouched(true);
              setReference(event.target.value);
            }}
            placeholder="Construção residencial"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldError("reference") ? <p className="text-xs text-destructive">{fieldError("reference")}</p> : null}
        </div>

        {customerId ? (
          <div className="space-y-3">
            <span className="text-sm font-medium text-foreground">Endereço da obra</span>
            {customerDetailStatus === "loading" ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : customerDetailStatus === "error" ? (
              <p className="text-sm text-muted-foreground">Não foi possível carregar os endereços deste cliente.</p>
            ) : (
              <div className="space-y-2">
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                    addressSource === "none" ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="project-address-source"
                    checked={addressSource === "none"}
                    onChange={() => handleAddressSourceChange("none")}
                  />
                  <span className="text-sm font-medium text-foreground">Sem endereço</span>
                </label>
                {customerDetail?.addresses.map((address) => (
                  <label
                    key={address.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                      addressSource === "customer-address" && selectedCustomerAddressId === address.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <input
                      type="radio"
                      name="project-address-source"
                      className="mt-1"
                      checked={addressSource === "customer-address" && selectedCustomerAddressId === address.id}
                      onChange={() => handleAddressSourceChange("customer-address", address)}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">{address.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {[address.street, address.city && address.state ? `${address.city}/${address.state}` : address.city]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </label>
                ))}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                    addressSource === "manual" ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="project-address-source"
                    checked={addressSource === "manual"}
                    onChange={() => handleAddressSourceChange("manual")}
                  />
                  <span className="text-sm font-medium text-foreground">Endereço manual</span>
                </label>
              </div>
            )}

            {addressSource !== "none" ? (
              <ProjectAddressFields
                value={addressFields}
                onChange={(patch) => setAddressFields((current) => ({ ...current, ...patch }))}
                idPrefix="project-address"
              />
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="project-start-date" className="text-sm font-medium text-foreground">
            Data prevista de início <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="project-start-date"
            type="date"
            value={expectedStartDate}
            onChange={(event) => setExpectedStartDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldError("expected_start_date") ? (
            <p className="text-xs text-destructive">{fieldError("expected_start_date")}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="project-end-date" className="text-sm font-medium text-foreground">
            Data prevista de conclusão <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="project-end-date"
            type="date"
            value={expectedEndDate}
            onChange={(event) => setExpectedEndDate(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldError("expected_end_date") ? (
            <p className="text-xs text-destructive">{fieldError("expected_end_date")}</p>
          ) : null}
        </div>

        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>

      <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={!canSubmit} className="w-full">
        Criar obra
      </Button>
    </div>
  );
}

export function ProjectCreateForm() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  return <ProjectCreateFormInner key={activeCompanyId} activeCompanyIdRef={activeCompanyIdRef} />;
}
