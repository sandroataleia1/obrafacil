"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Search, Star, Trash2, Users } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toE164BR } from "@/features/auth/phone-e164";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatCnpj, formatCpf, onlyDigits } from "@/lib/document";
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

  const [addresses, setAddresses] = useState<AddressDraft[]>([]);
  const [contacts, setContacts] = useState<ContactDraft[]>([]);

  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const canSubmit = name.trim() !== "" && !submitting;

  function addAddress() {
    setAddresses((previous) => [
      ...previous,
      { ...EMPTY_ADDRESS_FIELDS, clientId: newClientId(), is_primary: previous.length === 0 },
    ]);
  }

  function updateAddress(clientId: string, patch: Partial<AddressFieldsValue>) {
    setAddresses((previous) => previous.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)));
  }

  function removeAddress(clientId: string) {
    setAddresses((previous) => {
      const target = previous.find((draft) => draft.clientId === clientId);
      if (target?.is_primary && previous.length > 1) return previous;
      return previous.filter((draft) => draft.clientId !== clientId);
    });
  }

  function setPrimaryAddress(clientId: string) {
    setAddresses((previous) => previous.map((draft) => ({ ...draft, is_primary: draft.clientId === clientId })));
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
      setPhone((current) => current || (result.phone ? formatPhoneInput(result.phone) : ""));
      setEmail((current) => current || result.email || "");
      setName((current) => current || result.trade_name || result.legal_name);

      setAddresses((previous) => {
        const address = result.address;
        if (previous.length === 0) {
          return [
            {
              clientId: newClientId(),
              is_primary: true,
              label: "Endereço cadastral",
              type: "commercial",
              postal_code: address.postal_code ?? "",
              street: address.street ?? "",
              number: address.number ?? "",
              complement: address.complement ?? "",
              neighborhood: address.neighborhood ?? "",
              city: address.city ?? "",
              state: address.state ?? "",
              reference_point: "",
            },
          ];
        }

        const primaryIndex = previous.findIndex((draft) => draft.is_primary);
        if (primaryIndex === -1) return previous;

        const primary = previous[primaryIndex]!;
        const filled: AddressDraft = {
          ...primary,
          postal_code: primary.postal_code || address.postal_code || "",
          street: primary.street || address.street || "",
          number: primary.number || address.number || "",
          complement: primary.complement || address.complement || "",
          neighborhood: primary.neighborhood || address.neighborhood || "",
          city: primary.city || address.city || "",
          state: primary.state || address.state || "",
        };
        const next = [...previous];
        next[primaryIndex] = filled;
        return next;
      });

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
      phone: phone ? toE164BR(phone) : null,
      email: email.trim() || null,
      notes: notes.trim() || null,
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
        active: draft.active,
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

  return (
    <div className="space-y-6 pb-6">
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

      <div className="space-y-4">
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
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => void handleLookupCnpj()}
                  disabled={cnpjStatus === "loading"}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
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
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Endereços</h2>
          <Button type="button" variant="outline" size="sm" onClick={addAddress}>
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar endereço
          </Button>
        </div>
        {addressesError ? (
          <p role="alert" className="text-xs text-destructive">
            {addressesError}
          </p>
        ) : null}
        {addresses.map((draft, index) => (
          <Card key={draft.clientId}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                {draft.is_primary ? <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" /> : null}
                Endereço {index + 1}
              </CardTitle>
              <div className="flex items-center gap-1">
                {!draft.is_primary ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPrimaryAddress(draft.clientId)}>
                    Definir como principal
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeAddress(draft.clientId)}
                  disabled={draft.is_primary && addresses.length > 1}
                  aria-label={`Remover endereço ${index + 1}`}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </CardHeader>
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
          </Card>
        ))}
      </section>

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
              <CardTitle className="flex items-center gap-1.5 text-sm">
                {draft.is_primary ? <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" /> : null}
                Contato {index + 1}
              </CardTitle>
              <div className="flex items-center gap-1">
                {!draft.is_primary ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPrimaryContact(draft.clientId)}>
                    Definir como principal
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeContact(draft.clientId)}
                  disabled={draft.is_primary && contacts.length > 1}
                  aria-label={`Remover contato ${index + 1}`}
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
              <div className="flex items-center justify-between gap-4">
                <label htmlFor={`contact-${draft.clientId}-active`} className="text-sm font-medium text-foreground">
                  Ativo
                </label>
                <Switch
                  id={`contact-${draft.clientId}-active`}
                  checked={draft.active}
                  onCheckedChange={(checked) =>
                    setContacts((previous) =>
                      previous.map((item) => (item.clientId === draft.clientId ? { ...item, active: checked } : item))
                    )
                  }
                />
              </div>
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
