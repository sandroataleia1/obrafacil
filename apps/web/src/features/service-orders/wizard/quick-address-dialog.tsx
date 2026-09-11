"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { AddressFields, EMPTY_ADDRESS_FIELDS, type AddressFieldsValue } from "@/features/customers/address-fields";
import { useAuth } from "@/features/auth/auth-provider";
import { createAddress } from "@/features/customers/customers-client";
import type { CustomerAddress } from "@/features/customers/types";
import { ApiValidationError } from "@/lib/api-client";

/** Quick "+ Novo endereço" dialog for wizard step 2 — POSTs to the
 * canonical `/customers/{customer}/addresses` endpoint. Never marks the
 * new address as primary automatically (that stays whatever the backend
 * defaults to) — the wizard auto-selects it as the execution address
 * regardless of `is_primary`.
 *
 * §Tenant safety: same self-sufficient rule as `QuickCustomerDialog` —
 * the company is captured fresh at the "Criar endereço" click and
 * re-checked against the live active company once `createAddress`
 * resolves; a mismatch discards the result silently. The dialog also
 * closes and resets itself if the active company changes while open. */
export function QuickAddressDialog({
  open,
  onOpenChange,
  customerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  onCreated: (address: CustomerAddress) => void;
}) {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const [address, setAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS_FIELDS);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setAddress(EMPTY_ADDRESS_FIELDS);
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
    if (address.label.trim() === "") return;
    const requestCompanyIdAtSubmit = activeCompanyId;
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const created = await createAddress(customerId, {
        label: address.label.trim(),
        type: address.type,
        postal_code: address.postal_code || null,
        street: address.street || null,
        number: address.number || null,
        complement: address.complement || null,
        neighborhood: address.neighborhood || null,
        city: address.city || null,
        state: address.state || null,
        reference_point: address.reference_point || null,
      });
      if (activeCompanyIdRef.current !== requestCompanyIdAtSubmit) return;
      onCreated(created);
      handleOpenChange(false);
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFieldErrors(error.errors);
      } else {
        setSubmitError("Não foi possível criar o endereço agora.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Novo endereço"
      showClose
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || address.label.trim() === ""}>
            {submitting ? "Criando..." : "Criar endereço"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-1">
        <AddressFields value={address} onChange={(patch) => setAddress((current) => ({ ...current, ...patch }))} idPrefix="quick-address" />
        {fieldErrors.label?.[0] ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldErrors.label[0]}
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
