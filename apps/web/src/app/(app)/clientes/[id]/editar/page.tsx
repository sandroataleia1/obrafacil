import { CustomerEditForm } from "@/features/customers/customer-edit-form";

export default async function ClienteEditarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerEditForm customerId={id} />;
}
