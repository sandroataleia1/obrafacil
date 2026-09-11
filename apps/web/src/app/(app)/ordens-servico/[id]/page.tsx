import { ServiceOrderDetail } from "@/features/service-orders/service-order-detail";

export default async function OrdemServicoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ServiceOrderDetail id={id} />;
}
