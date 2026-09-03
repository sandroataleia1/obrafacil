"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDecimal, formatInteger, parseDecimalInput } from "@/lib/decimal";
import { setPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";
import { AreaRoomGroup } from "../shared/area-room-group";
import { areaRoomAreaM2, totalAreaM2, type AreaRoom } from "../shared/area-room";
import { DecimalField } from "../shared/decimal-field";
import { FlowHeader } from "../shared/flow-header";
import { StepFooter } from "../shared/step-footer";

type FloorStep = "rooms" | "box" | "waste" | "result";

const STEPS: FloorStep[] = ["rooms", "box", "waste"];

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
  const [step, setStep] = useState<FloorStep>("rooms");
  const [rooms, setRooms] = useState<AreaRoom[]>([]);
  const [coverage, setCoverage] = useState("");
  const [waste, setWaste] = useState(10);
  const [addedToBudget, setAddedToBudget] = useState(false);

  const coverageValue = parseDecimalInput(coverage);
  const roomsValid = rooms.length > 0;
  const coverageValid = positive(coverageValue);
  const area = roomsValid ? totalAreaM2(rooms) : 0;
  const areaWithWaste = area * (1 + waste / 100);

  // Prototype calculation for UI validation only.
  // Laravel Calculation Engine will be the source of truth.
  const boxes = coverageValid ? Math.ceil(areaWithWaste / coverageValue) : 0;

  const stepIndex = STEPS.indexOf(step);

  function back() {
    if (step === "rooms") {
      router.push("/calcular");
    } else if (step === "result") {
      setStep("waste");
    } else {
      setStep(STEPS[STEPS.indexOf(step) - 1]);
    }
  }

  function next() {
    if (step === "rooms" && roomsValid) setStep("box");
    if (step === "box" && coverageValid) setStep("waste");
    if (step === "waste") setStep("result");
  }

  function reset() {
    setStep("rooms");
    setRooms([]);
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
        {step === "rooms" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Quais são os ambientes do piso?
              </h2>
              <p className="text-sm text-muted-foreground">
                Adicione cada ambiente com suas medidas.
              </p>
            </div>
            <AreaRoomGroup items={rooms} onChange={setRooms} />
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
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Áreas consideradas
              </h3>
              <Card size="sm" className="divide-y divide-border py-0">
                {rooms.map((room) => (
                  <InfoRow
                    key={room.id}
                    label={room.name}
                    value={`${formatDecimal(areaRoomAreaM2(room))} m²`}
                  />
                ))}
                <InfoRow label="Área total" value={`${formatDecimal(area)} m²`} />
              </Card>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Material para a área total
              </h3>
              <Card size="sm" className="divide-y divide-border py-0">
                <InfoRow label="Perda considerada" value={`${waste}%`} />
                <InfoRow label="Área com perda" value={`${formatDecimal(areaWithWaste)} m²`} />
                <InfoRow label="Cobertura por caixa" value={`${formatDecimal(coverageValue ?? 0)} m²`} />
              </Card>
            </div>

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
          onBack={step === "rooms" ? undefined : back}
          onContinue={next}
          continueLabel={step === "waste" ? "Ver resultado" : "Continuar"}
          continueDisabled={(step === "rooms" && !roomsValid) || (step === "box" && !coverageValid)}
        />
      ) : null}
    </div>
  );
}
