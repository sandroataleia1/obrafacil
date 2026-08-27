import Link from "next/link";
import { BrickWall, ChevronRight, Users } from "lucide-react";

const GESTAO_LINKS = [
  { href: "/obras", label: "Obras", icon: BrickWall },
  { href: "/clientes", label: "Clientes", icon: Users },
];

export default function MaisPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mais</h1>

      <section aria-labelledby="mais-gestao" className="space-y-2.5">
        <h2
          id="mais-gestao"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Gestão
        </h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {GESTAO_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
            >
              <item.icon className="size-4.5 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
