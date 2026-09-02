"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDecimal, formatInteger } from "@/lib/decimal";
import { setPendingBudgetItem } from "@/features/budgets/prototype/pending-budget-item";
import {
  CEILING_ANCHORS_PER_RODAFORRO,
  CEILING_PANEL_LENGTHS_M,
  CEILING_PANEL_WIDTH_M,
  CEILING_RODAFORRO_LENGTH_M,
  CEILING_SCREWS_PER_RODAFORRO,
  CEILING_WIRE_TOTAL,
} from "@/mocks/calculations/ceiling";
import { FlowHeader } from "../shared/flow-header";
import { StepFooter } from "../shared/step-footer";
import { RoomGroup } from "./room-group";
import { ceilingRoomAreaM2, ceilingRoomPerimeterM, type CeilingRoom } from "./types";

type CeilingStep = "rooms" | "panel" | "waste" | "result";

const STEPS: CeilingStep[] = ["rooms", "panel", "waste"];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function MaterialRow({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <div className="text-right">
        <p className="text-sm font-semibold text-foreground">{value}</p>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
    </div>
  );
}

interface RoomYield {
  room: CeilingRoom;
  panelArea: number;
  panels: number;
}

export function CeilingCalculator() {
  const router = useRouter();
  const [step, setStep] = useState<CeilingStep>("rooms");
  const [rooms, setRooms] = useState<CeilingRoom[]>([]);
  const [waste, setWaste] = useState(10);
  const [addedToBudget, setAddedToBudget] = useState(false);

  const roomsValid = rooms.length > 0;
  const panelValid = roomsValid && rooms.every((room) => room.panelLengthM !== null);
  const area = rooms.reduce((sum, room) => sum + ceilingRoomAreaM2(room), 0);
  const perimeter = rooms.reduce((sum, room) => sum + ceilingRoomPerimeterM(room), 0);
  const areaWithWaste = area * (1 + waste / 100);

  function setRoomPanelLength(roomId: string, panelLengthM: number) {
    setRooms((current) =>
      current.map((room) => (room.id === roomId ? { ...room, panelLengthM } : room))
    );
  }

  // Prototype calculation for UI validation only.
  // Laravel Calculation Engine will be the source of truth.
  // Each room picks its own panel length, so coverage and panel count are
  // computed per room, then summed — a leftover cut from one room's panel
  // can't be reused in another, so rounding up per room (not on the
  // combined total area) gives a realistic purchase quantity.
  const roomYields: RoomYield[] = rooms.map((room) => {
    const panelArea = room.panelLengthM !== null ? room.panelLengthM * CEILING_PANEL_WIDTH_M : 0;
    const panels =
      panelArea > 0
        ? Math.ceil((ceilingRoomAreaM2(room) * (1 + waste / 100)) / panelArea)
        : 0;
    return { room, panelArea, panels };
  });
  const panels = roomYields.reduce((sum, item) => sum + item.panels, 0);
  const rodaforros = Math.ceil(perimeter / CEILING_RODAFORRO_LENGTH_M);
  const screws = rodaforros * CEILING_SCREWS_PER_RODAFORRO;
  const anchors = rodaforros * CEILING_ANCHORS_PER_RODAFORRO;
  const wire = CEILING_WIRE_TOTAL;

  // Grand total broken down by panel length — rooms can use different
  // lengths, so a single "N placas de X m" figure wouldn't be accurate.
  const panelsByLength = roomYields.reduce<Map<number, number>>((map, item) => {
    if (item.room.panelLengthM === null) return map;
    map.set(item.room.panelLengthM, (map.get(item.room.panelLengthM) ?? 0) + item.panels);
    return map;
  }, new Map());
  const panelsByLengthList = [...panelsByLength.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([length, count]) => ({ length, count }));

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
    if (step === "rooms" && roomsValid) setStep("panel");
    if (step === "panel" && panelValid) setStep("waste");
    if (step === "waste") setStep("result");
  }

  function reset() {
    setStep("rooms");
    setRooms([]);
    setWaste(10);
    setAddedToBudget(false);
  }

  function handleAddToBudget() {
    // Most-used panel length across rooms — the budget hand-off carries a
    // single representative length/width for the line-item label; pricing
    // itself is by total area, so this doesn't affect the cost.
    const mostUsedLength = panelsByLengthList[0]?.length ?? 0;

    setPendingBudgetItem({
      source: "ceiling",
      title: "Forro",
      areaM2: area,
      wastePercentage: waste,
      panelLengthM: mostUsedLength,
      panelWidthM: CEILING_PANEL_WIDTH_M,
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
        {step === "rooms" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Quais são os cômodos do forro?
              </h2>
              <p className="text-sm text-muted-foreground">
                Adicione cada cômodo com suas medidas.
              </p>
            </div>
            <RoomGroup items={rooms} onChange={setRooms} />
            {roomsValid ? (
              <div className="flex justify-between rounded-lg bg-muted px-4 py-3 text-sm">
                <span className="text-muted-foreground">Área total</span>
                <span className="font-semibold text-foreground">{formatDecimal(area)} m²</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "panel" ? (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Escolha o comprimento da placa de cada cômodo
              </h2>
              <p className="text-sm text-muted-foreground">
                As placas de forro estão disponíveis em 3, 4, 6 ou 7 metros. A
                largura é fixa em {formatDecimal(CEILING_PANEL_WIDTH_M)} m.
              </p>
            </div>

            <div className="space-y-3">
              {roomYields.map(({ room, panelArea, panels: roomPanels }) => (
                <div key={room.id} className="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{room.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDecimal(ceilingRoomAreaM2(room))} m²
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`Comprimento da placa — ${room.name}`}
                    className="grid grid-cols-4 gap-1.5"
                  >
                    {CEILING_PANEL_LENGTHS_M.map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="radio"
                        aria-checked={room.panelLengthM === item}
                        onClick={() => setRoomPanelLength(room.id, item)}
                        className={cn(
                          "rounded-lg border bg-card py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          room.panelLengthM === item
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-foreground hover:border-primary/30"
                        )}
                      >
                        {item} m
                      </button>
                    ))}
                  </div>
                  {room.panelLengthM !== null ? (
                    <div className="flex items-center justify-between px-0.5 text-xs">
                      <span className="text-muted-foreground">
                        Cobertura por placa: {formatDecimal(panelArea)} m²
                      </span>
                      <span className="font-medium text-foreground">
                        ~{formatInteger(roomPanels)} placa{roomPanels === 1 ? "" : "s"}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
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

            <div className="space-y-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Materiais para a casa
              </span>
              <Card size="sm" className="divide-y divide-border py-0">
                <MaterialRow
                  label="Placas de forro PVC"
                  value={`${formatInteger(panels)} un`}
                  helper={panelsByLengthList
                    .map((item) => `${formatInteger(item.count)} de ${item.length} m`)
                    .join(" · ")}
                />
                <MaterialRow
                  label="Rodaforro"
                  value={`${formatInteger(rodaforros)} barras`}
                  helper={`${formatDecimal(CEILING_RODAFORRO_LENGTH_M)} m cada`}
                />
                <MaterialRow label="Parafusos" value={`${formatInteger(screws)} un`} />
                <MaterialRow label="Buchas" value={`${formatInteger(anchors)} un`} />
                <MaterialRow label="Arame" value={`${formatInteger(wire)} un`} />
              </Card>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Por cômodo
              </span>
              <Card size="sm" className="divide-y divide-border py-0">
                {roomYields.map(({ room, panels: roomPanels }) => (
                  <InfoRow
                    key={room.id}
                    label={room.name}
                    value={`${formatInteger(roomPanels)} placa${roomPanels === 1 ? "" : "s"} de ${room.panelLengthM} m`}
                  />
                ))}
              </Card>
            </div>

            <Card size="sm" className="divide-y divide-border py-0">
              <InfoRow label="Área do forro" value={`${formatDecimal(area)} m²`} />
              <InfoRow label="Perda das placas" value={`${waste}%`} />
              <InfoRow label="Área com perda" value={`${formatDecimal(areaWithWaste)} m²`} />
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
          onBack={step === "rooms" ? undefined : back}
          onContinue={next}
          continueLabel={step === "waste" ? "Ver resultado" : "Continuar"}
          continueDisabled={(step === "rooms" && !roomsValid) || (step === "panel" && !panelValid)}
        />
      ) : null}
    </div>
  );
}
