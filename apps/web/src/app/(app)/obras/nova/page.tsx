import { Suspense } from "react";

import { ProjectCreateForm } from "@/features/projects/project-create-form";

export default function NovaObraPage() {
  return (
    <Suspense fallback={null}>
      <ProjectCreateForm />
    </Suspense>
  );
}
