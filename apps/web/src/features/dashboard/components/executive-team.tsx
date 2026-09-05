"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { formatPeriodLabel } from "@/features/employees/prototype/period-label";
import { shiftPeriod } from "@/features/employees/prototype/attendance-overview";
import type { TeamSnapshotFacts, WorkforcePeriodFacts } from "@/features/analytics/types";

/**
 * Snapshot ("Hoje") and monthly workforce coverage are kept visually
 * separate — never mixed into one number (Demo-Ready 010B §7/§8).
 * When `existingPeriodsCount < activeEmployees`, the estimated value
 * is never called "folha"/"custo total da equipe" — see the label
 * text below (Demo-Ready 010B §9).
 */
export function ExecutiveTeam({
  snapshot,
  workforcePeriod,
  period,
  onPeriodChange,
}: {
  snapshot: TeamSnapshotFacts;
  workforcePeriod: WorkforcePeriodFacts;
  period: string;
  onPeriodChange: (period: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="px-1 text-xs text-muted-foreground">Hoje</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Link href="/equipe" className="block rounded-xl">
            <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
              <span className="text-xs font-medium text-muted-foreground">Ativos</span>
              <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
                {snapshot.activeEmployees}
              </p>
            </Card>
          </Link>
          <Link href="/equipe" className="block rounded-xl">
            <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
              <span className="text-xs font-medium text-muted-foreground">Alocados</span>
              <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
                {snapshot.allocatedEmployees}
              </p>
            </Card>
          </Link>
          <Link href="/equipe" className="block rounded-xl">
            <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
              <span className="text-xs font-medium text-muted-foreground">Sem obra</span>
              <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
                {snapshot.unallocatedEmployees}
              </p>
            </Card>
          </Link>
          <Link href="/equipe" className="block rounded-xl">
            <Card size="sm" className="gap-1 p-3 transition-colors hover:border-primary/30">
              <span className="text-xs font-medium text-muted-foreground">Multiobra</span>
              <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">
                {snapshot.multiProjectEmployees}
              </p>
            </Card>
          </Link>
        </div>
      </div>

      <div className="space-y-2.5 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPeriodChange(shiftPeriod(period, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-semibold text-foreground sm:inline">
              {formatPeriodLabel(period)}
            </span>
            <input
              type="month"
              value={period}
              onChange={(event) => event.target.value && onPeriodChange(event.target.value)}
              aria-label="Selecionar período da equipe"
              className="rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPeriodChange(shiftPeriod(period, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Períodos criados</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {workforcePeriod.existingPeriodsCount} de {snapshot.activeEmployees}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Valor estimado dos períodos existentes</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(workforcePeriod.estimatedValueOfExistingPeriods)}
          </span>
        </div>

        {workforcePeriod.employeesWithoutPeriodCount > 0 ? (
          <Link
            href="/equipe/frequencia"
            className="block rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm font-medium text-amber-700 hover:border-amber-500/50 dark:text-amber-400"
          >
            {workforcePeriod.employeesWithoutPeriodCount} funcionário
            {workforcePeriod.employeesWithoutPeriodCount === 1 ? "" : "s"}{" "}
            {workforcePeriod.employeesWithoutPeriodCount === 1 ? "ainda está" : "ainda estão"} sem período neste mês.
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Todos os funcionários ativos já têm período neste mês.</p>
        )}
      </div>
    </div>
  );
}
