import { Suspense } from "react";

import { ProjectEditForm } from "@/features/projects/project-edit-form";

export default async function EditarObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ProjectEditForm id={id} />
    </Suspense>
  );
}
