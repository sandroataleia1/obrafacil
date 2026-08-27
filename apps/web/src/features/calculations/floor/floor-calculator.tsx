"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDecimal, formatInteger, parseDecimalInput } from "@/lib/decimal";
import { setPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";
import { DecimalField } from "../shared/decimal-field";
import { FlowHeader } from "../shared/flow-header";
import { StepFooter } from "../shared/step-footer";

type FloorStep = "dimensions" | "box" | "waste" | "result";

const STEPS: FloorStep[] = ["dimensions", "box", "waste"];

function positive(value: number | null): value is number {
  return value !== null && value > 0;
}

function ErrorMessage({ value }: { value: string }) {
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

export function FloorCalculator() {
  const router = useRouter();
  const [step, setStep] = useState<FloorStep>("dimensions");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [coverage, setCoverage] = useState("");
  const [waste, setWaste] = useState(10);
  const [addedToBudget, setAddedToBudget] = useState(false);

  const lengthValue = parseDecimalInput(length);
  const widthValue = parseDecimalInput(width);
  const coverageValue = parseDecimalInput(coverage);
  const dimensionsValid = positive(lengthValue) && positive(widthValue);
  const coverageValid = positive(coverageValue);
  const area = dimensionsValid ? lengthValue * widthValue : 0;
  const areaWithWaste = area * (1 + waste / 100);

  // Prototype calculation for UI validation only.
  // Laravel Calculation Engine will be the source of truth.
  const boxes = coverageValid ? Math.ceil(areaWithWaste / coverageValue) : 0;

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
    if (step === "dimensions" && dimensionsValid) setStep("box");
    if (step === "box" && coverageValid) setStep("waste");
    if (step === "waste") setStep("result");
  }

  function reset() {
    setStep("dimensions");
    setLength("");
    setWidth("");
    setCoverage("");
    setWaste(10);
    setAddedToBudget(false);
  }

  function handleAddToBudget() {
    setPendingBudgetItem({
      source: "floor",
      title: "Piso",
      areaM2: area,
      wastePercentage: waste,
      coveragePerBoxM2: coverageValue ?? 0,
      boxes,
    });
    setAddedToBudget(true);
  }

  return (
    <div className="pb-24 md:pb-0">
      <FlowHeader
        title={step === "result" ? "Resultado" : "Piso"}
        step={stepIndex >= 0 ? { current: stepIndex + 1, total: STEPS.length } : undefined}
        onBack={back}
      />

      <div className="pt-2">
        {step === "dimensions" ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Qual a área do piso?
            </h2>
            <DecimalField id="floor-length" label="Comprimento" unit="m" value={length} onChange={setLength} placeholder="0,00" />
            <ErrorMessage value={length} />
            <DecimalField id="floor-width" label="Largura" unit="m" value={width} onChange={setWidth} placeholder="0,00" />
            <ErrorMessage value={width} />
            {dimensionsValid ? (
              <div className="flex justify-between rounded-lg bg-muted px-4 py-3 text-sm">
                <span className="text-muted-foreground">Área</span>
                <span className="font-semibold">{formatDecimal(area)} m²</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "box" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Quanto rende cada caixa?
              </h2>
              <p className="text-sm text-muted-foreground">
                Informe a cobertura indicada na embalagem. Ela varia conforme a
                quantidade e as dimensões das peças.
              </p>
            </div>
            <DecimalField id="floor-coverage" label="Cobertura por caixa" unit="m²" value={coverage} onChange={setCoverage} placeholder="0,00" />
            <ErrorMessage value={coverage} />
          </div>
        ) : null}

        {step === "waste" ? (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Quer considerar perda?
              </h2>
              <p className="text-sm text-muted-foreground">
                Recomendamos 10% para recortes e quebras.
              </p>
            </div>
            <div className="flex gap-2">
              {[5, 10, 15].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setWaste(item)}
                  className={
                    waste === item
                      ? "flex-1 rounded-lg border border-primary bg-primary/5 py-2.5 text-sm font-semibold text-primary"
                      : "flex-1 rounded-lg border border-border bg-card py-2.5 text-sm font-semibold"
                  }
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
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-primary px-6 py-8 text-center text-primary-foreground">
              <span className="text-xs font-semibold tracking-wide">CAIXAS DE PISO</span>
              <span className="text-5xl font-semibold tabular-nums">{formatInteger(boxes)}</span>
              <span className="text-sm text-primary-foreground/80">caixas</span>
            </div>
            <Card size="sm" className="divide-y divide-border py-0">
              <InfoRow label="Área do piso" value={`${formatDecimal(area)} m²`} />
              <InfoRow label="Perda considerada" value={`${waste}%`} />
              <InfoRow label="Área com perda" value={`${formatDecimal(areaWithWaste)} m²`} />
              <InfoRow label="Cobertura por caixa" value={`${formatDecimal(coverageValue ?? 0)} m²`} />
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
          continueDisabled={(step === "dimensions" && !dimensionsValid) || (step === "box" && !coverageValid)}
        />
      ) : null}
    </div>
  );
}
