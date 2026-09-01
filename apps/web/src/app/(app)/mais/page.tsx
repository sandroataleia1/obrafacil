import Link from "next/link";
import { BrickWall, ChevronRight, HardHat, Package, Receipt, Truck, Users } from "lucide-react";

const GESTAO_LINKS = [
  { href: "/obras", label: "Obras", icon: BrickWall },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/equipe", label: "Equipe", icon: HardHat },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/materiais", label: "Materiais", icon: Package },
];

const FINANCEIRO_LINKS = [
  { href: "/financeiro/contas-a-pagar", label: "Contas a pagar", icon: Receipt },
  { href: "/financeiro/contas-a-receber", label: "Contas a receber", icon: Receipt },
];

function LinkSection({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: { href: string; label: string; icon: typeof BrickWall }[];
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
      <LinkSection id="mais-financeiro" title="Financeiro" items={FINANCEIRO_LINKS} />
    </div>
  );
}
