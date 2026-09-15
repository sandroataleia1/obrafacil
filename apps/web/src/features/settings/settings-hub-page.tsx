import Link from "next/link";
import { Bell, Building2, ChevronRight, Settings } from "lucide-react";

import { PageTitle } from "@/components/shared/page-title";

interface SettingsHubItem {
  href: string;
  label: string;
  description: string;
  icon: typeof Bell;
}

// FRONTEND-COMPANY-PROFILE-01 §3/§48: Empresa first — it's the main
// organizational setting — followed by Notificações. The hub exists so
// future settings (Usuários, OS, ...) have a place to land without
// reshuffling navigation again.
const SETTINGS_HUB_ITEMS: SettingsHubItem[] = [
  {
    href: "/configuracoes/empresa",
    label: "Empresa",
    description: "Dados comerciais, endereço, logo e configurações regionais.",
    icon: Building2,
  },
  {
    href: "/configuracoes/notificacoes",
    label: "Notificações",
    description: "Escolha quais avisos deseja receber pelo WhatsApp.",
    icon: Bell,
  },
];

export function SettingsHubPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle icon={Settings}>Configurações</PageTitle>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {SETTINGS_HUB_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
          >
            <item.icon className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
