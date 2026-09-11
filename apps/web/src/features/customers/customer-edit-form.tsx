"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Users } from "lucide-react";

import { BackLink } from "@/components/shared/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth-provider";
import { toE164BR } from "@/features/auth/phone-e164";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatCnpj, formatCpf, formatE164PhoneForDisplay, onlyDigits } from "@/lib/document";
import { formatPhoneInput } from "@/lib/phone";
import { getCustomer, lookupCnpj, updateCustomer } from "./customers-client";
import type { Customer, CustomerKind, CustomerUpdatePayload } from "./types";

function firstError(errors: Record<string, string[]>, key: string): string | null {
  return errors[key]?.[0] ?? null;
}

export function CustomerEditForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [status, setStatus] = useState<"loading" | "success" | "error" | "not_found">("loading");
  const [original, setOriginal] = useState<Customer | null>(null);
  // §7/§10: the tenant `original` actually belongs to — the form fields
  // must never render as editable unless this matches activeCompanyId,
  // not even for a single frame between a context change and this
  // effect running.
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | undefined>(undefined);
  // FRONTEND-CLIENTS-01C: the tenant the *current* status outcome actually
  // belongs to — set on every settled outcome (success, 404, or error),
  // unlike `loadedCompanyId` (success only). Without this, a failed GET
  // never sets any per-tenant marker, so `!isCurrentTenant` stays true
  // forever and the loading skeleton masks the error state permanently.
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | undefined>(undefined);

  // §11: guards against a slower earlier tenant's GET resolving after a
  // faster later one and repopulating this form with the wrong tenant's
  // Customer.
  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const [kind, setKind] = useState<CustomerKind>("individual");
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    // §10: never keep the previous tenant's form populated while the new
    // GET is in flight — invalidate immediately.
    setStatus("loading");
    setOriginal(null);
    try {
      const customer = await getCustomer(customerId);
      if (requestSequence.current !== requestId) return;
      // §7: read the *current* activeCompanyId at completion time, not the
      // one captured in this closure.
      if (activeCompanyIdRef.current !== requestCompanyId) return;
      setOriginal(customer);
      setLoadedCompanyId(requestCompanyId);
      setResolvedCompanyId(requestCompanyId);
      setKind(customer.kind);
      setName(customer.name);
      setLegalName(customer.legal_name ?? "");
      setTradeName(customer.trade_name ?? "");
      setDocument(customer.document ?? "");
      setPhone(customer.phone ? formatE164PhoneForDisplay(customer.phone) : "");
      setEmail(customer.email ?? "");
      setNotes(customer.notes ?? "");
      setActive(customer.active);
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
    // §10: a company switch must always trigger a fresh GET, even though
    // `customerId` alone didn't change.
  }, [customerId, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // §7: the only loaded form this render is allowed to show as editable —
  // data still tagged with a previous tenant is treated as absent.
  const isCurrentTenant = original !== null && loadedCompanyId === activeCompanyId;
  // FRONTEND-CLIENTS-01C §9: whether the *last settled outcome* (success,
  // 404, or error) belongs to the tenant currently active — deliberately
  // never satisfied by two `undefined`s (before the very first request
  // resolves, both sides are `undefined`, and that must still render the
  // loading skeleton, not "resolved").
  const isResolvedForCurrentTenant = resolvedCompanyId !== undefined && resolvedCompanyId === activeCompanyId;

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
      setPhone((current) => current || (result.phone ? formatE164PhoneForDisplay(result.phone) : ""));
      setEmail((current) => current || result.email || "");
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
    if (name.trim() === "" || saving) return;

    setSaving(true);
    setSaveError(null);
    setFieldErrors({});

    const payload: CustomerUpdatePayload = {
      kind,
      name: name.trim(),
      legal_name: legalName.trim() || null,
      trade_name: tradeName.trim() || null,
      document: onlyDigits(document) || null,
      phone: phone ? toE164BR(phone) : null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      active,
    };

    try {
      await updateCustomer(customerId, payload);
      router.push(`/clientes/${customerId}`);
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
      } else {
        setSaveError("Não foi possível salvar as alterações agora.");
      }
    } finally {
      setSaving(false);
    }
  }

  // FRONTEND-CLIENTS-01C §9: loading/tenant-mismatch is checked first —
  // before `status === "error"` masked it forever, since a failed request
  // never set any per-tenant marker and `!isCurrentTenant` (original-based)
  // was therefore permanently true. `isResolvedForCurrentTenant` now covers
  // every settled outcome (success, 404, error), so this only stays true
  // while the current tenant's request is genuinely still in flight.
  if (status === "loading" || !isResolvedForCurrentTenant) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <span className="sr-only">Carregando cliente</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <EmptyState icon={Users} title="Cliente não encontrado" description="Ele pode ter sido removido ou o link está incorreto." />
    );
  }

  if (status === "error" || !original || !isCurrentTenant) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar este cliente agora.
        </p>
        <Button type="button" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <BackLink title="Editar cliente" icon={Users} href={`/clientes/${customerId}`} />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="edit-name" className="text-sm font-medium text-foreground">
            {kind === "company" ? "Nome para identificação" : "Nome"}
          </label>
          <input
            id="edit-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {firstError(fieldErrors, "name") ? (
            <p role="alert" className="text-xs text-destructive">
              {firstError(fieldErrors, "name")}
            </p>
          ) : null}
        </div>

        {kind === "company" ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="edit-document" className="text-sm font-medium text-foreground">
                CNPJ <span className="text-muted-foreground">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="edit-document"
                  type="text"
                  inputMode="numeric"
                  value={formatCnpj(document)}
                  onChange={(event) => setDocument(onlyDigits(event.target.value).slice(0, 14))}
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
              <p className="text-xs text-muted-foreground">
                Dados de endereço encontrados na busca não alteram endereços já cadastrados — edite ou adicione um
                endereço para utilizá-los.
              </p>
              {firstError(fieldErrors, "document") ? (
                <p role="alert" className="text-xs text-destructive">
                  {firstError(fieldErrors, "document")}
                </p>
              ) : cnpjMessage ? (
                <p role="alert" className="text-xs text-destructive">
                  {cnpjMessage}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-legal-name" className="text-sm font-medium text-foreground">
                Razão social <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="edit-legal-name"
                type="text"
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-trade-name" className="text-sm font-medium text-foreground">
                Nome fantasia <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="edit-trade-name"
                type="text"
                value={tradeName}
                onChange={(event) => setTradeName(event.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="edit-document" className="text-sm font-medium text-foreground">
              CPF <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="edit-document"
              type="text"
              inputMode="numeric"
              value={formatCpf(document)}
              onChange={(event) => setDocument(onlyDigits(event.target.value).slice(0, 11))}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
            {firstError(fieldErrors, "document") ? (
              <p role="alert" className="text-xs text-destructive">
                {firstError(fieldErrors, "document")}
              </p>
            ) : null}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="edit-phone" className="text-sm font-medium text-foreground">
            Telefone <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="edit-phone"
            type="text"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {firstError(fieldErrors, "phone") ? (
            <p role="alert" className="text-xs text-destructive">
              {firstError(fieldErrors, "phone")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-email" className="text-sm font-medium text-foreground">
            E-mail <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="edit-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {firstError(fieldErrors, "email") ? (
            <p role="alert" className="text-xs text-destructive">
              {firstError(fieldErrors, "email")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-notes" className="text-sm font-medium text-foreground">
            Observações <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="edit-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <label htmlFor="edit-active" className="text-sm font-medium text-foreground">
            Cliente ativo
          </label>
          <Switch id="edit-active" checked={active} onCheckedChange={setActive} />
        </div>
      </div>

      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => router.push(`/clientes/${customerId}`)}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={name.trim() === "" || saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
