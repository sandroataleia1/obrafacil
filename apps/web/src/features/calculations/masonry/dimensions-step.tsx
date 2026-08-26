import { formatDecimal, parseDecimalInput } from "@/lib/decimal";
import { DecimalField } from "./decimal-field";

interface DimensionsStepProps {
  length: string;
  height: string;
  onChangeLength: (raw: string) => void;
  onChangeHeight: (raw: string) => void;
  lengthError?: string;
  heightError?: string;
}

export function DimensionsStep({
  length,
  height,
  onChangeLength,
  onChangeHeight,
  lengthError,
  heightError,
}: DimensionsStepProps) {
  const lengthValue = parseDecimalInput(length);
  const heightValue = parseDecimalInput(height);
  const showPreview =
    lengthValue !== null &&
    lengthValue > 0 &&
    heightValue !== null &&
    heightValue > 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Qual o tamanho da parede?
      </h2>

      <div className="space-y-4">
        <DecimalField
          id="masonry-length"
          label="Comprimento"
          unit="m"
          value={length}
          onChange={onChangeLength}
          placeholder="0,00"
          error={lengthError}
        />
        <DecimalField
          id="masonry-height"
          label="Altura"
          unit="m"
          value={height}
          onChange={onChangeHeight}
          placeholder="0,00"
          error={heightError}
        />
      </div>

      {showPreview ? (
        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">
            Área bruta
          </span>
          <span className="text-sm font-semibold text-foreground">
            {formatDecimal(lengthValue * heightValue)} m²
          </span>
        </div>
      ) : null}
    </div>
  );
}
