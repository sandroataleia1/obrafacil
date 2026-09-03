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
import { ceilingRoomAreaM2, ceilingRoomPerimeterM, type CeilingDirection, type CeilingRoom } from "./types";
import {
  computeCeilingYield,
  groupPurchaseByPanelLength,
  isSquareRoom,
  recommendDirection,
  type CeilingRoomYield,
} from "./panel-yield";

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

const DIRECTION_LABEL: Record<CeilingDirection, string> = {
  length: "Ao longo do comprimento",
  width: "Ao longo da largura",
};

/** Both directions for a room, given the chosen panel length and current
 * waste. For a square room, only "length" is meaningful — the two
 * directions are geometrically identical, so "width" is not computed. */
function roomDirectionYields(
  room: CeilingRoom,
  panelLengthM: number,
  waste: number
): { length: CeilingRoomYield; width: CeilingRoomYield | null } {
  const length = computeCeilingYield(room, "length", panelLengthM, CEILING_PANEL_WIDTH_M, waste);
  const width = isSquareRoom(room)
    ? null
    : computeCeilingYield(room, "width", panelLengthM, CEILING_PANEL_WIDTH_M, waste);
  return { length, width };
}

function effectiveYield(room: CeilingRoom, waste: number): CeilingRoomYield | null {
  if (room.panelLengthM === null) return null;
  const { length, width } = roomDirectionYields(room, room.panelLengthM, waste);
  if (width === null) return length;
  const direction = room.direction ?? recommendDirection(length, width);
  return direction === "width" ? width : length;
}

