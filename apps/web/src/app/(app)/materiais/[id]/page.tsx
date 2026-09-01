import { MaterialDetail } from "@/features/materials/material-detail";

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MaterialDetail id={id} />;
}
