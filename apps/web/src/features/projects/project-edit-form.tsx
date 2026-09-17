"use client";

/**
 * FRONTEND-PROJECTS-01 §38-43. `/obras/{id}/editar`. `source_budget_id`
 * is NEVER sent in the PUT payload (immutable, backend-enforced —
 * ADR-016 §3/§12). When the Project has a `source_budget`, the Customer
 * field is read-only (§39); otherwise it's a full picker (§40).
 *
 * FRONTEND-PROJECTS-01A §16-17: `ProjectEditForm` is a thin, stable
 * wrapper — same shape as `ProjectCreateForm` — that never itself holds
 * a draft/request. It owns `activeCompanyIdRef` (written via
 * `useLayoutEffect`, so a pending PUT/GET continuation for the OLD
 * Company can never mistake itself for current even if it resolves as a
 * microtask before the wrapper's own passive effects would have run),
 * and force-remounts `ProjectEditFormInner` via `key={`${activeCompanyId}:${id}`}`
 * on EITHER a Company switch OR an `id` change. Remounting clears the
 * draft/conflict/loading/error state instantly — the old Inner instance
 * keeps running (if it has an in-flight request) but can never paint,
 * navigate, or write state that the new Inner would ever read, because
 * every state variable below lives inside the remounted Inner itself.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getCustomer } from "@/features/customers/customers-client";
import type { Customer, CustomerListItem } from "@/features/customers/types";
import { BudgetCustomerPicker } from "@/features/budgets/components/budget-customer-picker";
import {
  EMPTY_PROJECT_ADDRESS_FIELDS,
  isProjectAddressFieldsEmpty,
  ProjectAddressFields,
  type ProjectAddressFieldsValue,
} from "./components/project-address-fields";
import { getProject, updateProject } from "./projects-client";
import type { Project, ProjectAddressInput } from "./types";

type AddressSource = "none" | "customer-address" | "manual";

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

function addressFieldsFromProject(project: Project): ProjectAddressFieldsValue {
  if (!project.address) return EMPTY_PROJECT_ADDRESS_FIELDS;
  return {
    postal_code: project.address.postal_code ?? "",
    street: project.address.street ?? "",
    number: project.address.number ?? "",
    complement: project.address.complement ?? "",
    neighborhood: project.address.neighborhood ?? "",
    city: project.address.city ?? "",
    state: project.address.state ?? "",
    reference_point: project.address.reference_point ?? "",
  };
}

function initialAddressSource(project: Project): AddressSource {
  if (project.customer_address_id) return "customer-address";
  if (project.address) return "manual";
  return "none";
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

function ProjectEditFormInner({
  id,
  activeCompanyIdRef,
}: {
  id: string;
  activeCompanyIdRef: { current: string | undefined };
}) {
  const router = useRouter();
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<"loading" | "success" | "not_found" | "error">("loading");
  const [project, setProject] = useState<Project | null>(null);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | undefined>(undefined);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [expectedStartDate, setExpectedStartDate] = useState("");
  const [expectedEndDate, setExpectedEndDate] = useState("");

  const [pickedCustomer, setPickedCustomer] = useState<CustomerListItem | Customer | null>(null);
  // Drives `customerId` for the non-source case, independent of
  // `pickedCustomer`'s fuller shape (needed only for the picker's own
  // "selected" card) — seeded from `project.customer.id` on load,
  // before the full Customer (with addresses) has been fetched.
  const [customerIdState, setCustomerIdState] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [customerDetailStatus, setCustomerDetailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const [addressSource, setAddressSource] = useState<AddressSource>("none");
  const [selectedCustomerAddressId, setSelectedCustomerAddressId] = useState<string | null>(null);
  const [addressFields, setAddressFields] = useState<ProjectAddressFieldsValue>(EMPTY_PROJECT_ADDRESS_FIELDS);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [conflict, setConflict] = useState(false);

  const requestSequence = useRef(0);
  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    [activeCompanyIdRef]
  );

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");
    try {
      const data = await getProject(id);
      if (requestSequence.current !== requestId) return;
      if (isStaleRequest(requestCompanyId)) return;
      setProject(data);
      setName(data.name);
      setReference(data.reference ?? "");
      setExpectedStartDate(data.expected_start_date ?? "");
      setExpectedEndDate(data.expected_end_date ?? "");
      setCustomerIdState(data.customer.id);
      setAddressSource(initialAddressSource(data));
      setSelectedCustomerAddressId(data.customer_address_id);
      setAddressFields(addressFieldsFromProject(data));
      setLoadedCompanyId(requestCompanyId);
      setResolvedCompanyId(requestCompanyId);
      setStatus("success");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (isStaleRequest(requestCompanyId)) return;
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

  const hasSource = project?.source_budget != null;
  const customerId = hasSource ? project?.customer.id : customerIdState;

  const customerFetchSequence = useRef(0);
  useEffect(() => {
    if (!customerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerDetail(null);
      setCustomerDetailStatus("idle");
      return;
    }
    const requestCompanyId = activeCompanyId;
    const requestId = ++customerFetchSequence.current;
    setCustomerDetailStatus("loading");
    getCustomer(customerId)
      .then((data) => {
        if (customerFetchSequence.current !== requestId) return;
        if (isStaleRequest(requestCompanyId)) return;
        setCustomerDetail(data);
        setCustomerDetailStatus("success");
        // Seeds the picker's "selected" card on initial load — a no-op
        // once the user has actively picked someone via the picker
        // itself (`handleCustomerChange` already set it to the exact
        // same customer in that case).
        setPickedCustomer(data);
      })
      .catch(() => {
        if (customerFetchSequence.current !== requestId) return;
        if (isStaleRequest(requestCompanyId)) return;
        setCustomerDetailStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, activeCompanyId]);

  function handleCustomerChange(next: CustomerListItem | Customer) {
    setPickedCustomer(next);
    setCustomerIdState(next.id);
    // §40: if the current address source no longer belongs to the new
    // Customer, fall back to manual (preserving the fields already on
    // screen) rather than silently discarding the physical address —
    // mirrors the backend's own detach-not-clear rule.
    if (addressSource === "customer-address") {
      setAddressSource("manual");
      setSelectedCustomerAddressId(null);
    }
  }

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

  const canSubmit = name.trim() !== "" && Boolean(customerId) && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !project || !customerId) return;

    const requestCompanyId = activeCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    try {
      const updated = await updateProject(project.id, {
        updated_at: project.updated_at,
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
      });
      if (isStaleRequest(requestCompanyId)) return;
      router.push(`/obras/${updated.id}`);
    } catch (error) {
      if (isStaleRequest(requestCompanyId)) return;
      if (error instanceof ApiError && error.status === 409) {
        // §42: never lose the draft silently — show a banner, keep
        // everything on screen, no automatic retry.
        setConflict(true);
      } else if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
        setSubmitError(error.serverMessage ?? "Verifique os dados informados.");
      } else {
        setSubmitError("Não foi possível salvar as alterações agora.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setSubmitting(false);
    }
  }

  const fieldError = (field: string) => fieldErrors[field]?.[0];
  const isCurrentTenant = project !== null && loadedCompanyId === activeCompanyId;
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

  if (status === "error" && isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4">
        <BackLink href="/obras" title="Editar obra" />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar esta obra agora.
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
        <BackLink href="/obras" title="Editar obra" />
        <EmptyState icon={FileText} title="Obra não encontrada" description="Ela pode ter sido removida ou o link está incorreto." />
      </div>
    );
  }

  if (!isCurrentTenant || status === "loading" || !project) {
    return (
      <div className="space-y-4">
        <BackLink href="/obras" title="Editar obra" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-1">
        <BackLink href={`/obras/${project.id}`} title="Editar obra" />
        <p className="pl-11 text-sm text-muted-foreground">Corrija o nome, o cliente ou o endereço da obra.</p>
      </div>

      {conflict ? (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p role="alert" className="text-sm text-destructive">
            A obra foi alterada por outra pessoa.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Recarregar dados
          </Button>
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
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldError("name") ? <p className="text-xs text-destructive">{fieldError("name")}</p> : null}
        </div>

        {hasSource ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Cliente</span>
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground">
              {project.customer.name}
            </div>
            <p className="text-xs text-muted-foreground">
              Esta obra foi criada a partir de um orçamento e permanece vinculada ao mesmo cliente.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <BudgetCustomerPicker
              selected={pickedCustomer}
              onSelect={handleCustomerChange}
              requestCompanyId={activeCompanyId}
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
            onChange={(event) => setReference(event.target.value)}
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
                  <span className="text-sm font-medium text-foreground">Endereço manual / desassociar origem</span>
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
        Salvar alterações
      </Button>
    </div>
  );
}

export function ProjectEditForm({ id }: { id: string }) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  return <ProjectEditFormInner key={`${activeCompanyId}:${id}`} id={id} activeCompanyIdRef={activeCompanyIdRef} />;
}
