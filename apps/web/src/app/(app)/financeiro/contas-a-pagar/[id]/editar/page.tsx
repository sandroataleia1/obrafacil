import { PayableForm } from "@/features/payables/payable-form";

export default async function EditarContaAPagarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PayableForm payableId={id} />;
}
