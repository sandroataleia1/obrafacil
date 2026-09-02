import { Suspense } from "react";

import { PayableForm } from "@/features/payables/payable-form";

export default function NovaContaAPagarPage() {
  return (
    <Suspense fallback={null}>
      <PayableForm />
    </Suspense>
  );
}
