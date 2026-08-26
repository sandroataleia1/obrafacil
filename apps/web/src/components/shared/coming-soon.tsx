import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

interface ComingSoonProps {
  title: string;
  icon: LucideIcon;
}

export function ComingSoon({ title, icon }: ComingSoonProps) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState
        icon={icon}
        title="Em construção"
        description="Esta área será construída em um próximo sprint."
      />
    </div>
  );
}
