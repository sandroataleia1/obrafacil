import { Suspense } from "react";

import { PurchaseOrderForm } from "@/features/purchases/purchase-order-form";

export default function NovaCompraPage() {
  return (
    <Suspense fallback={null}>
      <PurchaseOrderForm />
    </Suspense>
  );
}
