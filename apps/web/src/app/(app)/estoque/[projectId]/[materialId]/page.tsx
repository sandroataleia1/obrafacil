import { StockDetail } from "@/features/stock/stock-detail";

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; materialId: string }>;
}) {
  const { projectId, materialId } = await params;
  return <StockDetail projectId={projectId} materialId={materialId} />;
}
