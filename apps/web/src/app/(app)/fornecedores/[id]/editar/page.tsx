import { SupplierForm } from "@/features/suppliers/supplier-form";

export default async function EditarFornecedorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierForm supplierId={id} />;
}
