import Link from "next/link";
import { BrickWall, ChevronRight, Users } from "lucide-react";

import {
  DESKTOP_NAV_EXTRA_ITEMS,
  DESKTOP_NAV_FINANCE_ITEMS,
  DESKTOP_NAV_SYSTEM_ITEMS,
  type NavItem,
} from "@/components/layout/nav-items";

// "Obras" and "Clientes" already sit in the sidebar's always-visible
// top group (`DESKTOP_NAV_ITEMS`), not `DESKTOP_NAV_EXTRA_ITEMS` — kept
// here explicitly so `/mais` still surfaces every section for a phone
// that never sees the sidebar at all.
const GESTAO_LINKS: NavItem[] = [
  { href: "/obras", label: "Obras", icon: BrickWall },
  { href: "/clientes", label: "Clientes", icon: Users },
  ...DESKTOP_NAV_EXTRA_ITEMS,
];

function LinkSection({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: NavItem[];
}) {
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <h2
        id={id}
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
          >
            <item.icon className="size-4.5 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
            {item.comingSoon ? (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Em breve
              </span>
            ) : null}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function MaisPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mais</h1>

      <LinkSection id="mais-gestao" title="Gestão" items={GESTAO_LINKS} />
      <LinkSection id="mais-financeiro" title="Financeiro" items={DESKTOP_NAV_FINANCE_ITEMS} />
      <LinkSection id="mais-sistema" title="Sistema" items={DESKTOP_NAV_SYSTEM_ITEMS} />
    </div>
  );
}
