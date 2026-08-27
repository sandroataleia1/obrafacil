import { CostList } from "@/features/project-costs/cost-list";

export default async function ObraCustosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CostList projectId={id} />;
}
