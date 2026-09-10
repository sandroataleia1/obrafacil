import { Suspense } from "react";

import { CustomerCreateForm } from "@/features/customers/customer-create-form";

export default function NovoClientePage() {
  return (
    <Suspense fallback={null}>
      <CustomerCreateForm />
    </Suspense>
  );
}
