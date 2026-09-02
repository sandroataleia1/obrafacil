import { ConsumptionForm } from "@/features/materials/consumption-form";

export default async function RegistrarUsoPage({
  params,
}: {
  params: Promise<{ id: string; materialId: string }>;
}) {
  const { id, materialId } = await params;
  return <ConsumptionForm projectId={id} materialId={materialId} />;
}
