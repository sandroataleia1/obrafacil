"use client";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { CustomerForm } from "./customer-form";
import type { Customer } from "./types";

/**
 * Thin shell around the real `CustomerForm` — same validation and
 * persistence as `/clientes/novo`, only the surface differs (Demo-Ready
 * 009C §3/§4). `onCreated` lets a future caller (e.g. a customer picker
 * inside another flow) receive the new Customer directly.
 */
export function CreateCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: Customer) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo cliente"
      description="Cadastre um cliente sem sair desta tela."
      size="sm"
    >
      <CustomerForm
        onSuccess={(customer) => {
          onOpenChange(false);
          onCreated?.(customer);
        }}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
