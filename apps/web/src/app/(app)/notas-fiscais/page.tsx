import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";

/**
 * Roadmap placeholder (Pilot "Adendo de Escopo" — Notas Fiscais). Real
 * navigation to a real page — not a dead link, not `href="#"`, not a
 * disabled item — so the user always lands somewhere that explains
 * what's happening instead of nothing happening at all. No fiscal
 * module, no NFe/NFS-e fields: this page exists only to signal roadmap
 * intent, matching the "Em breve" badge shown next to the nav item.
 */
export default function NotasFiscaisPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <PageTitle icon={ScrollText}>Notas Fiscais</PageTitle>
        <p className="text-sm text-muted-foreground">Emissão e controle de notas fiscais da obra.</p>
      </div>

      <EmptyState
        icon={ScrollText}
        title="Em breve"
        description="Estamos preparando o módulo de Notas Fiscais."
      />
    </div>
  );
}
