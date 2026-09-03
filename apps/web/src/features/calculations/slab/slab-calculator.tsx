"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDecimal, parseDecimalInput } from "@/lib/decimal";
import { setPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";
import {
  SLAB_CEMENT_BAGS_PER_M3,
  SLAB_GRAVEL_M3_PER_M3,
  SLAB_SAND_M3_PER_M3,
} from "@/mocks/calculations/slab";
import { AreaRoomGroup } from "../shared/area-room-group";
import { areaRoomAreaM2, totalAreaM2, type AreaRoom } from "../shared/area-room";
import { DecimalField } from "../shared/decimal-field";
import { FlowHeader } from "../shared/flow-header";
import { StepFooter } from "../shared/step-footer";

type SlabStep =
  | "rooms"
  | "type"
  | "filling"
  | "thickness"
  | "waste"
  | "result";
type SlabType = "foam" | "block";

const STEPS: SlabStep[] = ["rooms", "type", "filling", "thickness", "waste"];

const SLAB_TYPES: { id: SlabType; name: string; description: string }[] = [
  {
    id: "foam",
    name: "Laje de isopor",
    description: "Enchimento com EPS",
  },
  {
    id: "block",
    name: "Laje de bloco",
    description: "Enchimento com blocos cerâmicos ou de concreto",
  },
];

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

export function SlabCalculator() {
  const router = useRouter();
  const [step, setStep] = useState<SlabStep>("rooms");
  const [rooms, setRooms] = useState<AreaRoom[]>([]);
  const [slabType, setSlabType] = useState<SlabType | null>(null);
  const [fillingCoverage, setFillingCoverage] = useState("");
  const [thickness, setThickness] = useState("");
  const [waste, setWaste] = useState(5);
  const [addedToBudget, setAddedToBudget] = useState(false);

  const thicknessValue = parseDecimalInput(thickness);
  const fillingCoverageValue = parseDecimalInput(fillingCoverage);
  const roomsValid = rooms.length > 0;
  const fillingValid = positive(fillingCoverageValue);
  const thicknessValid = positive(thicknessValue);
  const area = roomsValid ? totalAreaM2(rooms) : 0;
  const concreteVolume = thicknessValid ? area * (thicknessValue / 100) : 0;
  const volumeWithWaste = concreteVolume * (1 + waste / 100);
  const areaWithWaste = area * (1 + waste / 100);

  // Prototype calculation for UI validation only.
  // Laravel Calculation Engine will be the source of truth. This is a
  // preliminary quantity estimate, NOT a structural slab design — it does
  // not calculate rebar, joists, formwork, span, load or deflection.
  const fillingUnits = fillingValid
    ? Math.ceil(areaWithWaste / fillingCoverageValue)
    : 0;
  const cementBags = Math.ceil(volumeWithWaste * SLAB_CEMENT_BAGS_PER_M3);
  const sandM3 = volumeWithWaste * SLAB_SAND_M3_PER_M3;
  const gravelM3 = volumeWithWaste * SLAB_GRAVEL_M3_PER_M3;
  const fillingName = slabType === "foam" ? "Placas de isopor" : "Blocos de laje";
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
    if (step === "rooms" && roomsValid) setStep("type");
    if (step === "type" && slabType) setStep("filling");
    if (step === "filling" && fillingValid) setStep("thickness");
    if (step === "thickness" && thicknessValid) setStep("waste");
    if (step === "waste") setStep("result");
  }

  function reset() {
    setStep("rooms");
    setRooms([]);
    setSlabType(null);
    setFillingCoverage("");
    setThickness("");
    setWaste(5);
    setAddedToBudget(false);
  }

  function handleAddToBudget() {
    const typeLabel = SLAB_TYPES.find((item) => item.id === slabType)?.name ?? "";
    setPendingBudgetItem({
      source: "slab",
      title: "Laje",
      slabTypeLabel: typeLabel,
      areaM2: area,
      thicknessCm: thicknessValue ?? 0,
      wastePercentage: waste,
      concreteVolumeM3: concreteVolume,
      concreteVolumeWithWasteM3: volumeWithWaste,
      fillingName,
      fillingUnits,
      cementBags,
      sandM3,
      gravelM3,
    });
    setAddedToBudget(true);
  }

  return (
    <div className="pb-24 md:pb-0">
      <FlowHeader
        title={step === "result" ? "Resultado" : "Laje"}
        step={stepIndex >= 0 ? { current: stepIndex + 1, total: STEPS.length } : undefined}
        onBack={back}
      />

      <div className="pt-2">
        {step === "rooms" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Quais são os ambientes da laje?
              </h2>
              <p className="text-sm text-muted-foreground">
                Adicione cada ambiente com suas medidas.
              </p>
            </div>
            <AreaRoomGroup items={rooms} onChange={setRooms} />
          </div>
        ) : null}

        {step === "type" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Qual o tipo de laje?
              </h2>
              <p className="text-sm text-muted-foreground">
                Escolha o material de enchimento da laje.
              </p>
            </div>
            <div role="radiogroup" aria-label="Tipo de laje" className="space-y-3">
              {SLAB_TYPES.map((item) => {
                const selected = slabType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSlabType(item.id)}
                    className={cn(
                      "w-full rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "filling" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Qual o rendimento de cada {slabType === "foam" ? "placa" : "bloco"}?
              </h2>
              <p className="text-sm text-muted-foreground">
                Informe a cobertura indicada pelo fabricante para calcular a quantidade de{" "}
                {slabType === "foam" ? "placas de isopor" : "blocos de laje"}.
              </p>
            </div>
            <DecimalField
              id="slab-filling-coverage"
              label="Cobertura por unidade"
              unit="m²"
              value={fillingCoverage}
              onChange={setFillingCoverage}
              placeholder="0,00"
            />
            <FieldError value={fillingCoverage} />
          </div>
        ) : null}

        {step === "thickness" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Qual a espessura?
              </h2>
              <p className="text-sm text-muted-foreground">
                Use a espessura definida no projeto estrutural.
              </p>
            </div>
            <DecimalField id="slab-thickness" label="Espessura" unit="cm" value={thickness} onChange={setThickness} placeholder="0,00" />
            <FieldError value={thickness} />
          </div>
        ) : null}

        {step === "waste" ? (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Quer considerar perda?
              </h2>
              <p className="text-sm text-muted-foreground">Recomendamos 5% para o concreto.</p>
            </div>
            <div className="flex gap-2">
              {[0, 5, 10].map((item) => (
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
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Você vai precisar de:
              </h2>
              <p className="text-sm text-muted-foreground">
                Estimativa de materiais — não substitui projeto estrutural.
              </p>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-primary px-6 py-8 text-center text-primary-foreground">
              <span className="text-xs font-semibold tracking-wide">CONCRETO</span>
              <span className="text-5xl font-semibold tabular-nums">{formatDecimal(volumeWithWaste)}</span>
              <span className="text-sm text-primary-foreground/80">m³</span>
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
                Materiais para a área total
              </h3>
              <Card size="sm" className="divide-y divide-border py-0">
                <InfoRow
                  label="Tipo de laje"
                  value={SLAB_TYPES.find((item) => item.id === slabType)?.name ?? ""}
                />
                <InfoRow label="Espessura" value={`${formatDecimal(thicknessValue ?? 0)} cm`} />
                <InfoRow label="Volume sem perda" value={`${formatDecimal(concreteVolume)} m³`} />
                <InfoRow label="Perda considerada" value={`${waste}%`} />
              </Card>
              <Card size="sm" className="divide-y divide-border py-0">
                <InfoRow label={fillingName} value={`${fillingUnits} unidades`} />
                <InfoRow label="Cimento" value={`${cementBags} sacos de 50 kg`} />
                <InfoRow label="Areia" value={`${formatDecimal(sandM3)} m³`} />
                <InfoRow label="Brita" value={`${formatDecimal(gravelM3)} m³`} />
              </Card>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Estimativa preliminar de materiais. Esta calculadora não dimensiona a
              estrutura da laje. Armaduras, vigotas, formas, espessuras e
              especificações devem seguir o projeto estrutural e as orientações
              técnicas aplicáveis.
            </p>

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
          continueDisabled={
            (step === "rooms" && !roomsValid) ||
            (step === "type" && !slabType) ||
            (step === "filling" && !fillingValid) ||
            (step === "thickness" && !thicknessValid)
          }
        />
      ) : null}
    </div>
  );
}
