import { Suspense } from "react";

import { AdjustStockForm } from "@/features/stock/adjust-stock-form";

export default function AjustarEstoquePage() {
  return (
    <Suspense fallback={null}>
      <AdjustStockForm />
    </Suspense>
  );
}
