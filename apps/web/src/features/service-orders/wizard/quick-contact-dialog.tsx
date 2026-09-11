"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { ContactFields, EMPTY_CONTACT_FIELDS, type ContactFieldsValue } from "@/features/customers/contact-fields";
import { createContact } from "@/features/customers/customers-client";
import type { CustomerContact } from "@/features/customers/types";
import { toE164BR } from "@/features/auth/phone-e164";
import { ApiValidationError } from "@/lib/api-client";

/** Quick "+ Novo contato" dialog for wizard step 2 — POSTs to the
 * canonical `/customers/{customer}/contacts` endpoint. Always sends
 * `active: true` (no toggle shown here); sends `is_primary: true` only
 * when this is the customer's very first contact. */
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
  const [contact, setContact] = useState<ContactFieldsValue>(EMPTY_CONTACT_FIELDS);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function handleOpenChange(next: boolean) {
    if (!next) {
      setContact(EMPTY_CONTACT_FIELDS);
      setSubmitError(null);
      setFieldErrors({});
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (contact.name.trim() === "") return;
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
