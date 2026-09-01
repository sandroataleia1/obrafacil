import { PurchaseOrderItemForm } from "@/features/purchases/purchase-order-item-form";

export default async function NovoItemCompraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseOrderItemForm purchaseOrderId={id} />;
}
