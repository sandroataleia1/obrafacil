import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/decimal";
import { masonryMaterials } from "@/mocks/calculations/masonry";

interface MaterialStepProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MaterialStep({ selectedId, onSelect }: MaterialStepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Escolha o material
      </h2>

      <div role="radiogroup" aria-label="Material" className="space-y-3">
        {masonryMaterials.map((material) => {
          const selected = material.id === selectedId;
          return (
            <button
              key={material.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(material.id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/30"
              )}
            >
              <div>
                <p
                  className={cn(
                    "text-sm",
                    selected
                      ? "font-semibold text-foreground"
                      : "font-medium text-foreground"
                  )}
                >
                  {material.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {material.dimensions}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDecimal(material.unitsPerSquareMeter)} un./m²
                </p>
              </div>

              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent"
                )}
                aria-hidden="true"
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
