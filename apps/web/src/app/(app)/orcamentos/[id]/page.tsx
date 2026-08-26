import { BudgetDetail } from "@/features/budgets/budget-detail";

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BudgetDetail id={id} />;
}
