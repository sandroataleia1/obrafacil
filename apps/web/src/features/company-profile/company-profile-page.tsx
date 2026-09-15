"use client";

/**
 * FRONTEND-COMPANY-PROFILE-01 — /configuracoes/empresa.
 *
 * §14/§15: tenant fail-closed via the wrapper/remount pattern already
 * hardened for `CustomerCreateForm`/`BudgetForm` — `CompanyProfilePage`
 * (this file's default export) never itself remounts; it owns
 * `activeCompanyIdRef`, kept in sync via `useLayoutEffect` (synchronous,
 * pre-paint), and renders `CompanyProfilePageInner` keyed by
 * `activeCompanyId` so a Company switch destroys the ENTIRE old instance
 * (every field, every in-flight lookup's local state) and mounts a
 * genuinely fresh one for the new Company in the same render. Async
 * continuations from the old (now-unmounted) instance — a late GET, a
 * late PUT, a late CNPJ/CEP lookup, a late logo upload/delete — still
 * carry `activeCompanyIdRef` from their closure, so a non-state side
 * effect (specifically `auth.refresh()` on save success) is guarded
 * explicitly even though state updates on an unmounted instance are
 * already no-ops.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { Building2, ImageOff, Loader2, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/shared/back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-provider";
import { lookupCnpj } from "@/features/customers/customers-client";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { formatCnpj, formatE164PhoneForDisplay, onlyDigits } from "@/lib/document";
import { digitsOnly, formatPhoneInput } from "@/lib/phone";
import { toE164BR } from "@/features/auth/phone-e164";
import { CompanyAddressFields, type CompanyAddressFieldsValue } from "./company-address-fields";
import { deleteCompanyLogo, getCompanyProfile, updateCompanyProfile, uploadCompanyLogo } from "./company-profile-client";
import type { CompanyProfile, CompanyProfileUpdatePayload } from "./types";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const CURATED_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Sao_Paulo", label: "Brasília (America/Sao_Paulo)" },
  { value: "America/Manaus", label: "Manaus (America/Manaus)" },
  { value: "America/Cuiaba", label: "Cuiabá (America/Cuiaba)" },
  { value: "America/Rio_Branco", label: "Rio Branco (America/Rio_Branco)" },
  { value: "America/Noronha", label: "Fernando de Noronha (America/Noronha)" },
];

function timezoneOptions(current: string): { value: string; label: string }[] {
  if (CURATED_TIMEZONES.some((option) => option.value === current)) return CURATED_TIMEZONES;
  // §31: a valid-but-uncurated value returned by the API is never
  // silently dropped from the list — it stays selected/visible.
  return [{ value: current, label: current }, ...CURATED_TIMEZONES];
}

function canEditProfile(
  memberships: { company: { id: string }; role: "owner" | "admin" | "member" }[],
  activeCompanyId: string | undefined
): boolean {
  if (!activeCompanyId) return false;
  const membership = memberships.find((entry) => entry.company.id === activeCompanyId);
  return membership !== undefined && (membership.role === "owner" || membership.role === "admin");
}

export function CompanyProfilePage() {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const canEdit = canEditProfile(auth.memberships, activeCompanyId);

  return (
    <CompanyProfilePageInner
      key={activeCompanyId ?? "no-company"}
      activeCompanyId={activeCompanyId}
      activeCompanyIdRef={activeCompanyIdRef}
      canEdit={canEdit}
    />
  );
}

interface FormFields {
  name: string;
  legalName: string;
  tradeName: string;
  documentDigits: string;
  phoneDigits: string;
  whatsappDigits: string;
  email: string;
  address: CompanyAddressFieldsValue;
  timezone: string;
}

function hydrateForm(profile: CompanyProfile): FormFields {
  return {
    name: profile.name,
    legalName: profile.legal_name ?? "",
    tradeName: profile.trade_name ?? "",
    documentDigits: profile.document ?? "",
    phoneDigits: profile.phone ? digitsOnly(formatE164PhoneForDisplay(profile.phone)) : "",
    whatsappDigits: profile.whatsapp ? digitsOnly(formatE164PhoneForDisplay(profile.whatsapp)) : "",
    email: profile.email ?? "",
    address: {
      postal_code: profile.address.postal_code ?? "",
      street: profile.address.street ?? "",
      number: profile.address.number ?? "",
      complement: profile.address.complement ?? "",
      neighborhood: profile.address.neighborhood ?? "",
      city: profile.address.city ?? "",
      state: profile.address.state ?? "",
      reference_point: profile.address.reference_point ?? "",
    },
    timezone: profile.timezone,
  };
}

function nullableTrim(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function buildUpdatePayload(form: FormFields): CompanyProfileUpdatePayload {
  return {
    name: form.name.trim(),
    legal_name: nullableTrim(form.legalName),
    trade_name: nullableTrim(form.tradeName),
    document: form.documentDigits || null,

    phone: form.phoneDigits ? toE164BR(form.phoneDigits) : null,
    whatsapp: form.whatsappDigits ? toE164BR(form.whatsappDigits) : null,
    email: nullableTrim(form.email),

    postal_code: form.address.postal_code || null,
    street: nullableTrim(form.address.street),
    number: nullableTrim(form.address.number),
    complement: nullableTrim(form.address.complement),
    neighborhood: nullableTrim(form.address.neighborhood),
    city: nullableTrim(form.address.city),
    state: form.address.state || null,
    reference_point: nullableTrim(form.address.reference_point),

    timezone: form.timezone,
  };
}

function CompanyProfilePageInner({
  activeCompanyId,
  activeCompanyIdRef,
  canEdit,
}: {
  activeCompanyId: string | undefined;
  activeCompanyIdRef: MutableRefObject<string | undefined>;
  canEdit: boolean;
}) {
  const auth = useAuth();

  const isStaleRequest = useCallback(
    (requestCompanyId: string | undefined) => activeCompanyIdRef.current !== requestCompanyId,
    [activeCompanyIdRef]
  );

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const requestSequence = useRef(0);

  const [form, setForm] = useState<FormFields | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);
  const cnpjLookupGenerationRef = useRef(0);

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDeleting, setLogoDeleting] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [confirmingLogoDelete, setConfirmingLogoDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setStatus("loading");

    getCompanyProfile()
      .then((found) => {
        if (requestSequence.current !== requestId) return;
        if (isStaleRequest(requestCompanyId)) return;
        setProfile(found);
        setForm(hydrateForm(found));
        setStatus("success");
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (isStaleRequest(requestCompanyId)) return;
        setStatus("error");
      });
  }, [activeCompanyId, isStaleRequest]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm(patch: Partial<FormFields>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function updateAddress(patch: Partial<CompanyAddressFieldsValue>) {
    setForm((current) => (current ? { ...current, address: { ...current.address, ...patch } } : current));
  }

  function handleDocumentChange(nextDigits: string) {
    cnpjLookupGenerationRef.current += 1;
    setCnpjStatus("idle");
    setCnpjMessage(null);
    updateForm({ documentDigits: nextDigits });
  }

  async function handleLookupCnpj() {
    if (!form) return;
    const digits = form.documentDigits;
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

      // §22: only ever fills EMPTY fields, never overwrites what the user
      // already has/typed — and NEVER touches `name` (the workspace
      // display name, a deliberate user choice, not a CNPJ-derived fact).
      setForm((current) => {
        if (!current) return current;
        return {
          ...current,
          legalName: current.legalName || result.legal_name,
          tradeName: current.tradeName || result.trade_name || "",
          phoneDigits: current.phoneDigits || (result.phone ? digitsOnly(formatE164PhoneForDisplay(result.phone)) : ""),
          email: current.email || result.email || "",
          address: {
            ...current.address,
            postal_code: current.address.postal_code || result.address.postal_code || "",
            street: current.address.street || result.address.street || "",
            number: current.address.number || result.address.number || "",
            complement: current.address.complement || result.address.complement || "",
            neighborhood: current.address.neighborhood || result.address.neighborhood || "",
            city: current.address.city || result.address.city || "",
            state: current.address.state || result.address.state || "",
          },
        };
      });
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

  async function handleSubmit() {
    if (!form || !canEdit || saving || form.name.trim() === "") return;

    const requestCompanyId = activeCompanyId;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    setSavedJustNow(false);

    try {
      const updated = await updateCompanyProfile(buildUpdatePayload(form));
      if (isStaleRequest(requestCompanyId)) return;

      // §34: the server response is the new canonical state.
      setProfile(updated);
      setForm(hydrateForm(updated));
      setSavedJustNow(true);

      // §35: renew /me so activeCompany.name/membership.company.name
      // (shown elsewhere — nav/shell/company switcher) never keep
      // showing a stale name after a successful rename. Only when this
      // request's Company is still the active one (§36) — a stale
      // success for a Company the user has since left must never touch
      // Auth as a visual side effect of the NEW tenant.
      await auth.refresh();
    } catch (caught) {
      if (isStaleRequest(requestCompanyId)) return;

      if (caught instanceof ApiValidationError) {
        setFieldErrors(caught.errors);
      } else if (caught instanceof ApiError && caught.status === 403) {
        setSaveError("Você não tem permissão para alterar o perfil da empresa.");
      } else if (caught instanceof ApiError) {
        setSaveError(caught.message || "Não foi possível salvar as alterações.");
      } else {
        setSaveError("Não foi possível salvar. Verifique sua conexão e tente novamente.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setSaving(false);
    }
  }

  function validateLogoFileLocally(file: File): string | null {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      return "Envie um arquivo PNG, JPG ou WebP.";
    }
    if (file.size > MAX_LOGO_BYTES) {
      return "O arquivo deve ter no máximo 2 MB.";
    }
    return null;
  }

  async function handleLogoFileSelected(file: File) {
    const clientError = validateLogoFileLocally(file);
    if (clientError) {
      setLogoError(clientError);
      return;
    }

    const requestCompanyId = activeCompanyId;
    setLogoUploading(true);
    setLogoError(null);
    try {
      const updated = await uploadCompanyLogo(file);
      if (isStaleRequest(requestCompanyId)) return;
      setProfile(updated);
    } catch (error) {
      if (isStaleRequest(requestCompanyId)) return;
      if (error instanceof ApiValidationError) {
        setLogoError(error.errors.logo?.[0] ?? "Não foi possível enviar a logo.");
      } else if (error instanceof ApiError && error.status === 403) {
        setLogoError("Você não tem permissão para alterar o perfil da empresa.");
      } else {
        setLogoError("Não foi possível enviar a logo agora.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setLogoUploading(false);
    }
  }

  async function handleDeleteLogo() {
    const requestCompanyId = activeCompanyId;
    setLogoDeleting(true);
    setLogoError(null);
    try {
      const updated = await deleteCompanyLogo();
      if (isStaleRequest(requestCompanyId)) return;
      setProfile(updated);
    } catch (error) {
      if (isStaleRequest(requestCompanyId)) return;
      if (error instanceof ApiError && error.status === 403) {
        setLogoError("Você não tem permissão para alterar o perfil da empresa.");
      } else {
        setLogoError("Não foi possível remover a logo agora.");
      }
    } finally {
      if (!isStaleRequest(requestCompanyId)) setLogoDeleting(false);
      setConfirmingLogoDelete(false);
    }
  }

  if (status === "error") {
    return (
      <div className="max-w-3xl space-y-6">
        <BackLink title="Erro ao carregar" href="/configuracoes" icon={Building2} />
        <p className="text-sm text-destructive">Não foi possível carregar o perfil da empresa.</p>
        <Button type="button" variant="outline" onClick={() => load()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (status === "loading" || !profile || !form) {
    return (
      <div className="max-w-3xl space-y-4" role="status" aria-busy="true">
        <span className="sr-only">Carregando perfil da empresa</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 pb-24 md:pb-6">
      <BackLink
        title="Empresa"
        description="Dados comerciais, endereço, logo e configurações regionais."
        icon={Building2}
        href="/configuracoes"
      />

      {!canEdit ? (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Somente proprietários e administradores podem alterar estes dados.
        </p>
      ) : null}

      {/* ============ Identidade ============ */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Identidade</h2>
          <p className="text-xs text-muted-foreground">
            &ldquo;Nome da empresa&rdquo; é o nome mostrado no sistema. Razão social e nome fantasia aparecem em
            documentos e propostas.
          </p>
        </div>

        {canEdit ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="company-name" className="text-sm font-medium text-foreground">
                Nome da empresa *
              </label>
              <input
                id="company-name"
                type="text"
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              {fieldErrors.name ? <p className="text-sm text-destructive">{fieldErrors.name[0]}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="company-legal-name" className="text-sm font-medium text-foreground">
                Razão social <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="company-legal-name"
                type="text"
                value={form.legalName}
                onChange={(event) => updateForm({ legalName: event.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              {fieldErrors.legal_name ? <p className="text-sm text-destructive">{fieldErrors.legal_name[0]}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="company-trade-name" className="text-sm font-medium text-foreground">
                Nome fantasia <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="company-trade-name"
                type="text"
                value={form.tradeName}
                onChange={(event) => updateForm({ tradeName: event.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              {fieldErrors.trade_name ? <p className="text-sm text-destructive">{fieldErrors.trade_name[0]}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="company-document" className="text-sm font-medium text-foreground">
                CNPJ <span className="text-muted-foreground">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="company-document"
                  type="text"
                  inputMode="numeric"
                  value={formatCnpj(form.documentDigits)}
                  onChange={(event) => handleDocumentChange(onlyDigits(event.target.value).slice(0, 14))}
                  placeholder="12.345.678/0001-90"
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => void handleLookupCnpj()}
                  disabled={cnpjStatus === "loading"}
                  aria-label="Buscar CNPJ"
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
              {cnpjMessage ? (
                <p role="alert" className="text-xs text-destructive">
                  {cnpjMessage}
                </p>
              ) : null}
              {fieldErrors.document ? <p className="text-sm text-destructive">{fieldErrors.document[0]}</p> : null}
            </div>
          </>
        ) : (
          <ReadonlyField label="Nome da empresa" value={profile.name} />
        )}
        {!canEdit ? (
          <>
            <ReadonlyField label="Razão social" value={profile.legal_name} />
            <ReadonlyField label="Nome fantasia" value={profile.trade_name} />
            <ReadonlyField label="CNPJ" value={profile.document ? formatCnpj(profile.document) : null} />
          </>
        ) : null}
      </section>

      {/* ============ Contato ============ */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Contato</h2>

        {canEdit ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="company-phone" className="text-sm font-medium text-foreground">
                Telefone <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="company-phone"
                type="text"
                inputMode="tel"
                value={formatPhoneInput(form.phoneDigits)}
                onChange={(event) => updateForm({ phoneDigits: digitsOnly(event.target.value) })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              {fieldErrors.phone ? <p className="text-sm text-destructive">{fieldErrors.phone[0]}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="company-whatsapp" className="text-sm font-medium text-foreground">
                WhatsApp <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="company-whatsapp"
                type="text"
                inputMode="tel"
                value={formatPhoneInput(form.whatsappDigits)}
                onChange={(event) => updateForm({ whatsappDigits: digitsOnly(event.target.value) })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              {fieldErrors.whatsapp ? <p className="text-sm text-destructive">{fieldErrors.whatsapp[0]}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="company-email" className="text-sm font-medium text-foreground">
                E-mail <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="company-email"
                type="email"
                value={form.email}
                onChange={(event) => updateForm({ email: event.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              {fieldErrors.email ? <p className="text-sm text-destructive">{fieldErrors.email[0]}</p> : null}
            </div>
          </>
        ) : (
          <>
            <ReadonlyField label="Telefone" value={profile.phone ? formatE164PhoneForDisplay(profile.phone) : null} />
            <ReadonlyField label="WhatsApp" value={profile.whatsapp ? formatE164PhoneForDisplay(profile.whatsapp) : null} />
            <ReadonlyField label="E-mail" value={profile.email} />
          </>
        )}
      </section>

      {/* ============ Endereço ============ */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Endereço</h2>

        {canEdit ? (
          <>
            <CompanyAddressFields idPrefix="company-address" value={form.address} onChange={updateAddress} />
            {fieldErrors.postal_code ? <p className="text-sm text-destructive">{fieldErrors.postal_code[0]}</p> : null}
            {fieldErrors.street ? <p className="text-sm text-destructive">{fieldErrors.street[0]}</p> : null}
            {fieldErrors.number ? <p className="text-sm text-destructive">{fieldErrors.number[0]}</p> : null}
            {fieldErrors.complement ? <p className="text-sm text-destructive">{fieldErrors.complement[0]}</p> : null}
            {fieldErrors.neighborhood ? <p className="text-sm text-destructive">{fieldErrors.neighborhood[0]}</p> : null}
            {fieldErrors.city ? <p className="text-sm text-destructive">{fieldErrors.city[0]}</p> : null}
            {fieldErrors.state ? <p className="text-sm text-destructive">{fieldErrors.state[0]}</p> : null}
            {fieldErrors.reference_point ? (
              <p className="text-sm text-destructive">{fieldErrors.reference_point[0]}</p>
            ) : null}
          </>
        ) : (
          <>
            <ReadonlyField
              label="CEP"
              value={profile.address.postal_code ? `${profile.address.postal_code.slice(0, 5)}-${profile.address.postal_code.slice(5)}` : null}
            />
            <ReadonlyField label="Logradouro" value={profile.address.street} />
            <ReadonlyField label="Número" value={profile.address.number} />
            <ReadonlyField label="Complemento" value={profile.address.complement} />
            <ReadonlyField label="Bairro" value={profile.address.neighborhood} />
            <ReadonlyField label="Cidade" value={profile.address.city} />
            <ReadonlyField label="UF" value={profile.address.state} />
            <ReadonlyField label="Ponto de referência" value={profile.address.reference_point} />
          </>
        )}
      </section>

      {/* ============ Configurações regionais ============ */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Configurações regionais</h2>

        {canEdit ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Fuso horário</span>
            <Select value={form.timezone} onValueChange={(next) => next && updateForm({ timezone: next })}>
              <SelectTrigger id="company-timezone" className="h-12 w-full px-4 text-base">
                <SelectValue placeholder="Selecione o fuso horário" />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions(form.timezone).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.timezone ? <p className="text-sm text-destructive">{fieldErrors.timezone[0]}</p> : null}
          </div>
        ) : (
          <ReadonlyField label="Fuso horário" value={profile.timezone} />
        )}
      </section>

      {/* ============ Logo ============ */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Logo da empresa</h2>
          <p className="text-xs text-muted-foreground">Esta logo será usada nas propostas e documentos da empresa.</p>
        </div>

        <div className="flex items-center gap-4">
          {profile.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logo_url}
              alt="Logo da empresa"
              className="size-20 shrink-0 rounded-xl border border-border object-contain"
            />
          ) : (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-muted-foreground">
              <ImageOff className="size-6" aria-hidden="true" />
            </div>
          )}

          {canEdit ? (
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleLogoFileSelected(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoUploading || logoDeleting}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  {logoUploading ? "Enviando..." : "Escolher logo"}
                </Button>
                {profile.logo_url ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logoUploading || logoDeleting}
                    onClick={() => setConfirmingLogoDelete(true)}
                  >
                    {logoDeleting ? "Removendo..." : "Remover logo"}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG ou WebP · máximo 2 MB.</p>
              {logoError ? (
                <p role="alert" className="text-sm text-destructive">
                  {logoError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {confirmingLogoDelete ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm text-foreground">Remover a logo da empresa?</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingLogoDelete(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={() => void handleDeleteLogo()} disabled={logoDeleting}>
                {logoDeleting ? "Removendo..." : "Confirmar remoção"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {canEdit ? (
        <div className="space-y-3">
          {savedJustNow ? <p className="text-sm text-primary">Perfil atualizado.</p> : null}
          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={saving || form.name.trim() === ""}
            onClick={() => void handleSubmit()}
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value && value.trim() !== "" ? value : "—"}</p>
    </div>
  );
}
