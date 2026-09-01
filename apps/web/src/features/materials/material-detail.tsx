"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMaterialUnit } from "./material-unit";
import { saveMaterial } from "./prototype/material-store";
import { useMaterial } from "./prototype/use-material";
import { MaterialStatusBadge } from "./components/status-badge";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function MaterialDetail({ id }: { id: string }) {
  const router = useRouter();
  const { material, refresh } = useMaterial(id);

  if (material === undefined) return null;

  if (material === null) {
    return (
      <EmptyState
        icon={Package}
        title="Material não encontrado"
        description="Ele pode ter sido removido ou o link está incorreto."
      />
    );
  }

  function handleToggleStatus() {
    if (!material) return;
    saveMaterial({
      ...material,
      status: material.status === "active" ? "inactive" : "active",
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackHeader title={material.name} onBack={() => router.push("/materiais")} />
      </div>

      <div className="pl-11">
        <MaterialStatusBadge status={material.status} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <InfoRow label="Unidade padrão" value={formatMaterialUnit(material.defaultUnit)} />
        {material.notes ? <InfoRow label="Observação" value={material.notes} /> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/materiais/${material.id}/editar`}>Editar</Link>}
        />
        <Button type="button" variant="outline" onClick={handleToggleStatus}>
          {material.status === "active" ? "Inativar" : "Ativar"}
        </Button>
      </div>
    </div>
  );
}
