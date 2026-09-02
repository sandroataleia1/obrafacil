import { GoodsReceiptForm } from "@/features/purchases/goods-receipt-form";

export default async function NovoRecebimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GoodsReceiptForm purchaseOrderId={id} />;
}
