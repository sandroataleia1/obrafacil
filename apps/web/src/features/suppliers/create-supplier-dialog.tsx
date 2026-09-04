"use client";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { SupplierForm } from "./supplier-form";
import type { Supplier } from "./types";

/**
 * Thin shell around the real `SupplierForm` — same validation and
 * persistence as `/fornecedores/novo`, only the surface differs
 * (Demo-Ready 009C §3/§4/§6).
 */
export function CreateSupplierDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (supplier: Supplier) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo fornecedor"
      description="Cadastre um fornecedor sem sair desta tela."
      size="sm"
    >
      <SupplierForm
        onSuccess={(supplier) => {
          onOpenChange(false);
          onCreated?.(supplier);
        }}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
