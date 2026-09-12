import { ServiceOrderEdit } from "@/features/service-orders/service-order-edit";

export default async function EditarOrdemServicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ServiceOrderEdit id={id} />;
}
