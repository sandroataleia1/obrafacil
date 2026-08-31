import { PeriodDetail } from "@/features/employees/period-detail";

export default async function PeriodoDetailPage({
  params,
}: {
  params: Promise<{ id: string; period: string }>;
}) {
  const { id, period } = await params;
  return <PeriodDetail employeeId={id} period={period} />;
}
