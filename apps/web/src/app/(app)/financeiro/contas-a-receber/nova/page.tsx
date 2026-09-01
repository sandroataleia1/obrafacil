import { Suspense } from "react";

import { ReceivableForm } from "@/features/receivables/receivable-form";

export default function NovaContaAReceberPage() {
  return (
    <Suspense fallback={null}>
      <ReceivableForm />
    </Suspense>
  );
}
