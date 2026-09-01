import { Suspense } from "react";

import { ReceivableList } from "@/features/receivables/receivable-list";

export default function ContasAReceberPage() {
  return (
    <Suspense fallback={null}>
      <ReceivableList />
    </Suspense>
  );
}
