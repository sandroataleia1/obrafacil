import { Suspense } from "react";

import { CustomerForm } from "@/features/customers/customer-form";

export default function NovoClientePage() {
  return (
    <Suspense fallback={null}>
      <CustomerForm />
    </Suspense>
  );
}
