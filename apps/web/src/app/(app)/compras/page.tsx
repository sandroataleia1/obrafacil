import { Suspense } from "react";

import { PurchaseOrderList } from "@/features/purchases/purchase-order-list";

export default function ComprasPage() {
  return (
    <Suspense fallback={null}>
      <PurchaseOrderList />
    </Suspense>
  );
}
