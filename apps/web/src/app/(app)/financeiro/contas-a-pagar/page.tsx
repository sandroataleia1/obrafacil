import { Suspense } from "react";

import { PayableList } from "@/features/payables/payable-list";

export default function ContasAPagarPage() {
  return (
    <Suspense fallback={null}>
      <PayableList />
    </Suspense>
  );
}
