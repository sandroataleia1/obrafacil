"use client";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { EmployeeForm } from "../employee-form";
import type { Employee } from "../types";

/**
 * Thin shell around the real `EmployeeForm` — same validation and
 * persistence as `/equipe/novo`, only the surface differs (Demo-Ready
 * 009C §3/§4/§8). Reuses the exact same vínculo/remuneração fields
 * from the 008B domain — nothing new added here.
 */
export function CreateEmployeeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (employee: Employee) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo colaborador"
      description="Cadastre um funcionário ou prestador sem sair desta tela."
      size="md"
    >
      <EmployeeForm
        onSuccess={(employee) => {
          onOpenChange(false);
          onCreated?.(employee);
        }}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
