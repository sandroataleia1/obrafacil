import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

const PRESETS = [10, 20, 30];
const MIN_MARGIN = 0;
const MAX_MARGIN = 60;

interface MarginControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function MarginControl({ value, onChange }: MarginControlProps) {
  function clamp(next: number) {
    return Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, next));
  }

  return (
    <div className="space-y-2.5">
      <span className="text-sm font-medium text-foreground">Acréscimo</span>

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
                "flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

      <div className="flex items-center justify-center gap-4 rounded-xl border border-border bg-card py-3">
        <button
          type="button"
          aria-label="Diminuir margem em 1%"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= MIN_MARGIN}
          className="flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>

        <span className="min-w-14 text-center text-xl font-semibold tabular-nums text-foreground">
          {value}%
        </span>

        <button
          type="button"
          aria-label="Aumentar margem em 1%"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= MAX_MARGIN}
          className="flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
