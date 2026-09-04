"use client";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { MaterialForm } from "./material-form";
import type { Material } from "./types";

/**
 * Thin shell around the real `MaterialForm` — same validation and
 * persistence as `/materiais/novo`, only the surface differs
 * (Demo-Ready 009C §3/§4/§7).
 */
export function CreateMaterialDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (material: Material) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo material"
      description="Cadastre um material sem sair desta tela."
      size="sm"
    >
      <MaterialForm
        onSuccess={(material) => {
          onOpenChange(false);
          onCreated?.(material);
        }}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
