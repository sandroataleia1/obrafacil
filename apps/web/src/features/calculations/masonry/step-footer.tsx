import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StepFooterProps {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}

export function StepFooter({
  onBack,
  onContinue,
  continueLabel = "Continuar",
  continueDisabled,
}: StepFooterProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85",
        "md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:pt-6 md:pb-0 md:backdrop-blur-none"
      )}
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-md gap-3 md:ml-auto md:mr-0 md:max-w-none md:justify-end">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onBack}
            className="flex-1 md:flex-none md:w-32"
          >
            Voltar
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          onClick={onContinue}
          disabled={continueDisabled}
          className="flex-1 md:flex-none md:w-48"
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
