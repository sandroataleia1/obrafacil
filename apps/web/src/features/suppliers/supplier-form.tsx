"use client";

/**
 * SUPPLY-FRONTEND-01A §37/§43/§65-66. Real API create/edit. `document`
 * is displayed masked (CPF/CNPJ) but sent digits-only; `phone` is
 * displayed BR-masked but sent E.164 — see `lib/document.ts`/
 * `supplier-phone.ts`. Outer-wrapper tenant-ownership pattern mirrors
 * `MaterialForm`/`ProjectEditForm`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { ApiValidationError } from "@/lib/api-client";
import { formatCpfCnpj, onlyDigits } from "@/lib/document";
import { useAuth } from "@/features/auth/auth-provider";
import { createSupplier, updateSupplier } from "./suppliers-client";
import { useSupplier } from "./use-supplier";
import { formatPhoneInput, supplierPhoneApiToInput, supplierPhoneInputToApi } from "./supplier-phone";
import type { Supplier } from "./types";

function fieldErrorFor(error: ApiValidationError, field: string): string | undefined {
  return error.errors[field]?.[0];
}

function SupplierFormInner({
  supplierId,
  onSuccess,
  onCancel,
  activeCompanyIdRef,
}: {
  supplierId?: string;
  onSuccess?: (supplier: Supplier) => void;
  onCancel?: () => void;
  activeCompanyIdRef: React.RefObject<string | undefined>;
}) {
  const router = useRouter();
  const { supplier: existingSupplier, error: loadError } = useSupplier(supplierId ?? "");
  const isEditing = Boolean(supplierId);

  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!existingSupplier) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingSupplier.name);
    setDocument(existingSupplier.document ? formatCpfCnpj(existingSupplier.document) : "");
    setContactName(existingSupplier.contact_name ?? "");
    setPhone(supplierPhoneApiToInput(existingSupplier.phone));
    setEmail(existingSupplier.email ?? "");
    setAddress(existingSupplier.address ?? "");
    setNotes(existingSupplier.notes ?? "");
    setActive(existingSupplier.active);
  }, [existingSupplier]);

  const submitCompanyId = activeCompanyIdRef.current;

  const handleSubmit = useCallback(async () => {
    if (name.trim() === "") {
      setError("Informe o nome do fornecedor.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setDocumentError(null);

    const payload = {
      name: name.trim(),
      document: document.trim() ? onlyDigits(document) : null,
      contact_name: contactName.trim() || null,
      phone: supplierPhoneInputToApi(phone),
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      const saved =
        isEditing && existingSupplier
          ? await updateSupplier(existingSupplier.id, { ...payload, active })
          : await createSupplier(payload);

      if (activeCompanyIdRef.current !== submitCompanyId) return;

      setSubmitting(false);
      if (onSuccess) {
        onSuccess(saved);
        return;
      }
      router.push(`/fornecedores/${saved.id}`);
    } catch (submitError) {
      if (activeCompanyIdRef.current !== submitCompanyId) return;
      setSubmitting(false);
      if (submitError instanceof ApiValidationError) {
        const documentMessage = fieldErrorFor(submitError, "document");
        if (documentMessage) {
          setDocumentError(documentMessage);
        }
        const phoneMessage = fieldErrorFor(submitError, "phone");
        const firstMessage = documentMessage ?? phoneMessage ?? Object.values(submitError.errors)[0]?.[0];
        setError(firstMessage ?? submitError.serverMessage ?? "Não foi possível salvar. Verifique os campos.");
        return;
      }
      setError("Não foi possível salvar agora. Tente novamente.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, document, contactName, phone, email, address, notes, active, isEditing, existingSupplier]);

  if (isEditing && existingSupplier === undefined && !loadError) return null;

  if (isEditing && loadError) {
    return (
      <div className="space-y-6">
        <BackHeader title="Fornecedor" onBack={() => router.push("/fornecedores")} />
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar este fornecedor agora.
          </p>
        </div>
      </div>
    );
  }

  if (isEditing && existingSupplier === null) {
    return (
      <div className="space-y-6">
        <BackHeader title="Fornecedor não encontrado" onBack={() => router.push("/fornecedores")} />
        <p className="pl-11 text-sm text-muted-foreground">Ele pode ter sido removido ou o link está incorreto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {onCancel ? null : (
        <div className="space-y-1">
          <BackHeader
            title={isEditing ? "Editar fornecedor" : "Novo fornecedor"}
            onBack={() => router.push(existingSupplier ? `/fornecedores/${existingSupplier.id}` : "/fornecedores")}
          />
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="supplier-name" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="supplier-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Casa dos Materiais Silva"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-document" className="text-sm font-medium text-foreground">
            CNPJ/CPF <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-document"
            type="text"
            inputMode="numeric"
            value={document}
            onChange={(event) => setDocument(formatCpfCnpj(event.target.value))}
            placeholder="00.000.000/0000-00"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          {documentError ? (
            <p role="alert" className="text-xs text-destructive">
              {documentError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-contact" className="text-sm font-medium text-foreground">
            Contato <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-contact"
            type="text"
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            placeholder="Roberto Silva"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-phone" className="text-sm font-medium text-foreground">
            Telefone <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-phone"
            type="text"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            placeholder="(11) 99999-9999"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-email" className="text-sm font-medium text-foreground">
            E-mail <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="contato@fornecedor.com.br"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-address" className="text-sm font-medium text-foreground">
            Endereço <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Av. Industrial, 450 - São Paulo/SP"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supplier-notes" className="text-sm font-medium text-foreground">
            Observação <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="supplier-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalhes adicionais"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {onCancel ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {isEditing ? "Salvar alterações" : "Salvar fornecedor"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="lg" onClick={() => void handleSubmit()} className="w-full" disabled={submitting}>
          {isEditing ? "Salvar alterações" : "Cadastrar fornecedor"}
        </Button>
      )}
    </div>
  );
}

export function SupplierForm({
  supplierId,
  onSuccess,
  onCancel,
}: {
  supplierId?: string;
  /** When provided (quick-create in a Dialog/Sheet), called with the saved Supplier instead of navigating. */
  onSuccess?: (supplier: Supplier) => void;
  /** When provided, renders a Cancelar action next to the submit button and hides the page-only BackHeader. */
  onCancel?: () => void;
}) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  return (
    <SupplierFormInner
      key={`${activeCompanyId}:${supplierId ?? "new"}`}
      supplierId={supplierId}
      onSuccess={onSuccess}
      onCancel={onCancel}
      activeCompanyIdRef={activeCompanyIdRef}
    />
  );
}
