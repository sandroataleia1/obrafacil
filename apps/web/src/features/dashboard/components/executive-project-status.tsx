import { BrickWall } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { ProjectStatusCounts } from "@/features/analytics/types";

const STATUS_ITEMS: Array<{ key: keyof ProjectStatusCounts; label: string }> = [
  { key: "planning", label: "Planejamento" },
  { key: "inProgress", label: "Em andamento" },
  { key: "paused", label: "Pausadas" },
  { key: "completed", label: "Concluídas" },
];

/** Counts by status, never a single collapsed "obras ativas" number (Demo-Ready 010B §3/§11). */
export function ExecutiveProjectStatus({ counts }: { counts: ProjectStatusCounts }) {
  const total = counts.planning + counts.inProgress + counts.paused + counts.completed;

  if (total === 0) {
    return (
      <EmptyState
        compact
        icon={BrickWall}
        title="Nenhuma obra cadastrada ainda."
        description="Crie a primeira obra para acompanhar o painel executivo."
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {STATUS_ITEMS.map((item) => (
          <Card key={item.key} size="sm" className="gap-1 p-3">
            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
            <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">{counts[item.key]}</p>
          </Card>
        ))}
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {total} obra{total === 1 ? "" : "s"} no total
      </p>
    </div>
  );
}
