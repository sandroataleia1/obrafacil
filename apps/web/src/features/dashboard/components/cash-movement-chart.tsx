"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { formatCompactCurrency } from "@/features/dashboard/prototype/dashboard-format";
import { LineChart } from "lucide-react";
import type { MonthlyCashMovementEntry } from "@/features/dashboard/prototype/dashboard-charts";

function MiniTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="font-medium tabular-nums text-foreground">{formatCurrency(value)}</p>
    </div>
  );
}

/** One independent mini bar chart — its own Y-axis scale, so a series
 * two orders of magnitude smaller than the other (Pago vs. Recebido)
 * still reads clearly instead of flattening into the axis. */
function MiniMovementChart({
  data,
  dataKey,
  label,
  total,
  color,
}: {
  data: MonthlyCashMovementEntry[];
  dataKey: "received" | "paid";
  label: string;
  total: number;
  color: string;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(total)}</span>
      </div>
      <div style={{ width: "100%", height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={formatCompactCurrency} tick={{ fontSize: 10 }} width={56} />
            <Tooltip content={(props) => <MiniTooltip {...props} />} cursor={{ fill: "var(--color-muted)" }} />
            <Bar dataKey={dataKey} name={label} fill={color} radius={3} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** `monthlyCashMovement` always has exactly 6 buckets — every month
 * renders, including zeros. Recebido and Pago get separate mini-charts
 * with independent Y scales (never a shared axis) — combined, Pago
 * (hundreds/low thousands) would visually vanish next to Recebido
 * (tens of thousands) despite both being correct. */
export function CashMovementChart({
  data,
  receivedTotal,
  paidTotal,
}: {
  data: MonthlyCashMovementEntry[];
  receivedTotal: number;
  paidTotal: number;
}) {
  const isEmpty = data.every((bucket) => bucket.received === 0 && bucket.paid === 0);

  return (
    <Card size="sm" className="gap-3 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Movimentação financeira</h3>
        <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
      </div>
      {isEmpty ? (
        <EmptyState icon={LineChart} title="Sem movimentação financeira nos últimos 6 meses." compact />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <MiniMovementChart
            data={data}
            dataKey="received"
            label="Recebido"
            total={receivedTotal}
            color="var(--color-primary)"
          />
          <MiniMovementChart
            data={data}
            dataKey="paid"
            label="Pago"
            total={paidTotal}
            color="var(--color-chart-4)"
          />
        </div>
      )}
    </Card>
  );
}
