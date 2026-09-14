import { EditBudgetHeaderForm } from "@/features/budgets/edit-budget-header-form";

export default async function EditarOrcamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditBudgetHeaderForm id={id} />;
}
