"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { AddressFields, EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "@/features/customers/address-fields";
import { useAuth } from "@/features/auth/auth-provider";
import { createCustomer, lookupCnpj } from "@/features/customers/customers-client";
import type { Customer, CustomerKind } from "@/features/customers/types";
import { toE164BR } from "@/features/auth/phone-e164";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatCnpj, formatCpf, formatE164PhoneForDisplay, onlyDigits } from "@/lib/document";
import { formatPhoneInput } from "@/lib/phone";

/**
 * Quick "+ Novo cliente" dialog for wizard step 1. Sends Customer + a
 * single primary address in ONE atomic POST (`addresses: [...]`) — the
 * wizard must never end up with a customer that has zero addresses,
 * unlike the standalone Customer create page which allows it. No contact
 * fields here — contact selection belongs to step 2.
 *
 * §Tenant safety: this dialog is self-sufficient — it reads the active
 * company itself (`useAuth()`) rather than trusting a prop captured at
 * some earlier render. The company is captured fresh at the moment
 * "Criar cliente" is actually clicked and re-checked against the live
 * active company once `createCustomer` resolves; a mismatch means the
 * company switched while the request was in flight, so `onCreated` is
 * never called (the created Customer+Address row is still correct and
 * stays in the old company's data — it just never enters a different
 * tenant's wizard draft). The dialog also closes and resets itself if
 * the active company changes while it's open, even before submit.
 */
export function QuickCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: Customer) => void;
}) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const [kind, setKind] = useState<CustomerKind>("individual");
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<AddressFieldsValue>({
    ...EMPTY_ADDRESS_FIELDS,
    label: "Endereço principal",
  });

  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setKind("individual");
    setName("");
    setDocument("");
    setPhone("");
    setEmail("");
    setAddress({ ...EMPTY_ADDRESS_FIELDS, label: "Endereço principal" });
    setCnpjStatus("idle");
    setCnpjMessage(null);
    setSubmitError(null);
    setFieldErrors({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  // Baseline company id captured whenever the dialog opens.
  const openedCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    if (open) openedCompanyIdRef.current = activeCompanyId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // If the active company changes WHILE the dialog is open, close and
  // reset it — no Company-A-typed value may survive into a Company-B
  // session even if the user hasn't submitted yet.
  useEffect(() => {
    if (!open) return;
    if (openedCompanyIdRef.current !== activeCompanyId) {
      reset();
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, open]);

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
      setName((current) => current || result.trade_name || result.legal_name);
      setPhone((current) => current || (result.phone ? formatE164PhoneForDisplay(result.phone) : ""));
      setEmail((current) => current || result.email || "");
      setAddress((current) => ({
        ...current,
        postal_code: current.postal_code || result.address.postal_code || "",
        street: current.street || result.address.street || "",
        number: current.number || result.address.number || "",
        complement: current.complement || result.address.complement || "",
        neighborhood: current.neighborhood || result.address.neighborhood || "",
        city: current.city || result.address.city || "",
        state: current.state || result.address.state || "",
      }));
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
    if (name.trim() === "") return;
    // Captured at the moment of the actual submit click — not from a
    // prop passed down at an earlier render, which can go stale if the
    // user types for a while before clicking.
    const requestCompanyIdAtSubmit = activeCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const created = await createCustomer({
        kind,
        name: name.trim(),
        document: onlyDigits(document) || null,
        phone: phone ? toE164BR(phone) : null,
        email: email.trim() || null,
        addresses: [
          {
            label: address.label || "Endereço principal",
            type: address.type,
            postal_code: address.postal_code || null,
            street: address.street || null,
            number: address.number || null,
            complement: address.complement || null,
            neighborhood: address.neighborhood || null,
            city: address.city || null,
            state: address.state || null,
            reference_point: address.reference_point || null,
            is_primary: true,
          },
        ],
      });
      if (activeCompanyIdRef.current !== requestCompanyIdAtSubmit) {
        // The company changed while the request was in flight — the
        // created Customer+Address stays in the old company's data
        // permanently; it just never enters this (now different)
        // tenant's wizard draft. Discard quietly.
        return;
      }
      onCreated(created);
      handleOpenChange(false);
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

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Novo cliente"
      showClose
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || name.trim() === ""}>
            {submitting ? "Criando..." : "Criar cliente"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind("individual")}
            aria-pressed={kind === "individual"}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${kind === "individual" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"}`}
          >
            Pessoa física
          </button>
          <button
            type="button"
            onClick={() => setKind("company")}
            aria-pressed={kind === "company"}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${kind === "company" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"}`}
          >
            Pessoa jurídica
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="quick-customer-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="quick-customer-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {fieldErrors.name?.[0] ? (
            <p role="alert" className="text-xs text-destructive">
              {fieldErrors.name[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="quick-customer-document" className="text-sm font-medium text-foreground">
            {kind === "company" ? "CNPJ" : "CPF"} <span className="text-muted-foreground">(opcional)</span>
          </label>
          <div className="flex gap-2">
            <input
              id="quick-customer-document"
              type="text"
              inputMode="numeric"
              value={kind === "company" ? formatCnpj(document) : formatCpf(document)}
              onChange={(event) =>
                setDocument(onlyDigits(event.target.value).slice(0, kind === "company" ? 14 : 11))
              }
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
            {kind === "company" ? (
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
            ) : null}
          </div>
          {fieldErrors.document?.[0] ? (
            <p role="alert" className="text-xs text-destructive">
              {fieldErrors.document[0]}
            </p>
          ) : cnpjMessage ? (
            <p role="alert" className="text-xs text-destructive">
              {cnpjMessage}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="quick-customer-phone" className="text-sm font-medium text-foreground">
            Telefone <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="quick-customer-phone"
            type="text"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="quick-customer-email" className="text-sm font-medium text-foreground">
            E-mail <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="quick-customer-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <h3 className="text-sm font-semibold text-foreground">Endereço principal</h3>
          <AddressFields value={address} onChange={(patch) => setAddress((current) => ({ ...current, ...patch }))} idPrefix="quick-customer-address" />
        </div>

        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
