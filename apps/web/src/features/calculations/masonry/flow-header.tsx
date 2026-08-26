import { ChevronLeft } from "lucide-react";

interface FlowHeaderProps {
  title: string;
  step?: { current: number; total: number };
  onBack: () => void;
}

export function FlowHeader({ title, step, onBack }: FlowHeaderProps) {
  return (
    <div className="flex items-center gap-3 pb-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {step ? (
          <p className="text-xs text-muted-foreground">
            Etapa {step.current} de {step.total}
          </p>
        ) : null}
      </div>
    </div>
  );
}
