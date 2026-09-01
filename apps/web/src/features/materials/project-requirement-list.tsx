"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Package, Plus } from "lucide-react";

import { BackHeader } from "@/components/shared/back-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatQuantity } from "@/lib/quantity";
import { useProject } from "@/features/projects/prototype/use-project";
import { formatMaterialUnit } from "./material-unit";
import { getMaterial } from "./prototype/material-store";
import { useRequirements } from "./prototype/use-requirements";
import type { MaterialRequirement } from "./types";

function RequirementRow({ projectId, requirement }: { projectId: string; requirement: MaterialRequirement }) {
  const material = getMaterial(requirement.materialId);

  return (
    <Link
      href={`/obras/${projectId}/materiais/${requirement.id}/editar`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {material?.name ?? "Material não encontrado"}
        </p>
        <p className="text-xs text-muted-foreground">Necessário</p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {formatQuantity(requirement.requiredQuantity)}{" "}
        {material ? formatMaterialUnit(material.defaultUnit) : ""}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function ProjectRequirementList({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { project } = useProject(projectId);
  const { requirements } = useRequirements(projectId);

  if (project === undefined) return null;

  if (project === null) {
    return (
      <EmptyState
        icon={Package}
        title="Obra não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <BackHeader title="Materiais da obra" onBack={() => router.push(`/obras/${projectId}`)} />
          <p className="pl-11 text-sm text-muted-foreground">{project.name}</p>
        </div>
        <Button
          size="sm"
          className="mt-1"
          nativeButton={false}
          render={
            <Link href={`/obras/${projectId}/materiais/novo`}>
              <Plus className="size-4" aria-hidden="true" />
              Adicionar
            </Link>
          }
        />
      </div>

      {requirements === undefined ? null : requirements.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={Package}
            title="Nenhum material planejado"
            description="Registre a quantidade necessária de cada material para esta obra."
          />
          <Button
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<Link href={`/obras/${projectId}/materiais/novo`}>Adicionar material</Link>}
          />
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {requirements.map((requirement) => (
            <RequirementRow key={requirement.id} projectId={projectId} requirement={requirement} />
          ))}
        </div>
      )}
    </div>
  );
}
