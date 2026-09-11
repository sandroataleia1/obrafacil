import { CatalogDetail } from "@/features/catalog/catalog-detail";

export default async function CatalogoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogDetail id={id} />;
}
