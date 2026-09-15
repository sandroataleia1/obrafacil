"use client";

import { useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { BRAZILIAN_STATE_CODES } from "@/lib/brazilian-states";
import { formatCep, onlyDigits } from "@/lib/document";
import { lookupCep } from "@/features/customers/customers-client";

/**
 * §26-30: the Company's institutional address — deliberately NOT a reuse
 * of Customer's `AddressFields`, which carries `label`/`type` fields that
 * don't exist on a Company (§27). Everything else (CEP lookup + fields)
 * mirrors it, plus its own lookup-ordering guard (§29) that
 * `AddressFields` doesn't have: editing the CEP field invalidates
 * whatever lookup is in flight, and a superseded lookup's response is
 * discarded even if it resolves later.
 */
export interface CompanyAddressFieldsValue {
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference_point: string;
}

export const EMPTY_COMPANY_ADDRESS_FIELDS: CompanyAddressFieldsValue = {
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  reference_point: "",
};

export function CompanyAddressFields({
  value,
  onChange,
  idPrefix,
  disabled = false,
}: {
  value: CompanyAddressFieldsValue;
  onChange: (patch: Partial<CompanyAddressFieldsValue>) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const cepLookupGenerationRef = useRef(0);

  /** §29: editing the CEP invalidates any in-flight lookup — a response
   * for a CEP the user has since changed away from must never apply,
   * and "Buscar" must never get stuck disabled for the new CEP. */
  function handlePostalCodeChange(nextDigits: string) {
    cepLookupGenerationRef.current += 1;
    setCepStatus("idle");
    setCepMessage(null);
    onChange({ postal_code: nextDigits });
  }

  async function handleLookupCep() {
    const digits = onlyDigits(value.postal_code);
    if (digits.length !== 8) {
      setCepStatus("error");
      setCepMessage("Informe um CEP com 8 dígitos.");
      return;
    }

    const myGeneration = ++cepLookupGenerationRef.current;
    setCepStatus("loading");
    setCepMessage(null);
    try {
      const result = await lookupCep(digits);
      if (cepLookupGenerationRef.current !== myGeneration) return; // superseded by a newer lookup

      onChange({
        postal_code: result.postal_code,
        street: result.street ?? value.street,
        neighborhood: result.neighborhood ?? value.neighborhood,
        city: result.city ?? value.city,
        state: result.state ?? value.state,
        complement: value.complement === "" ? (result.provider_complement ?? value.complement) : value.complement,
      });
      setCepStatus("idle");
    } catch (error) {
      if (cepLookupGenerationRef.current !== myGeneration) return;
      setCepStatus("error");
      if (error instanceof ApiError && error.status === 404) {
        setCepMessage("CEP não encontrado. Você pode preencher o endereço manualmente.");
      } else if (error instanceof ApiValidationError) {
        setCepMessage("CEP inválido.");
      } else {
        setCepMessage("Não foi possível consultar o CEP agora. Preencha manualmente ou tente novamente.");
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-cep`} className="text-sm font-medium text-foreground">
          CEP <span className="text-muted-foreground">(opcional)</span>
        </label>
        <div className="flex gap-2">
          <input
            id={`${idPrefix}-cep`}
            type="text"
            inputMode="numeric"
            value={formatCep(value.postal_code)}
            disabled={disabled}
            onChange={(event) => handlePostalCodeChange(onlyDigits(event.target.value).slice(0, 8))}
            placeholder="30140-110"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleLookupCep()}
            disabled={disabled || cepStatus === "loading"}
            aria-label="Buscar CEP"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {cepStatus === "loading" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-4" aria-hidden="true" />
            )}
            Buscar
          </button>
        </div>
        {cepMessage ? (
          <p role="alert" className="text-xs text-destructive">
            {cepMessage}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1.5">
          <label htmlFor={`${idPrefix}-street`} className="text-sm font-medium text-foreground">
            Logradouro
          </label>
          <input
            id={`${idPrefix}-street`}
            type="text"
            value={value.street}
            disabled={disabled}
            onChange={(event) => onChange({ street: event.target.value })}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-number`} className="text-sm font-medium text-foreground">
            Número
          </label>
          <input
            id={`${idPrefix}-number`}
            type="text"
            value={value.number}
            disabled={disabled}
            onChange={(event) => onChange({ number: event.target.value })}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-complement`} className="text-sm font-medium text-foreground">
          Complemento <span className="text-muted-foreground">(opcional)</span>
        </label>
        <input
          id={`${idPrefix}-complement`}
          type="text"
          value={value.complement}
          disabled={disabled}
          onChange={(event) => onChange({ complement: event.target.value })}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-neighborhood`} className="text-sm font-medium text-foreground">
          Bairro
        </label>
        <input
          id={`${idPrefix}-neighborhood`}
          type="text"
          value={value.neighborhood}
          disabled={disabled}
          onChange={(event) => onChange({ neighborhood: event.target.value })}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1.5">
          <label htmlFor={`${idPrefix}-city`} className="text-sm font-medium text-foreground">
            Cidade
          </label>
          <input
            id={`${idPrefix}-city`}
            type="text"
            value={value.city}
            disabled={disabled}
            onChange={(event) => onChange({ city: event.target.value })}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">UF</span>
          <Select
            value={value.state || null}
            onValueChange={(next) => onChange({ state: next ?? "" })}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-state`} className="h-12 w-full px-3 text-base">
              <SelectValue placeholder="UF">{(current: string | null) => current ?? "UF"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BRAZILIAN_STATE_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-reference`} className="text-sm font-medium text-foreground">
          Ponto de referência <span className="text-muted-foreground">(opcional)</span>
        </label>
        <input
          id={`${idPrefix}-reference`}
          type="text"
          value={value.reference_point}
          disabled={disabled}
          onChange={(event) => onChange({ reference_point: event.target.value })}
          placeholder="Ao lado da farmácia"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      </div>
    </div>
  );
}
