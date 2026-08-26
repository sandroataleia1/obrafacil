import Link from "next/link";
import { BrickWall, Calculator, FileText, Plus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ActionCard } from "@/components/shared/action-card";
import { EmptyState } from "@/components/shared/empty-state";
import { currentUser } from "@/mocks/current-user";
import { operationalSummary, recentActivity } from "@/mocks/dashboard";

function SectionLabel({ children, id }: { children: string; id: string }) {
  return (
    <h2
      id={id}
      className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
    >
      {children}
    </h2>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-10">
      <div className="space-y-1.5">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl">
          Olá, {currentUser.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          O que você deseja fazer?
        </p>
      </div>

      <ActionCard
        href="/calcular"
        variant="primary"
        icon={Calculator}
        title="Calcular materiais"
        description="Calcule parede, piso, concreto, pintura e muito mais em poucos toques."
        cta="Calcular agora"
      />

      <div className="grid grid-cols-2 gap-3">
        <ActionCard href="/orcamentos/novo" icon={Plus} title="Novo orçamento" />
        <ActionCard href="/obras" icon={BrickWall} title="Minhas obras" />
      </div>

      <section aria-labelledby="resumo-operacional" className="space-y-2.5">
        <SectionLabel id="resumo-operacional">Em andamento</SectionLabel>

        <Link
          href="/orcamentos"
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="grid grid-cols-2 gap-0 divide-x divide-border py-0">
            <div className="flex flex-col gap-1 p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileText className="size-3.5" aria-hidden="true" />
                <span className="text-xs font-medium">Orçamentos</span>
              </div>
              <p className="text-2xl leading-none font-semibold text-foreground">
                {operationalSummary.budgetsInProgress}
              </p>
              <p className="text-xs text-muted-foreground">
                {operationalSummary.budgetsAwaitingApproval} aguardando
                aprovação
              </p>
            </div>

            <div className="flex flex-col gap-1 p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <BrickWall className="size-3.5" aria-hidden="true" />
                <span className="text-xs font-medium">Obras</span>
              </div>
              <p className="text-2xl leading-none font-semibold text-foreground">
                {operationalSummary.projectsInProgress}
              </p>
              <p className="text-xs text-muted-foreground">
                {operationalSummary.projectsActive} em andamento
              </p>
            </div>
          </Card>
        </Link>
      </section>

      <section aria-labelledby="atividade-recente" className="space-y-2.5">
        <SectionLabel id="atividade-recente">Atividade recente</SectionLabel>

        {recentActivity.length > 0 ? (
          <Card size="sm" className="divide-y divide-border py-0">
            {recentActivity.slice(0, 3).map((item) => {
              const Icon = item.kind === "budget" ? FileText : BrickWall;
              return (
                <div key={item.id} className="flex items-center gap-3 p-3.5">
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </Card>
        ) : (
          <EmptyState
            icon={FileText}
            title="Nenhuma atividade ainda"
            description="Seus orçamentos e obras recentes vão aparecer aqui."
          />
        )}
      </section>
    </div>
  );
}
