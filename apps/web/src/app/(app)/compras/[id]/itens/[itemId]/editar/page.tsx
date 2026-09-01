import { PurchaseOrderItemForm } from "@/features/purchases/purchase-order-item-form";

export default async function EditarItemCompraPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  return <PurchaseOrderItemForm purchaseOrderId={id} itemId={itemId} />;
}
