import { Suspense } from "react";

import { ProjectForm } from "@/features/projects/project-form";

export default async function EditarObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ProjectForm projectId={id} />
    </Suspense>
  );
}
