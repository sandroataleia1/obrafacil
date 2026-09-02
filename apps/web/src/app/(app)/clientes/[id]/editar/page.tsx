import { CustomerForm } from "@/features/customers/customer-form";

export default async function ClienteEditarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerForm customerId={id} />;
}
