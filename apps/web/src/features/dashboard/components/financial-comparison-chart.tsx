"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { BarChart3 } from "lucide-react";
import type { FinancialComparisonEntry } from "@/features/dashboard/prototype/dashboard-charts";

const SERIES = [
  { key: "referenceAmount", label: "Orçado", color: "var(--color-chart-1)" },
  { key: "realizedCost", label: "Realizado", color: "var(--color-chart-2)" },
  { key: "committedCost", label: "Comprometido", color: "var(--color-chart-3)" },
] as const;

function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs">
      {SERIES.map((series) => (
        <span key={series.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: series.color }} aria-hidden="true" />
          <span className="text-muted-foreground">{series.label}</span>
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {SERIES.map((series) => {
        const entry = payload.find((item) => item.dataKey === series.key);
        if (!entry) return null;
        return (
          <div key={series.key} className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{series.label}</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(Number(entry.value ?? 0))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Height grows with the number of obras so names/bars never get
 * cramped — never a fixed height regardless of dataset size. */
export function FinancialComparisonChart({ data }: { data: FinancialComparisonEntry[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nenhuma obra com orçamento disponível para comparar."
        compact
      />
    );
  }

  const height = Math.max(160, data.length * 76);

  return (
    <div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="projectName"
              width={110}
              tick={{ fontSize: 12 }}
              interval={0}
            />
            <Tooltip content={(props) => <ChartTooltip {...props} />} cursor={{ fill: "var(--color-muted)" }} />
            {SERIES.map((series) => (
              <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={3} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend />
    </div>
  );
}
