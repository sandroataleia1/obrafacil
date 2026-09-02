import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BrickWall,
  Calculator,
  FileText,
  Plus,
  TrendingDown,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { ActionCard } from "@/components/shared/action-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/currency";
import { currentUser } from "@/mocks/current-user";
import {
  keyMetrics,
  operationalSummary,
  recentActivity,
  type KeyMetricKind,
} from "@/mocks/dashboard";

const METRIC_ICON: Record<KeyMetricKind, LucideIcon> = {
  orcado: Wallet,
  gasto: TrendingDown,
  "a-receber": ArrowDownCircle,
  "a-pagar": ArrowUpCircle,
};

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

function EmAndamentoCard() {
  return (
    <Link
      href="/orcamentos"
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="grid grid-cols-2 gap-0 divide-x divide-border py-0 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
        <div className="flex flex-col gap-1 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FileText className="size-3.5" aria-hidden="true" />
            <span className="text-xs font-medium">Orçamentos</span>
          </div>
          <p className="text-2xl leading-none font-semibold text-foreground">
            {operationalSummary.budgetsInProgress}
          </p>
          <p className="text-xs text-muted-foreground">
            {operationalSummary.budgetsAwaitingApproval} aguardando aprovação
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
  );
}

function MetricsGrid() {
  return (
    <section aria-labelledby="metricas-essenciais" className="space-y-2.5">
      <SectionLabel id="metricas-essenciais">Métricas</SectionLabel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {keyMetrics.map((metric) => {
          const Icon = METRIC_ICON[metric.kind];
          return (
            <Card key={metric.id} size="sm" className="gap-1.5 p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="size-3.5" aria-hidden="true" />
                <span className="text-xs font-medium">{metric.label}</span>
              </div>
              <p className="text-lg leading-tight font-semibold tabular-nums text-foreground lg:text-xl">
                {formatCurrency(metric.value)}
              </p>
              <p className="text-xs text-muted-foreground">{metric.helper}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function AtividadeRecenteCard() {
  return recentActivity.length > 0 ? (
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

      <MetricsGrid />

      <div className="space-y-10 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-10 lg:col-span-2">
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

          <section aria-labelledby="resumo-operacional" className="space-y-2.5 lg:hidden">
            <SectionLabel id="resumo-operacional">Em andamento</SectionLabel>
            <EmAndamentoCard />
          </section>

          <section aria-labelledby="atividade-recente" className="space-y-2.5 lg:hidden">
            <SectionLabel id="atividade-recente">Atividade recente</SectionLabel>
            <AtividadeRecenteCard />
          </section>
        </div>

        <div className="hidden space-y-8 lg:block">
          <section aria-labelledby="resumo-operacional-desktop" className="space-y-2.5">
            <SectionLabel id="resumo-operacional-desktop">Em andamento</SectionLabel>
            <EmAndamentoCard />
          </section>

          <section aria-labelledby="atividade-recente-desktop" className="space-y-2.5">
            <SectionLabel id="atividade-recente-desktop">Atividade recente</SectionLabel>
            <AtividadeRecenteCard />
          </section>
        </div>
      </div>
    </div>
  );
}
