"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { parseDecimalInput } from "@/lib/decimal";
import { masonryMaterials } from "@/mocks/calculations/masonry";
import { DimensionsStep } from "./dimensions-step";
import { FlowHeader } from "./flow-header";
import { MaterialStep } from "./material-step";
import { calculateMasonry } from "./prototype-calculator";
import { OpeningsStep } from "./openings-step";
import { ResultStep } from "./result";
import { StepFooter } from "./step-footer";
import { MASONRY_STEPS, type MasonryStep, type OpeningItem } from "./types";
import { WasteStep } from "./waste-step";

const DEFAULT_WASTE = 10;

export function MasonryCalculator() {
  const router = useRouter();

  const [step, setStep] = useState<MasonryStep>("material");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [length, setLength] = useState("");
  const [height, setHeight] = useState("");
  const [hasOpenings, setHasOpenings] = useState<boolean | null>(null);
  const [doors, setDoors] = useState<OpeningItem[]>([]);
  const [windows, setWindows] = useState<OpeningItem[]>([]);
  const [wastePercentage, setWastePercentage] = useState(DEFAULT_WASTE);

  const material = masonryMaterials.find((item) => item.id === materialId) ?? null;

  const lengthValue = parseDecimalInput(length);
  const heightValue = parseDecimalInput(height);
  const dimensionsValid =
    lengthValue !== null && lengthValue > 0 && heightValue !== null && heightValue > 0;
  const lengthError =
    length !== "" && (lengthValue === null || lengthValue <= 0)
      ? "Informe um valor maior que zero."
      : undefined;
  const heightError =
    height !== "" && (heightValue === null || heightValue <= 0)
      ? "Informe um valor maior que zero."
      : undefined;

  function resetAll() {
    setStep("material");
    setMaterialId(null);
    setLength("");
    setHeight("");
    setHasOpenings(null);
    setDoors([]);
    setWindows([]);
    setWastePercentage(DEFAULT_WASTE);
  }

  function goBack() {
    if (step === "material") {
      router.push("/calcular");
      return;
    }
    if (step === "result") {
      setStep("waste");
      return;
    }
    const index = MASONRY_STEPS.indexOf(step);
    if (index > 0) setStep(MASONRY_STEPS[index - 1]);
  }

  function goNext() {
    if (step === "material") {
      if (!material) return;
      setStep("dimensions");
    } else if (step === "dimensions") {
      if (!dimensionsValid) return;
      setStep("openings");
    } else if (step === "openings") {
      if (hasOpenings === null) return;
      setStep("waste");
    } else if (step === "waste") {
      setStep("result");
    }
  }

  const stepIndex = MASONRY_STEPS.indexOf(step);
  const headerStep =
    stepIndex >= 0 ? { current: stepIndex + 1, total: MASONRY_STEPS.length } : undefined;

  return (
    <div className="pb-24 md:pb-0">
      <FlowHeader
        title={step === "result" ? "Resultado" : "Alvenaria"}
        step={headerStep}
        onBack={goBack}
      />

      <div className="pt-2">
        {step === "material" ? (
          <MaterialStep selectedId={materialId} onSelect={setMaterialId} />
        ) : null}

        {step === "dimensions" ? (
          <DimensionsStep
            length={length}
            height={height}
            onChangeLength={setLength}
            onChangeHeight={setHeight}
            lengthError={lengthError}
            heightError={heightError}
          />
        ) : null}

        {step === "openings" ? (
          <OpeningsStep
            hasOpenings={hasOpenings}
            onChangeHasOpenings={setHasOpenings}
            doors={doors}
            onChangeDoors={setDoors}
            windows={windows}
            onChangeWindows={setWindows}
          />
        ) : null}

        {step === "waste" ? (
          <WasteStep value={wastePercentage} onChange={setWastePercentage} />
        ) : null}

        {step === "result" && material && dimensionsValid ? (
          <ResultStep
            material={material}
            result={calculateMasonry({
              material,
              lengthM: lengthValue as number,
              heightM: heightValue as number,
              doors,
              windows,
              wastePercentage,
            })}
            onNewCalculation={resetAll}
          />
        ) : null}
      </div>

      {step !== "result" ? (
        <StepFooter
          onBack={step === "material" ? undefined : goBack}
          onContinue={goNext}
          continueLabel={step === "waste" ? "Ver resultado" : "Continuar"}
          continueDisabled={
            (step === "material" && !material) ||
            (step === "dimensions" && !dimensionsValid) ||
            (step === "openings" && hasOpenings === null)
          }
        />
      ) : null}
    </div>
  );
}
