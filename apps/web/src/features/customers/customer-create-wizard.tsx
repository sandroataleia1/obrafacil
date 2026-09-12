"use client";

import { useRef, useState, type MutableRefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Pencil, Plus, Search, Star, Trash2, Users } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toE164BR } from "@/features/auth/phone-e164";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatCnpj, formatCpf, formatE164PhoneForDisplay, onlyDigits } from "@/lib/document";
import { formatPhoneInput } from "@/lib/phone";
import { EMPTY_ADDRESS_FIELDS, AddressFields, type AddressFieldsValue } from "./address-fields";
import { normalizeAddressDrafts, resolveAddressFieldErrors, type AddressDraft } from "./address-normalization";
import { ContactFields, EMPTY_CONTACT_FIELDS, type ContactFieldsValue } from "./contact-fields";
import { createCustomer, lookupCnpj } from "./customers-client";
import { ADDRESS_TYPE_LABELS } from "./labels";
import type { AddressCreatePayload, ContactCreatePayload, CustomerCreatePayload, CustomerKind } from "./types";

type WizardStep = 1 | 2 | 3 | 4;

const STEP_TITLES = ["Dados básicos", "Endereços", "Contatos", "Revisão"];

const STEP1_ERROR_KEYS = new Set(["kind", "name", "legal_name", "trade_name", "document", "phone", "email", "notes"]);

interface ContactDraft extends ContactFieldsValue {
  clientId: string;
  is_primary: boolean;
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;
}

function newPrimaryAddressDraft(): AddressDraft {
  return {
    ...EMPTY_ADDRESS_FIELDS,
    clientId: newClientId(),
    is_primary: true,
    label: "Endereço principal",
    defaultLabel: "Endereço principal",
  };
}

function newSecondaryAddressDraft(): AddressDraft {
  return { ...EMPTY_ADDRESS_FIELDS, clientId: newClientId(), is_primary: false, defaultLabel: EMPTY_ADDRESS_FIELDS.label };
}

function firstError(errors: Record<string, string[]>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (errors[key]?.[0]) return errors[key][0];
  }
  return null;
}

function draftErrors(errors: Record<string, string[]>, prefix: string, index: number): string | null {
  for (const [key, messages] of Object.entries(errors)) {
    if (key.startsWith(`${prefix}.${index}.`) || key === `${prefix}.${index}`) {
      return messages[0] ?? null;
    }
  }
  return null;
}

