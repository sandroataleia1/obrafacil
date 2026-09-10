"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { BRAZILIAN_STATE_CODES } from "@/lib/brazilian-states";
import { formatCep, onlyDigits } from "@/lib/document";
import { lookupCep } from "./customers-client";
import { ADDRESS_TYPE_OPTIONS } from "./labels";
import type { CustomerAddressType } from "./types";

export interface AddressFieldsValue {
  label: string;
  type: CustomerAddressType;
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference_point: string;
}

export const EMPTY_ADDRESS_FIELDS: AddressFieldsValue = {
  label: "",
  type: "residential",
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  reference_point: "",
};

/**
 * Shared field set for both a create-flow address draft and the
 * detail-page edit dialog (§31/§50/§51). Owns its own "Buscar CEP" call
 * (§35/§36/§37): success fills postal_code/street/neighborhood/city/state
 * always, and complement only when still empty (§36) — label/number/
 * reference_point are NEVER touched by a CEP lookup (§36).
 */
export function AddressFields({
  value,
  onChange,
  idPrefix,
}: {
  value: AddressFieldsValue;
  onChange: (patch: Partial<AddressFieldsValue>) => void;
  idPrefix: string;
}) {
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cepMessage, setCepMessage] = useState<string | null>(null);

  async function handleLookupCep() {
    const digits = onlyDigits(value.postal_code);
    if (digits.length !== 8) {
      setCepStatus("error");
      setCepMessage("Informe um CEP com 8 dígitos.");
      return;
    }

    setCepStatus("loading");
    setCepMessage(null);
    try {
      const result = await lookupCep(digits);
      onChange({
        postal_code: result.postal_code,
        street: result.street ?? value.street,
        neighborhood: result.neighborhood ?? value.neighborhood,
        city: result.city ?? value.city,
        state: result.state ?? value.state,
        complement: value.complement === "" ? result.provider_complement ?? value.complement : value.complement,
      });
      setCepStatus("idle");
    } catch (error) {
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
        <label htmlFor={`${idPrefix}-label`} className="text-sm font-medium text-foreground">
          Identificação do endereço
        </label>
        <input
          id={`${idPrefix}-label`}
          type="text"
          value={value.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Casa, Loja Centro, Escritório, Obra Alphaville"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">Tipo</span>
        <Select value={value.type} onValueChange={(next) => onChange({ type: (next ?? "residential") as CustomerAddressType })}>
          <SelectTrigger id={`${idPrefix}-type`} className="h-12 w-full px-4 text-base">
            <SelectValue placeholder="Selecione o tipo">
              {(current: string | null) => ADDRESS_TYPE_OPTIONS.find((option) => option.value === current)?.label ?? "Selecione o tipo"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ADDRESS_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            onChange={(event) => onChange({ postal_code: onlyDigits(event.target.value).slice(0, 8) })}
            placeholder="30140-110"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => void handleLookupCep()}
            disabled={cepStatus === "loading"}
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
            onChange={(event) => onChange({ street: event.target.value })}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
            onChange={(event) => onChange({ number: event.target.value })}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
          onChange={(event) => onChange({ complement: event.target.value })}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
          onChange={(event) => onChange({ neighborhood: event.target.value })}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
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
            onChange={(event) => onChange({ city: event.target.value })}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">UF</span>
          <Select value={value.state || null} onValueChange={(next) => onChange({ state: next ?? "" })}>
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
          onChange={(event) => onChange({ reference_point: event.target.value })}
          placeholder="Ao lado da farmácia"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}
