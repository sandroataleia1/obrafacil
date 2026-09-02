import { Suspense } from "react";

import { BudgetForm } from "@/features/budgets/budget-form";

export default async function EditarOrcamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <BudgetForm budgetId={id} />
    </Suspense>
  );
}
