"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { LineChart } from "lucide-react";
import type { MonthlyCashMovementEntry } from "@/features/dashboard/prototype/dashboard-charts";

const SERIES = [
  { key: "received", label: "Recebido", color: "var(--color-primary)" },
  { key: "paid", label: "Pago", color: "var(--color-chart-2)" },
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

/** `monthlyCashMovement` always has exactly 6 buckets (see
 * `dashboard-charts.ts`) — every month renders, including zeros; this
 * component never filters them out. */
export function CashMovementChart({ data }: { data: MonthlyCashMovementEntry[] }) {
  const isEmpty = data.every((bucket) => bucket.received === 0 && bucket.paid === 0);

  if (isEmpty) {
    return (
      <EmptyState
        icon={LineChart}
        title="Sem movimentação financeira nos últimos 6 meses."
        compact
      />
    );
  }

  return (
    <div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 11 }} width={72} />
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
