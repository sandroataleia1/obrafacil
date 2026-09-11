import { CatalogEditForm } from "@/features/catalog/catalog-edit-form";

export default async function CatalogoEditarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogEditForm catalogItemId={id} />;
}
