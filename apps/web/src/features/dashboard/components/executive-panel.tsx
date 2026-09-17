"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useExecutivePanel } from "@/features/dashboard/prototype/use-executive-panel";
import { buildProjectAttentionEntries } from "@/features/dashboard/prototype/project-priority";
import { todayIso } from "@/lib/date";
import { ExecutiveProjectStatus } from "./executive-project-status";
import { ExecutiveFinance } from "./executive-finance";
import { ExecutiveTeam } from "./executive-team";
import { ExecutiveAttentionProjects } from "./executive-attention-projects";

function SectionLabel({ children, id }: { children: string; id: string }) {
  return (
    <h2 id={id} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

/**
 * Painel executivo da empresa (Demo-Ready 010B) — consome
 * exclusivamente `features/analytics/**` (via `useExecutivePanel`),
 * nunca recalcula orçamento/custo/financeiro/equipe/materiais aqui.
 * Sem gráficos, por decisão de produto desta rodada (010B §18).
 */
export function ExecutivePanel() {
  const [period, setPeriod] = useState(() => todayIso().slice(0, 7));
  const { data, error: dataError, reload: reloadData } = useExecutivePanel(period);

  if (dataError) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar o painel executivo"
          description="Verifique sua conexão e tente novamente."
        />
        <Button type="button" onClick={reloadData}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (data === undefined) return null;

  const attentionEntries = buildProjectAttentionEntries(
    data.projectEntries.map(({ project, facts }) => ({
      projectId: project.id,
      projectName: project.name,
      facts,
    }))
  );

  return (
    <div className="space-y-6">
      <section aria-labelledby="painel-obras" className="space-y-2.5">
        <SectionLabel id="painel-obras">Obras</SectionLabel>
        <ExecutiveProjectStatus counts={data.company.projects} />
      </section>

      <section aria-labelledby="painel-financeiro" className="space-y-2.5">
        <SectionLabel id="painel-financeiro">Financeiro</SectionLabel>
        <ExecutiveFinance
          finance={data.company.finance}
          realizedProjectCosts={data.company.projectCosts.realizedProjectCosts}
        />
      </section>

      <section aria-labelledby="painel-equipe" className="space-y-2.5">
        <SectionLabel id="painel-equipe">Equipe</SectionLabel>
        <ExecutiveTeam
          snapshot={data.company.team}
          workforcePeriod={data.company.workforcePeriod}
          period={period}
          onPeriodChange={setPeriod}
        />
      </section>

      <section aria-labelledby="painel-atencao" className="space-y-2.5">
        <SectionLabel id="painel-atencao">Obras que precisam de atenção</SectionLabel>
        <ExecutiveAttentionProjects entries={attentionEntries} />
      </section>
    </div>
  );
}
