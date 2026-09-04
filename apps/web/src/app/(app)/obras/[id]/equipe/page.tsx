import { ProjectTeamPage } from "@/features/projects/team/project-team-page";

export default async function ObraEquipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectTeamPage projectId={id} />;
}
