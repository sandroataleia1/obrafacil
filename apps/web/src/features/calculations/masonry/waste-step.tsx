import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

const PRESETS = [5, 10, 15];
const MIN_WASTE = 0;
const MAX_WASTE = 30;

interface WasteStepProps {
  value: number;
  onChange: (value: number) => void;
}

export function WasteStep({ value, onChange }: WasteStepProps) {
  function clamp(next: number) {
    return Math.min(MAX_WASTE, Math.max(MIN_WASTE, next));
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Quer considerar perda?
        </h2>
        <p className="text-sm text-muted-foreground">
          Recomendamos 10% para perdas e quebras.
        </p>
      </div>

      <div className="flex gap-2">
        {PRESETS.map((preset) => {
          const selected = value === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(preset)}
              className={cn(
                "flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/30"
              )}
            >
              {preset}%
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-6 rounded-xl border border-border bg-card py-6">
        <button
          type="button"
          aria-label="Diminuir perda em 1%"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= MIN_WASTE}
          className="flex size-11 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>

        <span className="min-w-16 text-center text-3xl font-semibold tabular-nums text-foreground">
          {value}%
        </span>

        <button
          type="button"
          aria-label="Aumentar perda em 1%"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= MAX_WASTE}
          className="flex size-11 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
