"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDecimal, formatInteger } from "@/lib/decimal";
import { setPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";
import type { MasonryMaterial } from "@/mocks/calculations/masonry";
import type { MasonryCalculationResult } from "./prototype-calculator";

interface ResultStepProps {
  material: MasonryMaterial;
  result: MasonryCalculationResult;
  onNewCalculation: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ResultStep({
  material,
  result,
  onNewCalculation,
}: ResultStepProps) {
  const [addedToBudget, setAddedToBudget] = useState(false);

  function handleAddToBudget() {
    setPendingBudgetItem({
      source: "masonry-calculation",
      title: "Alvenaria",
      materialId: material.id,
      materialName: `${material.name} ${material.dimensions}`,
      quantity: result.units,
      unit: "unidades",
      netAreaM2: result.netAreaM2,
      wastePercentage: result.wastePercentage,
      auxiliaryMaterials: {
        cementBags: result.auxiliary.cementBags,
        limeBags: result.auxiliary.limeBags,
        sandM3: result.auxiliary.sandM3,
      },
    });
    setAddedToBudget(true);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Você vai precisar de:
        </h2>
      </div>

      <div className="flex flex-col items-center gap-1 rounded-2xl bg-primary px-6 py-8 text-center text-primary-foreground">
        <span className="text-xs font-semibold tracking-wide">
          {material.resultLabel.toUpperCase()}
        </span>
        <span className="text-5xl font-semibold tabular-nums tracking-tight">
          {formatInteger(result.units)}
        </span>
        <span className="text-sm text-primary-foreground/80">unidades</span>
      </div>

      <Card size="sm" className="divide-y divide-border py-0">
        <InfoRow
          label="Área líquida"
          value={`${formatDecimal(result.netAreaM2)} m²`}
        />
        <InfoRow
          label="Perda considerada"
          value={`${result.wastePercentage}%`}
        />
        <InfoRow
          label="Argamassa"
          value={`${formatDecimal(result.auxiliary.mortarM3)} m³`}
        />
        <InfoRow label="Cimento" value={`${result.auxiliary.cementBags} sacos`} />
        <InfoRow label="Cal" value={`${result.auxiliary.limeBags} sacos`} />
        <InfoRow
          label="Areia"
          value={`${formatDecimal(result.auxiliary.sandM3)} m³`}
        />
      </Card>

      <details className="group rounded-xl border border-border bg-card open:pb-1">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground marker:content-none">
          Ver detalhes do cálculo
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="divide-y divide-border border-t border-border">
          <InfoRow
            label="Área bruta"
            value={`${formatDecimal(result.grossAreaM2)} m²`}
          />
          <InfoRow
            label="Aberturas"
            value={`${formatDecimal(result.openingsAreaM2)} m²`}
          />
          <InfoRow
            label="Área líquida"
            value={`${formatDecimal(result.netAreaM2)} m²`}
          />
          <InfoRow label="Perda" value={`${result.wastePercentage}%`} />
          <InfoRow
            label="Quantidade por m²"
            value={`${formatDecimal(material.unitsPerSquareMeter)} un.`}
          />
        </div>
      </details>

      {addedToBudget ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="size-4.5" aria-hidden="true" />
            <p className="text-sm font-medium">
              Resultado adicionado ao orçamento
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onNewCalculation}
              className="flex-1"
            >
              Novo cálculo
            </Button>
            <Button
              size="lg"
              className="flex-1"
              nativeButton={false}
              render={<Link href="/orcamentos/novo">Criar novo orçamento</Link>}
            />
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onNewCalculation}
            className="flex-1"
          >
            Novo cálculo
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={handleAddToBudget}
            className="flex-1"
          >
            Adicionar ao orçamento
          </Button>
        </div>
      )}
    </div>
  );
}
