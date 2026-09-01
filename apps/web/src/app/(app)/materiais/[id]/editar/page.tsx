import { MaterialForm } from "@/features/materials/material-form";

export default async function EditarMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MaterialForm materialId={id} />;
}
