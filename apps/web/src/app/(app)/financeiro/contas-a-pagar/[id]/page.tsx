import { PayableDetail } from "@/features/payables/payable-detail";

export default async function ContaAPagarDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PayableDetail id={id} />;
}
