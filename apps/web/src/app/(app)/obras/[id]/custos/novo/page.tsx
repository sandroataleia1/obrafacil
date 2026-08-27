import { CostForm } from "@/features/project-costs/cost-form";

export default async function NovoCustoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CostForm projectId={id} />;
}
