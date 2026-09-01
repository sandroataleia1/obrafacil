import { ReceivableDetail } from "@/features/receivables/receivable-detail";

export default async function ContaAReceberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceivableDetail id={id} />;
}
