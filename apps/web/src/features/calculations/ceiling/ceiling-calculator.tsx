"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDecimal, formatInteger, parseDecimalInput } from "@/lib/decimal";
import { setPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";
import {
  CEILING_PANEL_LENGTHS_M,
  CEILING_RODAFORRO_LENGTH_M,
} from "@/mocks/calculations/ceiling";
import { DecimalField } from "../shared/decimal-field";
import { FlowHeader } from "../shared/flow-header";
import { StepFooter } from "../shared/step-footer";

type CeilingStep = "dimensions" | "panel" | "waste" | "result";

const STEPS: CeilingStep[] = ["dimensions", "panel", "waste"];

function positive(value: number | null): value is number {
  return value !== null && value > 0;
}

function FieldError({ value }: { value: string }) {
  return value !== "" && !positive(parseDecimalInput(value)) ? (
    <p className="text-xs text-destructive">Informe um valor maior que zero.</p>
  ) : null;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function CeilingCalculator() {
  const router = useRouter();
  const [step, setStep] = useState<CeilingStep>("dimensions");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [panelLength, setPanelLength] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState("");
  const [waste, setWaste] = useState(10);
  const [addedToBudget, setAddedToBudget] = useState(false);

  const lengthValue = parseDecimalInput(length);
  const widthValue = parseDecimalInput(width);
  const panelWidthValue = parseDecimalInput(panelWidth);
  const dimensionsValid = positive(lengthValue) && positive(widthValue);
  const panelValid = panelLength !== null && positive(panelWidthValue);
  const area = dimensionsValid ? lengthValue * widthValue : 0;
  const perimeter = dimensionsValid ? 2 * (lengthValue + widthValue) : 0;
  const panelArea = panelValid ? panelLength * panelWidthValue : 0;
  const areaWithWaste = area * (1 + waste / 100);

  // Prototype calculation for UI validation only.
  // Laravel Calculation Engine will be the source of truth.
  const panels = panelArea > 0 ? Math.ceil(areaWithWaste / panelArea) : 0;
  const rodaforros = Math.ceil(perimeter / CEILING_RODAFORRO_LENGTH_M);

  const stepIndex = STEPS.indexOf(step);

  function back() {
    if (step === "dimensions") {
      router.push("/calcular");
    } else if (step === "result") {
      setStep("waste");
    } else {
      setStep(STEPS[STEPS.indexOf(step) - 1]);
    }
  }

  function next() {
    if (step === "dimensions" && dimensionsValid) setStep("panel");
    if (step === "panel" && panelValid) setStep("waste");
    if (step === "waste") setStep("result");
  }

  function reset() {
    setStep("dimensions");
    setLength("");
    setWidth("");
    setPanelLength(null);
    setPanelWidth("");
    setWaste(10);
    setAddedToBudget(false);
  }

  function handleAddToBudget() {
    setPendingBudgetItem({
      source: "ceiling",
      title: "Forro",
      areaM2: area,
      wastePercentage: waste,
      panelLengthM: panelLength ?? 0,
      panelWidthM: panelWidthValue ?? 0,
      panels,
      rodaforroLengthM: CEILING_RODAFORRO_LENGTH_M,
      rodaforros,
    });
    setAddedToBudget(true);
  }

  return (
    <div className="pb-24 md:pb-0">
      <FlowHeader
        title={step === "result" ? "Resultado" : "Forro"}
        step={stepIndex >= 0 ? { current: stepIndex + 1, total: STEPS.length } : undefined}
        onBack={back}
      />

      <div className="pt-2">
        {step === "dimensions" ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Qual a área do forro?
            </h2>
            <DecimalField id="ceiling-length" label="Comprimento" unit="m" value={length} onChange={setLength} placeholder="0,00" />
            <FieldError value={length} />
            <DecimalField id="ceiling-width" label="Largura" unit="m" value={width} onChange={setWidth} placeholder="0,00" />
            <FieldError value={width} />
            {dimensionsValid ? (
              <div className="flex justify-between rounded-lg bg-muted px-4 py-3 text-sm">
                <span className="text-muted-foreground">Área</span>
                <span className="font-semibold text-foreground">{formatDecimal(area)} m²</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "panel" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Escolha o comprimento da placa
              </h2>
              <p className="text-sm text-muted-foreground">
                As placas de forro estão disponíveis em 3, 4, 6 ou 7 metros.
              </p>
            </div>
            <div role="radiogroup" aria-label="Comprimento da placa" className="grid grid-cols-2 gap-2">
              {CEILING_PANEL_LENGTHS_M.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={panelLength === item}
                  onClick={() => setPanelLength(item)}
                  className={cn(
                    "rounded-xl border bg-card py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    panelLength === item
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-foreground hover:border-primary/30"
                  )}
                >
                  {item} m
                </button>
              ))}
            </div>
            <DecimalField id="ceiling-panel-width" label="Largura da placa" unit="m" value={panelWidth} onChange={setPanelWidth} placeholder="0,00" />
            <FieldError value={panelWidth} />
            {panelValid ? (
              <div className="flex justify-between rounded-lg bg-muted px-4 py-3 text-sm">
                <span className="text-muted-foreground">Cobertura por placa</span>
                <span className="font-semibold text-foreground">{formatDecimal(panelArea)} m²</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "waste" ? (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Quer considerar perda?
              </h2>
              <p className="text-sm text-muted-foreground">
                Recomendamos 10% para recortes e ajustes das placas.
              </p>
            </div>
            <div className="flex gap-2">
              {[5, 10, 15].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setWaste(item)}
                  className={cn(
                    "flex-1 rounded-lg border py-2.5 text-sm font-semibold",
                    waste === item
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-foreground"
                  )}
                >
                  {item}%
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === "result" ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Você vai precisar de:
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center gap-1 rounded-2xl bg-primary px-4 py-6 text-center text-primary-foreground">
                <span className="text-xs font-semibold tracking-wide">PLACAS</span>
                <span className="text-4xl font-semibold tabular-nums">{formatInteger(panels)}</span>
                <span className="text-sm text-primary-foreground/80">placas de {panelLength} m</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-2xl bg-primary px-4 py-6 text-center text-primary-foreground">
                <span className="text-xs font-semibold tracking-wide">RODAFORRO</span>
                <span className="text-4xl font-semibold tabular-nums">{formatInteger(rodaforros)}</span>
                <span className="text-sm text-primary-foreground/80">barras de 6 m</span>
              </div>
            </div>
            <Card size="sm" className="divide-y divide-border py-0">
              <InfoRow label="Área do forro" value={`${formatDecimal(area)} m²`} />
              <InfoRow label="Perda das placas" value={`${waste}%`} />
              <InfoRow label="Área com perda" value={`${formatDecimal(areaWithWaste)} m²`} />
              <InfoRow label="Cobertura por placa" value={`${formatDecimal(panelArea)} m²`} />
              <InfoRow label="Perímetro" value={`${formatDecimal(perimeter)} m`} />
              <InfoRow label="Rodaforro" value={`${formatDecimal(CEILING_RODAFORRO_LENGTH_M)} m por barra`} />
            </Card>

            {addedToBudget ? (
              <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="size-4.5" aria-hidden="true" />
                  <p className="text-sm font-medium">Resultado adicionado ao orçamento</p>
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" size="lg" onClick={reset} className="flex-1">
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
                <Button type="button" variant="outline" size="lg" onClick={reset} className="flex-1">
                  Novo cálculo
                </Button>
                <Button type="button" size="lg" onClick={handleAddToBudget} className="flex-1">
                  Adicionar ao orçamento
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {step !== "result" ? (
        <StepFooter
          onBack={step === "dimensions" ? undefined : back}
          onContinue={next}
          continueLabel={step === "waste" ? "Ver resultado" : "Continuar"}
          continueDisabled={(step === "dimensions" && !dimensionsValid) || (step === "panel" && !panelValid)}
        />
      ) : null}
    </div>
  );
}