export function CeilingCalculator() {
  const router = useRouter();
  const [step, setStep] = useState<CeilingStep>("rooms");
  const [rooms, setRooms] = useState<CeilingRoom[]>([]);
  const [waste, setWaste] = useState(10);
  const [addedToBudget, setAddedToBudget] = useState(false);

  const roomsValid = rooms.length > 0;
  const roomYields = rooms.map((room) => effectiveYield(room, waste));
  const panelValid =
    roomsValid && roomYields.every((yieldItem) => yieldItem?.viability === "viable");
  const area = rooms.reduce((sum, room) => sum + ceilingRoomAreaM2(room), 0);
  const perimeter = rooms.reduce((sum, room) => sum + ceilingRoomPerimeterM(room), 0);

  function setRoomPanelLength(roomId: string, panelLengthM: number) {
    setRooms((current) =>
      current.map((room) => {
        if (room.id !== roomId) return room;
        if (isSquareRoom(room)) {
          return { ...room, panelLengthM, direction: "length" };
        }
        const { length, width } = roomDirectionYields(room, panelLengthM, waste);
        const currentDirectionStillViable =
          room.direction === "length"
            ? length.viability === "viable"
            : room.direction === "width" && width
              ? width.viability === "viable"
              : false;
        const direction = currentDirectionStillViable
          ? room.direction
          : width
            ? recommendDirection(length, width)
            : "length";
        return { ...room, panelLengthM, direction };
      })
    );
  }

  function setRoomDirection(roomId: string, direction: CeilingDirection) {
    setRooms((current) =>
      current.map((room) => (room.id === roomId ? { ...room, direction } : room))
    );
  }

  const viableYields = roomYields.filter(
    (item): item is CeilingRoomYield => item !== null && item.viability === "viable"
  );
  const totalPurchaseBars = viableYields.reduce((sum, item) => sum + item.purchaseBars, 0);
  const totalFinalPurchasedLengthM = viableYields.reduce(
    (sum, item) => sum + item.finalPurchasedLengthM,
    0
  );
  const panelsByLength = groupPurchaseByPanelLength(viableYields);

  // Rodaforro is intentionally left unchanged (aggregated globally across
  // all rooms) — the 005C spec preserves this behavior; not enough
  // evidence to justify moving it to a per-room model in this pass.
  const rodaforros = Math.ceil(perimeter / CEILING_RODAFORRO_LENGTH_M);
  const screws = rodaforros * CEILING_SCREWS_PER_RODAFORRO;
  const anchors = rodaforros * CEILING_ANCHORS_PER_RODAFORRO;
  const wire = CEILING_WIRE_TOTAL;

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
    setPendingBudgetItem({
      source: "ceiling",
      title: "Forro",
      areaM2: area,
      wastePercentage: waste,
      panelWidthM: CEILING_PANEL_WIDTH_M,
      panelsByLength,
      totalPurchaseBars,
      totalFinalPurchasedLengthM,
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
              {rooms.map((room) => {
                const square = isSquareRoom(room);
                const yields =
                  room.panelLengthM !== null
                    ? roomDirectionYields(room, room.panelLengthM, waste)
                    : null;
                const chosenDirection: CeilingDirection | null =
                  yields === null
                    ? null
                    : square
                      ? "length"
                      : (room.direction ??
                        (yields.width ? recommendDirection(yields.length, yields.width) : "length"));
                const chosenYield =
                  yields === null ? null : chosenDirection === "width" ? yields.width : yields.length;

                return (
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

                    {yields !== null && yields.width !== null ? (
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Direção</span>
                        <div role="radiogroup" aria-label={`Direção — ${room.name}`} className="grid grid-cols-2 gap-1.5">
                          {(["length", "width"] as CeilingDirection[]).map((direction) => {
                            const directionYield = direction === "length" ? yields.length : yields.width!;
                            const viable = directionYield.viability === "viable";
                            const selected = chosenDirection === direction;
                            return (
                              <button
                                key={direction}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={!viable}
                                onClick={() => setRoomDirection(room.id, direction)}
                                className={cn(
                                  "rounded-lg border px-2 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  !viable
                                    ? "cursor-not-allowed border-dashed border-destructive/40 bg-destructive/5 text-destructive/70"
                                    : selected
                                      ? "border-primary bg-primary/5 text-primary"
                                      : "border-border bg-card text-foreground hover:border-primary/30"
                                )}
                              >
                                <span className="block">{DIRECTION_LABEL[direction]}</span>
                                <span className="block text-[11px] font-normal opacity-80">
                                  {viable ? `${formatInteger(directionYield.purchaseBars)} barras` : "Exige emenda"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {chosenYield !== null ? (
                      chosenYield.viability === "viable" ? (
                        <div className="flex items-center justify-between px-0.5 text-xs">
                          <span className="text-muted-foreground">
                            {formatInteger(chosenYield.strips)} faixas · {formatInteger(chosenYield.cutsPerBar)}{" "}
                            corte{chosenYield.cutsPerBar === 1 ? "" : "s"}/barra
                          </span>
                          <span className="font-medium text-foreground">
                            ~{formatInteger(chosenYield.purchaseBars)} barra
                            {chosenYield.purchaseBars === 1 ? "" : "s"}
                          </span>
                        </div>
                      ) : (
                        <p className="px-0.5 text-xs text-destructive">
                          Esse comprimento não cobre o sentido escolhido sem emenda. Escolha outro
                          comprimento comercial ou, se disponível, a outra direção.
                        </p>
                      )
                    ) : null}
                  </div>
                );
              })}
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
                  value={`${formatInteger(totalPurchaseBars)} barras`}
                  helper={panelsByLength
                    .map((item) => `${formatInteger(item.purchaseBars)} de ${item.panelLengthM} m`)
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
                Por comprimento comercial
              </span>
              <Card size="sm" className="divide-y divide-border py-0">
                {panelsByLength.map((item) => (
                  <InfoRow
                    key={item.panelLengthM}
                    label={`${item.panelLengthM} m`}
                    value={`${formatInteger(item.purchaseBars)} barras · ${formatDecimal(item.finalPurchasedLengthM)} m`}
                  />
                ))}
              </Card>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Por cômodo
              </span>
              <Card size="sm" className="divide-y divide-border py-0">
                {rooms.map((room) => {
                  const yieldResult = effectiveYield(room, waste);
                  if (!yieldResult || yieldResult.viability !== "viable") return null;
                  return (
                    <div key={room.id} className="space-y-1 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">{room.name}</span>
                        <span className="text-sm font-semibold text-foreground">
                          {formatInteger(yieldResult.purchaseBars)} barras de {yieldResult.panelLengthM} m
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {DIRECTION_LABEL[yieldResult.direction]} · {formatInteger(yieldResult.strips)} faixas ·{" "}
                        {formatInteger(yieldResult.physicalBars)} barras físicas
                        {yieldResult.safetyBars > 0 ? ` + ${formatInteger(yieldResult.safetyBars)} de margem` : ""} ·{" "}
                        sobra {formatDecimal(yieldResult.geometricWasteLengthM)} m · aproveitamento{" "}
                        {formatDecimal(yieldResult.physicalUtilization * 100, 1)}%
                      </p>
                    </div>
                  );
                })}
              </Card>
            </div>

            <Card size="sm" className="divide-y divide-border py-0">
              <InfoRow label="Área do forro" value={`${formatDecimal(area)} m²`} />
              <InfoRow label="Perda considerada" value={`${waste}%`} />
              <InfoRow label="Metros lineares comprados" value={`${formatDecimal(totalFinalPurchasedLengthM)} m`} />
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
