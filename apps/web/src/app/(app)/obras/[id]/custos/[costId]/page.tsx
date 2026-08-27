import { CostForm } from "@/features/project-costs/cost-form";

export default async function EditarCustoPage({
  params,
}: {
  params: Promise<{ id: string; costId: string }>;
}) {
  const { id, costId } = await params;
  return <CostForm projectId={id} costId={costId} />;
}
