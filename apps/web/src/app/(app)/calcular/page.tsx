import { CalculatorCard } from "@/features/calculations/calculator-card";
import { CALCULATOR_CATEGORIES } from "@/features/calculations/categories";

export default function CalcularPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Calcular
        </h1>
        <p className="text-sm text-muted-foreground">O que você vai fazer?</p>
      </div>

      <div className="space-y-3">
        {CALCULATOR_CATEGORIES.map((category) => (
          <CalculatorCard key={category.id} {...category} />
        ))}
      </div>
    </div>
  );
}
