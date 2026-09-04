import Link from "next/link";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { BrickWall } from "lucide-react";
import { PROJECT_STATUS_LABEL } from "@/features/projects/types";
import type { ProjectHealthEntry, ProjectHealthHighlights } from "@/features/dashboard/prototype/dashboard-charts";
import {
  buildFinancialSummaryLines,
  buildHealthBadges,
  buildScheduleStatusLines,
} from "@/features/dashboard/prototype/dashboard-format";

function HealthBadges({ entry }: { entry: ProjectHealthEntry }) {
  const badges = buildHealthBadges(entry.healthFlags);
  if (badges.length === 0) {
    return <span className="text-xs text-muted-foreground">No prazo</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

function ScheduleLines({ entry }: { entry: ProjectHealthEntry }) {
  const lines = buildScheduleStatusLines(entry);
  return (
    <div>
      <p className={entry.isLate ? "text-sm font-medium text-destructive" : "text-sm text-foreground"}>
        {lines.primary}
      </p>
      {lines.secondary ? <p className="text-xs text-muted-foreground">{lines.secondary}</p> : null}
    </div>
  );
}

function FinancialLines({ entry }: { entry: ProjectHealthEntry }) {
  const lines = buildFinancialSummaryLines(entry);
  return (
    <div>
      <p className="text-sm text-foreground">{lines.primary}</p>
      {lines.secondary ? <p className="text-xs text-muted-foreground">{lines.secondary}</p> : null}
    </div>
  );
}

function HealthRowMobile({ entry }: { entry: ProjectHealthEntry }) {
  return (
    <Link
      href={`/obras/${entry.projectId}`}
      className="block space-y-2 p-3.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{entry.projectName}</p>
        <p className="text-xs text-muted-foreground">{PROJECT_STATUS_LABEL[entry.status]}</p>
      </div>
      <HealthBadges entry={entry} />
      <FinancialLines entry={entry} />
      <ScheduleLines entry={entry} />
    </Link>
  );
}

function HealthRowDesktop({ entry }: { entry: ProjectHealthEntry }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="py-2.5 pr-4 align-top">
        <Link href={`/obras/${entry.projectId}`} className="font-medium text-foreground hover:underline">
          {entry.projectName}
        </Link>
        <p className="text-xs text-muted-foreground">{PROJECT_STATUS_LABEL[entry.status]}</p>
      </td>
      <td className="py-2.5 pr-4 align-top">
        <HealthBadges entry={entry} />
      </td>
      <td className="py-2.5 pr-4 align-top">
        <FinancialLines entry={entry} />
      </td>
      <td className="py-2.5 align-top">
        <ScheduleLines entry={entry} />
      </td>
    </tr>
  );
}

export function ProjectHealthList({ highlights }: { highlights: ProjectHealthHighlights }) {
  if (highlights.items.length === 0) {
    return (
      <EmptyState
        icon={BrickWall}
        title="Nenhuma obra cadastrada ainda."
        description="Suas obras e sua saúde financeira vão aparecer aqui."
      />
    );
  }

  const hiddenCount = highlights.totalCount - highlights.items.length;

  return (
    <div className="space-y-2">
      {/* Mobile: vertical cards, never a horizontal table */}
      <Card size="sm" className="divide-y divide-border py-0 lg:hidden">
        {highlights.items.map((entry) => (
          <HealthRowMobile key={entry.projectId} entry={entry} />
        ))}
      </Card>

      {/* Desktop: full-width, grouped columns (Obra / Situação / Financeiro / Prazo) */}
      <Card size="sm" className="hidden overflow-x-auto p-4 lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Obra</th>
              <th className="pb-2 pr-4 font-medium">Situação</th>
              <th className="pb-2 pr-4 font-medium">Financeiro</th>
              <th className="pb-2 font-medium">Prazo</th>
            </tr>
          </thead>
          <tbody>
            {highlights.items.map((entry) => (
              <HealthRowDesktop key={entry.projectId} entry={entry} />
            ))}
          </tbody>
        </table>
      </Card>

      {hiddenCount > 0 ? (
        <Link
          href="/obras"
          className="block px-1 text-xs font-medium text-primary hover:underline"
        >
          +{hiddenCount} outra{hiddenCount === 1 ? "" : "s"} obra{hiddenCount === 1 ? "" : "s"}
        </Link>
      ) : null}
    </div>
  );
}
