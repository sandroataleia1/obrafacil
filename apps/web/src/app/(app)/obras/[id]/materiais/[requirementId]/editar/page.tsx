import { RequirementForm } from "@/features/materials/requirement-form";

export default async function EditarRequirementPage({
  params,
}: {
  params: Promise<{ id: string; requirementId: string }>;
}) {
  const { id, requirementId } = await params;
  return <RequirementForm projectId={id} requirementId={requirementId} />;
}
