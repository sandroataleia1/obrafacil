"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Pencil, Plus, Search, Star, Trash2, Users } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toE164BR } from "@/features/auth/phone-e164";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatCnpj, formatCpf, formatE164PhoneForDisplay, onlyDigits } from "@/lib/document";
import { formatPhoneInput } from "@/lib/phone";
import { AddressFields, EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "./address-fields";
import { ContactFields, EMPTY_CONTACT_FIELDS, type ContactFieldsValue } from "./contact-fields";
import { createCustomer, lookupCnpj } from "./customers-client";
import type { CustomerCreatePayload, CustomerKind } from "./types";

interface AddressDraft extends AddressFieldsValue {
  clientId: string;
  is_primary: boolean;
}

interface ContactDraft extends ContactFieldsValue {
  clientId: string;
  is_primary: boolean;
  active: boolean;
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;
}

function newPrimaryAddressDraft(): AddressDraft {
  return { ...EMPTY_ADDRESS_FIELDS, clientId: newClientId(), is_primary: true, label: "Endereço principal" };
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

export function CustomerCreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [kind, setKind] = useState<CustomerKind>("individual");
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  // §B: the create form always starts with exactly one address draft — the
  // primary — never an empty array. The user is never required to click
  // "+" just to see the first address's fields.
  const [addresses, setAddresses] = useState<AddressDraft[]>(() => [newPrimaryAddressDraft()]);
  const [expandedAddressIds, setExpandedAddressIds] = useState<Set<string>>(() => new Set());
  const [contacts, setContacts] = useState<ContactDraft[]>([]);

  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const canSubmit = name.trim() !== "" && !submitting;

  // §G: the primary address is always rendered in its own dedicated
  // section, first — never mixed into (or reordered within) the "outros
  // endereços" list, regardless of array order.
  const primaryAddress = addresses.find((draft) => draft.is_primary) ?? addresses[0]!;
  const otherAddresses = addresses.filter((draft) => draft.clientId !== primaryAddress.clientId);

  function addAddress() {
    const clientId = newClientId();
    setAddresses((previous) => [...previous, { ...EMPTY_ADDRESS_FIELDS, clientId, is_primary: false }]);
    setExpandedAddressIds((previous) => new Set(previous).add(clientId));
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
      { ...EMPTY_CONTACT_FIELDS, clientId: newClientId(), is_primary: previous.length === 0, active: true },
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

  async function handleLookupCnpj() {
    const digits = onlyDigits(document);
    if (digits.length !== 14) {
      setCnpjStatus("error");
      setCnpjMessage("Informe um CNPJ com 14 dígitos.");
      return;
    }

    setCnpjStatus("loading");
    setCnpjMessage(null);
    try {
      const result = await lookupCnpj(digits);

      setLegalName((current) => current || result.legal_name);
      setTradeName((current) => current || result.trade_name || "");
      // §I/§J: `result.phone` is E.164 from the API (e.g. "+551123851939")
      // — formatE164PhoneForDisplay strips exactly the "+55" country code,
      // never formatPhoneInput() directly on this value (that would read
      // "55" as a DDD).
      setPhone((current) => current || (result.phone ? formatE164PhoneForDisplay(result.phone) : ""));
      setEmail((current) => current || result.email || "");
      setName((current) => current || result.trade_name || result.legal_name);

      // §H: the primary address draft always already exists — the lookup
      // only fills its empty fields, it never creates a second address.
      const address = result.address;
      setAddresses((previous) =>
        previous.map((draft) =>
          draft.clientId === primaryAddress.clientId
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

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    const payload: CustomerCreatePayload = {
      kind,
      name: name.trim(),
      legal_name: legalName.trim() || null,
      trade_name: tradeName.trim() || null,
      document: onlyDigits(document) || null,
      // §J: the country code is never part of the DDD — toE164BR reads the
      // BR-masked display value and prepends "+55" itself.
      phone: phone ? toE164BR(phone) : null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      // §Y: the primary address (already open by default) is just another
      // entry in this same array — one atomic POST, never a separate call.
      addresses: addresses.map((draft) => ({
        label: draft.label,
        type: draft.type,
        postal_code: draft.postal_code || null,
        street: draft.street || null,
        number: draft.number || null,
        complement: draft.complement || null,
        neighborhood: draft.neighborhood || null,
        city: draft.city || null,
        state: draft.state || null,
        reference_point: draft.reference_point || null,
        is_primary: draft.is_primary,
      })),
      contacts: contacts.map((draft) => ({
        name: draft.name,
        role: draft.role || null,
        department: draft.department || null,
        phone: draft.phone ? toE164BR(draft.phone) : null,
        whatsapp: draft.whatsapp ? toE164BR(draft.whatsapp) : null,
        email: draft.email || null,
        notes: draft.notes || null,
        is_primary: draft.is_primary,
        // §S: every contact created by this form is active by default —
        // there is no "Ativo" toggle here; that belongs to the detail
        // page, once the Customer (and its contacts) already exist.
        active: true,
      })),
    };

    try {
      const created = await createCustomer(payload);
      if (returnTo) {
        router.push(`${returnTo}?customerId=${created.id}`);
      } else {
        router.push(`/clientes/${created.id}`);
      }
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
      } else {
        setSubmitError("Não foi possível criar o cliente agora.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const documentError = firstError(fieldErrors, "document");
  const phoneError = firstError(fieldErrors, "phone");
  const emailError = firstError(fieldErrors, "email");
  const nameError = firstError(fieldErrors, "name");
  const addressesError = firstError(fieldErrors, "addresses");
  const contactsError = firstError(fieldErrors, "contacts");
  const primaryAddressIndex = addresses.findIndex((draft) => draft.clientId === primaryAddress.clientId);

  return (
    <div className="space-y-8 pb-6">
      <BackLink title="Novo cliente" description="Informe o essencial para começar." icon={Users} href="/clientes" />

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

      {/* §N/§X.1: "Dados do cliente" — general fields grouped in one clear block. */}
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
                    onChange={(event) => setDocument(onlyDigits(event.target.value).slice(0, 14))}
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

      {/* §A/§O/§X.2: "Endereço principal" — always visible, never behind a "+". */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
            Endereço principal
          </CardTitle>
          <CardDescription>Endereço principal deste cliente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <AddressFields
            value={primaryAddress}
            onChange={(patch) => updateAddress(primaryAddress.clientId, patch)}
            idPrefix="address-primary"
          />
          {addressesError || draftErrors(fieldErrors, "addresses", primaryAddressIndex) ? (
            <p role="alert" className="text-xs text-destructive">
              {addressesError ?? draftErrors(fieldErrors, "addresses", primaryAddressIndex)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* §E/§P/§X.3: "Outros endereços" — compact cards, only this button creates a new one. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Outros endereços</h2>
          <Button type="button" variant="outline" size="sm" onClick={addAddress}>
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar endereço
          </Button>
        </div>
        {otherAddresses.map((draft) => {
          const index = addresses.findIndex((item) => item.clientId === draft.clientId);
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
                  {draftErrors(fieldErrors, "addresses", index) ? (
                    <p role="alert" className="text-xs text-destructive">
                      {draftErrors(fieldErrors, "addresses", index)}
                    </p>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </section>

      {/* §Q/§S/§X.4: "Contatos" — starts empty; only "Adicionar contato" creates a draft. */}
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
            Cadastre pessoas que podem ser procuradas sobre este cliente ou suas obras.
          </p>
        </div>
        {contactsError ? (
          <p role="alert" className="text-xs text-destructive">
            {contactsError}
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
              {draftErrors(fieldErrors, "contacts", index) ? (
                <p role="alert" className="text-xs text-destructive">
                  {draftErrors(fieldErrors, "contacts", index)}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={!canSubmit} className="w-full">
        {submitting ? "Criando..." : "Criar cliente"}
      </Button>
    </div>
  );
}
