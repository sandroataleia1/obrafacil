import { Suspense } from "react";

import { ProjectForm } from "@/features/projects/project-form";

export default function NovaObraPage() {
  return (
    <Suspense fallback={null}>
      <ProjectForm />
    </Suspense>
  );
}
