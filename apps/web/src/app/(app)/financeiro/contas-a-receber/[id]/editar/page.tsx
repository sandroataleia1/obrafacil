import { Suspense } from "react";

import { ReceivableForm } from "@/features/receivables/receivable-form";

export default async function EditarContaAReceberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ReceivableForm receivableId={id} />
    </Suspense>
  );
}
