import { ProjectTeamPeriodPage } from "@/features/projects/team/project-team-period-page";

export default async function ObraEquipePeriodoPage({
  params,
}: {
  params: Promise<{ id: string; employeeId: string; period: string }>;
}) {
  const { id, employeeId, period } = await params;
  return <ProjectTeamPeriodPage projectId={id} employeeId={employeeId} period={period} />;
}
