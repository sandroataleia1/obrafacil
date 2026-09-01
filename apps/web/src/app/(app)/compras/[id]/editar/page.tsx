import { Suspense } from "react";

import { PurchaseOrderForm } from "@/features/purchases/purchase-order-form";

export default async function EditarCompraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PurchaseOrderForm purchaseOrderId={id} />
    </Suspense>
  );
}
