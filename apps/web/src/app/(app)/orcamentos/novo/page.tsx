import { Suspense } from "react";

import { BudgetForm } from "@/features/budgets/budget-form";

export default function NovoOrcamentoPage() {
  return (
    <Suspense fallback={null}>
      <BudgetForm />
    </Suspense>
  );
}
