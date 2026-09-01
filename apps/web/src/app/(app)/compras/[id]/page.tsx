import { PurchaseOrderDetail } from "@/features/purchases/purchase-order-detail";

export default async function CompraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseOrderDetail id={id} />;
}
