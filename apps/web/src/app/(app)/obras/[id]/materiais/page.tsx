import { ProjectRequirementList } from "@/features/materials/project-requirement-list";

export default async function ObraMateriaisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectRequirementList projectId={id} />;
}
