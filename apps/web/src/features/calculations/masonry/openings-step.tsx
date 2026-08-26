import { Blinds, DoorOpen, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { OpeningGroup } from "./opening-group";
import type { OpeningItem } from "./types";

interface OpeningsStepProps {
  hasOpenings: boolean | null;
  onChangeHasOpenings: (value: boolean) => void;
  doors: OpeningItem[];
  onChangeDoors: (items: OpeningItem[]) => void;
  windows: OpeningItem[];
  onChangeWindows: (items: OpeningItem[]) => void;
}

export function OpeningsStep({
  hasOpenings,
  onChangeHasOpenings,
  doors,
  onChangeDoors,
  windows,
  onChangeWindows,
}: OpeningsStepProps) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        A parede tem portas ou janelas?
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {(
          [
            { value: false, label: "Não" },
            { value: true, label: "Sim" },
          ] as const
        ).map((option) => {
          const selected = hasOpenings === option.value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={selected}
              onClick={() => onChangeHasOpenings(option.value)}
              className={cn(
                "rounded-xl border py-4 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/30"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {hasOpenings ? (
        <div className="space-y-6">
          <div className="flex items-start gap-2 rounded-lg bg-muted px-3.5 py-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>
              As áreas das portas e janelas serão descontadas da parede.
            </p>
          </div>

          <OpeningGroup
            icon={DoorOpen}
            title="Portas"
            addLabel="Adicionar porta"
            items={doors}
            onChange={onChangeDoors}
          />

          <OpeningGroup
            icon={Blinds}
            title="Janelas"
            addLabel="Adicionar janela"
            items={windows}
            onChange={onChangeWindows}
          />
        </div>
      ) : null}
    </div>
  );
}
