"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { ContactFields, EMPTY_CONTACT_FIELDS, type ContactFieldsValue } from "@/features/customers/contact-fields";
import { useAuth } from "@/features/auth/auth-provider";
import { createContact } from "@/features/customers/customers-client";
import type { CustomerContact } from "@/features/customers/types";
import { toE164BR } from "@/features/auth/phone-e164";
import { ApiValidationError } from "@/lib/api-client";

/** Quick "+ Novo contato" dialog for wizard step 2 — POSTs to the
 * canonical `/customers/{customer}/contacts` endpoint. Always sends
 * `active: true` (no toggle shown here); sends `is_primary: true` only
 * when this is the customer's very first contact.
 *
 * §Tenant safety: same self-sufficient rule as `QuickCustomerDialog`. */
export function QuickContactDialog({
  open,
  onOpenChange,
  customerId,
  isFirstContact,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  isFirstContact: boolean;
  onCreated: (contact: CustomerContact) => void;
}) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const [contact, setContact] = useState<ContactFieldsValue>(EMPTY_CONTACT_FIELDS);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setContact(EMPTY_CONTACT_FIELDS);
    setSubmitError(null);
    setFieldErrors({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const openedCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    if (open) openedCompanyIdRef.current = activeCompanyId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (openedCompanyIdRef.current !== activeCompanyId) {
      reset();
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, open]);

  async function handleSubmit() {
    if (contact.name.trim() === "") return;
    const requestCompanyIdAtSubmit = activeCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const created = await createContact(customerId, {
        name: contact.name.trim(),
        role: contact.role || null,
        department: contact.department || null,
        phone: contact.phone ? toE164BR(contact.phone) : null,
        whatsapp: contact.whatsapp ? toE164BR(contact.whatsapp) : null,
        email: contact.email || null,
        notes: contact.notes || null,
        is_primary: isFirstContact,
        active: true,
      });
      if (activeCompanyIdRef.current !== requestCompanyIdAtSubmit) return;
      onCreated(created);
      handleOpenChange(false);
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
      } else {
        setSubmitError("Não foi possível criar o contato agora.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Novo contato"
      showClose
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || contact.name.trim() === ""}>
            {submitting ? "Criando..." : "Criar contato"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-1">
        <ContactFields value={contact} onChange={(patch) => setContact((current) => ({ ...current, ...patch }))} idPrefix="quick-contact" />
        {fieldErrors.name?.[0] ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldErrors.name[0]}
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
