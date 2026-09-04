import type { AttendanceIndicators } from "../prototype/attendance-overview";

export function AttendanceIndicatorsBar({ indicators }: { indicators: AttendanceIndicators }) {
  const items = [
    { label: "Colaboradores com período", value: indicators.withPeriod },
    { label: "Períodos com pendências", value: indicators.withPendencies },
    { label: "Prontos para fechar", value: indicators.readyToClose },
    { label: "Fechados", value: indicators.closed },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