function addressSummaryLine(draft: AddressFieldsValue): string {
  const parts = [
    draft.street ? `${draft.street}${draft.number ? `, ${draft.number}` : ""}` : null,
    draft.city && draft.state ? `${draft.city}/${draft.state}` : draft.city,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Sem endereço postal informado";
}

function targetStepForErrors(errors: Record<string, string[]>): WizardStep {
  const keys = Object.keys(errors);
  if (keys.some((key) => STEP1_ERROR_KEYS.has(key))) return 1;
  if (keys.some((key) => key === "addresses" || key.startsWith("addresses."))) return 2;
  if (keys.some((key) => key === "contacts" || key.startsWith("contacts."))) return 3;
  return 4;
}

function Stepper({
  step,
  maxReachedStep,
  onJump,
}: {
  step: WizardStep;
  maxReachedStep: WizardStep;
  onJump: (step: WizardStep) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground sm:hidden">
        Etapa {step} de 4 — {STEP_TITLES[step - 1]}
      </p>
      <ol className="hidden items-center gap-2 sm:flex" aria-label="Etapas">
        {STEP_TITLES.map((label, index) => {
          const target = (index + 1) as WizardStep;
          const reachable = target <= maxReachedStep;
          const active = target === step;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(target)}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : reachable
                      ? "border-border bg-card text-foreground hover:bg-muted"
                      : "border-border bg-muted/40 text-muted-foreground"
                }`}
              >
                <span className="flex size-4 items-center justify-center rounded-full bg-current/10 text-[10px]">
                  {target}
                </span>
                {label}
              </button>
              {target < STEP_TITLES.length ? <span className="h-px w-4 bg-border" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CustomerCreateWizard({
  activeCompanyIdRef,
}: {
  activeCompanyIdRef: MutableRefObject<string | undefined>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [step, setStep] = useState<WizardStep>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1);

  const [kind, setKind] = useState<CustomerKind>("individual");
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  // The wizard always starts with exactly one address draft — the
  // primary — never an empty array. The user is never required to click
  // "+" just to see the first address's fields.
  const [addresses, setAddresses] = useState<AddressDraft[]>(() => [newPrimaryAddressDraft()]);
  const [expandedAddressIds, setExpandedAddressIds] = useState<Set<string>>(() => new Set());
  const [contacts, setContacts] = useState<ContactDraft[]>([]);

  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);
  // Incremented on every CNPJ lookup start — a lookup only applies its
  // result if this ref's value still matches the generation it captured
  // before its `await`, so a second (later-started) lookup always wins
  // over a first one whose response happens to resolve later.
  const cnpjLookupGenerationRef = useRef(0);

  const [submitting, setSubmitting] = useState(false);
  // Belt-and-suspenders against a double-click firing two requests before
  // the `submitting` state re-render lands: checked synchronously, not
  // only via the (also present) `disabled` prop.
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const primaryAddress = addresses.find((draft) => draft.is_primary) ?? addresses[0]!;
  const otherAddresses = addresses.filter((draft) => draft.clientId !== primaryAddress.clientId);

  function addAddress() {
    const draft = newSecondaryAddressDraft();
    setAddresses((previous) => [...previous, draft]);
    setExpandedAddressIds((previous) => new Set(previous).add(draft.clientId));
  }

  function updateAddress(clientId: string, patch: Partial<AddressFieldsValue>) {
    setAddresses((previous) => previous.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)));
  }

  function removeAddress(clientId: string) {
    setAddresses((previous) => previous.filter((draft) => draft.clientId !== clientId));
  }

  function setPrimaryAddress(clientId: string) {
    setAddresses((previous) => previous.map((draft) => ({ ...draft, is_primary: draft.clientId === clientId })));
  }

  function toggleAddressExpanded(clientId: string) {
    setExpandedAddressIds((previous) => {
      const next = new Set(previous);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function addContact() {
    setContacts((previous) => [
      ...previous,
      { ...EMPTY_CONTACT_FIELDS, clientId: newClientId(), is_primary: previous.length === 0, active: true } as ContactDraft,
    ]);
  }

  function updateContact(clientId: string, patch: Partial<ContactFieldsValue>) {
    setContacts((previous) => previous.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)));
  }

  function removeContact(clientId: string) {
    setContacts((previous) => {
      const target = previous.find((draft) => draft.clientId === clientId);
      if (target?.is_primary && previous.length > 1) return previous;
      return previous.filter((draft) => draft.clientId !== clientId);
    });
  }

  function setPrimaryContact(clientId: string) {
    setContacts((previous) => previous.map((draft) => ({ ...draft, is_primary: draft.clientId === clientId })));
  }

  /**
   * Editing the document field invalidates whatever CNPJ lookup is in
   * flight — a response for a document the user has since changed away
   * from must never apply. This is stronger than the generation bump
   * inside `handleLookupCnpj` itself: that one only protects a NEWER
   * lookup against an OLDER one resolving later; this one protects
   * against an old lookup resolving after the document was edited with
   * no new lookup started at all.
   *
   * Resetting `cnpjStatus`/`cnpjMessage` here too (not just the
   * generation ref) matters just as much: without it, editing away from
   * a document whose lookup never resolves would leave "Buscar CNPJ"
   * permanently disabled (stuck on the old, now-irrelevant "loading"
   * state) for the NEW document the user actually wants to search.
   */
  function handleDocumentChange(nextDigits: string) {
    cnpjLookupGenerationRef.current += 1;
    setCnpjStatus("idle");
    setCnpjMessage(null);
    setDocument(nextDigits);
  }

  function goToStep(target: WizardStep) {
    setFieldErrors({});
    setSubmitError(null);
    setStep(target);
    setMaxReachedStep((current) => (current > target ? current : target));
  }

  const canAdvanceStep1 = name.trim() !== "";
  const canAdvanceStep3 = contacts.every((draft) => draft.name.trim() !== "");

  function handleAdvance() {
    if (step === 1) {
      if (!canAdvanceStep1) {
        setFieldErrors({ name: ["Informe o nome para continuar."] });
        return;
      }
      goToStep(2);
      return;
    }
    if (step === 2) {
      goToStep(3);
      return;
    }
    if (step === 3) {
      if (!canAdvanceStep3) {
        setFieldErrors({ contacts: ["Preencha o nome do contato ou remova o rascunho antes de continuar."] });
        return;
      }
      goToStep(4);
    }
  }

  /**
   * Going backward is always allowed and never re-validated — nothing in
   * this wizard is destroyed by going back, all of it lives in this
   * component's own React state for the page's lifetime. Jumping FORWARD
   * to an already-visited step re-checks every intermediate step's own
   * advance-guard, landing (and showing the error) on the FIRST invalid
   * step found — never silently on the target step.
   */
  function handleStepperJump(target: WizardStep) {
    if (target <= step) {
      goToStep(target);
      return;
    }
    const guards: Record<number, boolean> = { 1: canAdvanceStep1, 2: true, 3: canAdvanceStep3 };
    for (let candidate = step; candidate < target; candidate++) {
      if (!guards[candidate]) {
        goToStep(candidate as WizardStep);
        if (candidate === 1) setFieldErrors({ name: ["Informe o nome para continuar."] });
        if (candidate === 3) {
          setFieldErrors({ contacts: ["Preencha o nome do contato ou remova o rascunho antes de continuar."] });
        }
        return;
      }
    }
    goToStep(target);
  }

  async function handleLookupCnpj() {
    const digits = onlyDigits(document);
    if (digits.length !== 14) {
      setCnpjStatus("error");
      setCnpjMessage("Informe um CNPJ com 14 dígitos.");
      return;
    }

    const myGeneration = ++cnpjLookupGenerationRef.current;
    setCnpjStatus("loading");
    setCnpjMessage(null);
    try {
      const result = await lookupCnpj(digits);
      if (cnpjLookupGenerationRef.current !== myGeneration) return; // superseded by a newer lookup

      setLegalName((current) => current || result.legal_name);
      setTradeName((current) => current || result.trade_name || "");
      // `result.phone` is E.164 from the API (e.g. "+551123851939") —
      // formatE164PhoneForDisplay strips exactly the "+55" country code,
      // never formatPhoneInput() directly on this value (that would read
      // "55" as a DDD).
      setPhone((current) => current || (result.phone ? formatE164PhoneForDisplay(result.phone) : ""));
      setEmail((current) => current || result.email || "");
      setName((current) => current || result.trade_name || result.legal_name);

      // The primary address draft always already exists — the lookup only
      // fills its empty fields, it never creates a second address.
      const address = result.address;
      setAddresses((previous) =>
        previous.map((draft) =>
          draft.is_primary
            ? {
                ...draft,
                postal_code: draft.postal_code || address.postal_code || "",
                street: draft.street || address.street || "",
                number: draft.number || address.number || "",
                complement: draft.complement || address.complement || "",
                neighborhood: draft.neighborhood || address.neighborhood || "",
                city: draft.city || address.city || "",
                state: draft.state || address.state || "",
              }
            : draft
        )
      );

      setCnpjStatus("idle");
    } catch (error) {
      if (cnpjLookupGenerationRef.current !== myGeneration) return;
      setCnpjStatus("error");
      if (error instanceof ApiError && error.status === 404) {
        setCnpjMessage("CNPJ não encontrado.");
      } else if (error instanceof ApiValidationError) {
        setCnpjMessage("CNPJ inválido.");
      } else {
        setCnpjMessage("Não foi possível consultar o CNPJ agora.");
      }
    }
  }

  /**
   * Full-scratch revalidation, independent of the stepper — never trusts
   * `step`/`maxReachedStep` or any earlier per-step guard as proof the
   * final payload is valid. This is the ONLY gate deciding whether a
   * POST is ever sent, and the single spot that builds it.
   */
  async function handleSubmit() {
    if (submittingRef.current) return;

    const trimmedName = name.trim();
    if (trimmedName === "") {
      goToStep(1);
      setFieldErrors({ name: ["Informe o nome para continuar."] });
      return;
    }

    // Re-derive the normalized address list fresh — never trust a flag
    // set earlier by a step's own UI state. This is the SAME helper the
    // review step and the backend error mapping both read, so payload,
    // review and errors can never disagree with each other.
    const normalizedAddresses = normalizeAddressDrafts(addresses);
    const addressPayloads: AddressCreatePayload[] = normalizedAddresses.map((item) => item.payload);

    // Same discipline for contacts: any draft that will be sent must have
    // a non-empty name, re-checked here rather than trusted from the
    // step-3 advance guard.
    const sendableContacts = contacts.filter((draft) => draft.name.trim() !== "");
    const contactPayloads: ContactCreatePayload[] = sendableContacts.map((draft) => ({
      name: draft.name.trim(),
      role: draft.role || null,
      department: draft.department || null,
      phone: draft.phone ? toE164BR(draft.phone) : null,
      whatsapp: draft.whatsapp ? toE164BR(draft.whatsapp) : null,
      email: draft.email || null,
      notes: draft.notes || null,
      is_primary: false,
      // Every contact created by this form is active by default — there
      // is no "Ativo" toggle here; that belongs to the detail page, once
      // the Customer (and its contacts) already exist.
      active: true,
    }));
    if (contactPayloads.length > 0) {
      const primaryIndex = sendableContacts.findIndex((draft) => draft.is_primary);
      contactPayloads[primaryIndex >= 0 ? primaryIndex : 0]!.is_primary = true;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    // Captured at the moment of the actual click — not from a value that
    // could go stale while the request is in flight.
    const requestCompanyId = activeCompanyIdRef.current;

    const payload: CustomerCreatePayload = {
      kind,
      name: trimmedName,
      legal_name: legalName.trim() || null,
      trade_name: tradeName.trim() || null,
      document: onlyDigits(document) || null,
      // The country code is never part of the DDD — toE164BR reads the
      // BR-masked display value and prepends "+55" itself.
      phone: phone ? toE164BR(phone) : null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      addresses: addressPayloads,
      contacts: contactPayloads,
    };

    try {
      const created = await createCustomer(payload);
      if (activeCompanyIdRef.current !== requestCompanyId) {
        // The active company changed between the POST resolving and this
        // continuation running. The created Customer is real and stays
        // correct under the OLD company; this (now-stale) instance must
        // never navigate anywhere.
        return;
      }
      if (returnTo) {
        router.push(`${returnTo}?customerId=${created.id}`);
      } else {
        router.push(`/clientes/${created.id}`);
      }
    } catch (error) {
      if (activeCompanyIdRef.current !== requestCompanyId) {
        return;
      }
      if (error instanceof ApiValidationError) {
        const target = targetStepForErrors(error.errors);
        if (target !== step) goToStep(target);
        setFieldErrors(error.errors);
      } else {
        setSubmitError("Não foi possível criar o cliente agora.");
      }
    } finally {
      if (activeCompanyIdRef.current === requestCompanyId) {
        setSubmitting(false);
      }
      submittingRef.current = false;
    }
  }

  const documentError = firstError(fieldErrors, "document");
  const phoneError = firstError(fieldErrors, "phone");
  const emailError = firstError(fieldErrors, "email");
  const nameError = firstError(fieldErrors, "name");
  const addressesError = firstError(fieldErrors, "addresses");
  const contactsError = firstError(fieldErrors, "contacts");

  // Single source of truth: the exact same normalized list feeds the
  // Step 2 per-card error mapping, the Step 4 review, and (in
  // `handleSubmit`) the final payload — never recomputed independently.
  const normalizedAddresses = normalizeAddressDrafts(addresses);
  const addressErrorsByClientId = resolveAddressFieldErrors(fieldErrors, normalizedAddresses);

  const reviewContacts = contacts.filter((draft) => draft.name.trim() !== "");

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <BackLink title="Novo cliente" icon={Users} href="/clientes" step={{ current: step, total: 4 }} />

      <Stepper step={step} maxReachedStep={maxReachedStep} onJump={handleStepperJump} />

      {step === 1 ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Tipo de cliente</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("individual")}
                aria-pressed={kind === "individual"}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  kind === "individual" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"
                }`}
              >
                Pessoa física
              </button>
              <button
                type="button"
                onClick={() => setKind("company")}
                aria-pressed={kind === "company"}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  kind === "company" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"
                }`}
              >
                Pessoa jurídica
              </button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dados do cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="customer-name" className="text-sm font-medium text-foreground">
                  {kind === "company" ? "Nome para identificação" : "Nome"}
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="João Oliveira"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                {nameError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {nameError}
                  </p>
                ) : null}
              </div>

              {kind === "company" ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="customer-document" className="text-sm font-medium text-foreground">
                      CNPJ <span className="text-muted-foreground">(opcional)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="customer-document"
                        type="text"
                        inputMode="numeric"
                        value={formatCnpj(document)}
                        onChange={(event) => handleDocumentChange(onlyDigits(event.target.value).slice(0, 14))}
                        placeholder="00.000.000/0000-00"
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => void handleLookupCnpj()}
                        disabled={cnpjStatus === "loading"}
                        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                      >
                        {cnpjStatus === "loading" ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Search className="size-4" aria-hidden="true" />
                        )}
                        Buscar CNPJ
                      </button>
                    </div>
                    {documentError ? (
                      <p role="alert" className="text-xs text-destructive">
                        {documentError}
                      </p>
                    ) : cnpjMessage ? (
                      <p role="alert" className="text-xs text-destructive">
                        {cnpjMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="customer-legal-name" className="text-sm font-medium text-foreground">
                      Razão social <span className="text-muted-foreground">(opcional)</span>
                    </label>
                    <input
                      id="customer-legal-name"
                      type="text"
                      value={legalName}
                      onChange={(event) => setLegalName(event.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="customer-trade-name" className="text-sm font-medium text-foreground">
                      Nome fantasia <span className="text-muted-foreground">(opcional)</span>
                    </label>
                    <input
                      id="customer-trade-name"
                      type="text"
                      value={tradeName}
                      onChange={(event) => setTradeName(event.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="customer-document" className="text-sm font-medium text-foreground">
                    CPF <span className="text-muted-foreground">(opcional)</span>
                  </label>
                  <input
                    id="customer-document"
                    type="text"
                    inputMode="numeric"
                    value={formatCpf(document)}
                    onChange={(event) => setDocument(onlyDigits(event.target.value).slice(0, 11))}
                    placeholder="000.000.000-00"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                  />
                  {documentError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {documentError}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="customer-phone" className="text-sm font-medium text-foreground">
                  Telefone {kind === "company" ? "geral" : ""} <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="customer-phone"
                  type="text"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                {phoneError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {phoneError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="customer-email" className="text-sm font-medium text-foreground">
                  E-mail <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="customer-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                {emailError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {emailError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="customer-notes" className="text-sm font-medium text-foreground">
                  Observações <span className="text-muted-foreground">(opcional)</span>
                </label>
                <textarea
                  id="customer-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                Endereço principal
              </CardTitle>
              <CardDescription>Endereço principal deste cliente (opcional).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AddressFields
                value={primaryAddress}
                onChange={(patch) => updateAddress(primaryAddress.clientId, patch)}
                idPrefix="address-primary"
              />
              {addressesError || addressErrorsByClientId[primaryAddress.clientId] ? (
                <p role="alert" className="text-xs text-destructive">
                  {addressesError ?? addressErrorsByClientId[primaryAddress.clientId]}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Outros endereços</h2>
              <Button type="button" variant="outline" size="sm" onClick={addAddress}>
                <Plus className="size-3.5" aria-hidden="true" />
                Adicionar endereço
              </Button>
            </div>
            {otherAddresses.map((draft) => {
              const expanded = expandedAddressIds.has(draft.clientId);
              return (
                <Card key={draft.clientId}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{draft.label || "Novo endereço"}</CardTitle>
                      {!expanded ? (
                        <CardDescription className="truncate">{addressSummaryLine(draft)}</CardDescription>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPrimaryAddress(draft.clientId)}>
                        Tornar principal
                      </Button>
                      <button
                        type="button"
                        onClick={() => toggleAddressExpanded(draft.clientId)}
                        aria-label={expanded ? `Recolher endereço ${draft.label || ""}` : `Editar endereço ${draft.label || ""}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {expanded ? (
                          <ChevronDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Pencil className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAddress(draft.clientId)}
                        aria-label={`Remover endereço ${draft.label || ""}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </CardHeader>
                  {expanded ? (
                    <CardContent className="space-y-3">
                      <AddressFields
                        value={draft}
                        onChange={(patch) => updateAddress(draft.clientId, patch)}
                        idPrefix={`address-${draft.clientId}`}
                      />
                      {addressErrorsByClientId[draft.clientId] ? (
                        <p role="alert" className="text-xs text-destructive">
                          {addressErrorsByClientId[draft.clientId]}
                        </p>
                      ) : null}
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </section>

          <p className="text-xs text-muted-foreground">
            Endereço é opcional — você pode continuar sem informar nenhum agora e cadastrar depois.
          </p>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <section className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Contatos</h2>
                <Button type="button" variant="outline" size="sm" onClick={addContact}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Adicionar contato
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastre pessoas que podem ser procuradas sobre este cliente ou suas obras (opcional).
              </p>
            </div>
            {contactsError ? (
              <p role="alert" className="text-xs text-destructive">
                {contactsError}
              </p>
            ) : null}
            {contacts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhum contato adicionado.
              </p>
            ) : null}
            {contacts.map((draft, index) => (
              <Card key={draft.clientId}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-1.5 text-sm">
                      {draft.name || `Contato ${index + 1}`}
                      {draft.is_primary ? (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                          Principal
                        </span>
                      ) : null}
                    </CardTitle>
                    {draft.role || draft.department ? (
                      <CardDescription className="truncate">
                        {[draft.role, draft.department].filter(Boolean).join(" · ")}
                      </CardDescription>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!draft.is_primary ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPrimaryContact(draft.clientId)}>
                        Tornar principal
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeContact(draft.clientId)}
                      disabled={draft.is_primary && contacts.length > 1}
                      aria-label={`Remover contato ${draft.name || index + 1}`}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ContactFields
                    value={draft}
                    onChange={(patch) => updateContact(draft.clientId, patch)}
                    idPrefix={`contact-${draft.clientId}`}
                  />
                  {!draft.name.trim() ? (
                    <p role="alert" className="text-xs text-destructive">
                      Informe o nome do contato ou remova este rascunho.
                    </p>
                  ) : null}
                  {draftErrors(fieldErrors, "contacts", index) ? (
                    <p role="alert" className="text-xs text-destructive">
                      {draftErrors(fieldErrors, "contacts", index)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Cliente</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(1)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium text-foreground">{name || "—"}</p>
              <p className="text-muted-foreground">{kind === "company" ? "Pessoa jurídica" : "Pessoa física"}</p>
              {kind === "company" && legalName ? <p className="text-muted-foreground">Razão social: {legalName}</p> : null}
              {kind === "company" && tradeName ? <p className="text-muted-foreground">Nome fantasia: {tradeName}</p> : null}
              {document ? (
                <p className="text-muted-foreground">{kind === "company" ? formatCnpj(document) : formatCpf(document)}</p>
              ) : null}
              {phone ? <p className="text-muted-foreground">{phone}</p> : null}
              {email ? <p className="text-muted-foreground">{email}</p> : null}
              {notes ? <p className="text-muted-foreground">Observações: {notes}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Endereços</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(2)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {normalizedAddresses.length === 0 ? (
                <p className="text-muted-foreground">Nenhum endereço informado.</p>
              ) : (
                normalizedAddresses.map((item) => (
                  <div key={item.clientId} className="space-y-0.5 rounded-lg border border-border p-3">
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      {item.payload.label}
                      {item.payload.is_primary ? (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                          Principal
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">{ADDRESS_TYPE_LABELS[item.draft.type]}</p>
                    <p className="text-muted-foreground">{addressSummaryLine(item.draft)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Contatos</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(3)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                Editar
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {reviewContacts.length === 0 ? (
                <p className="text-muted-foreground">Nenhum contato informado.</p>
              ) : (
                reviewContacts.map((draft) => (
                  <div key={draft.clientId} className="space-y-0.5 rounded-lg border border-border p-3">
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      {draft.name}
                      {draft.is_primary ? (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
                          Principal
                        </span>
                      ) : null}
                    </p>
                    {draft.role || draft.department ? (
                      <p className="text-muted-foreground">{[draft.role, draft.department].filter(Boolean).join(" · ")}</p>
                    ) : null}
                    {draft.phone ? <p className="text-muted-foreground">Tel: {draft.phone}</p> : null}
                    {draft.whatsapp ? <p className="text-muted-foreground">WhatsApp: {draft.whatsapp}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {Object.keys(fieldErrors).length > 0 ? (
            <div role="alert" className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {Object.values(fieldErrors)
                .flat()
                .map((message, index) => (
                  <p key={index}>{message}</p>
                ))}
            </div>
          ) : null}
        </div>
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
        {step > 1 ? (
          <Button type="button" variant="outline" onClick={() => goToStep((step - 1) as WizardStep)} className="flex-1 sm:flex-none">
            Voltar
          </Button>
        ) : null}
        {step < 4 ? (
          <Button type="button" onClick={handleAdvance} className="flex-1 sm:flex-none">
            Avançar
          </Button>
        ) : null}
        {step === 4 ? (
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="flex-1 sm:flex-none">
            {submitting ? "Criando..." : "Criar cliente"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
