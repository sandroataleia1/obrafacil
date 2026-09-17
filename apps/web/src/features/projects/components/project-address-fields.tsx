"use client";

/**
 * FRONTEND-PROJECTS-01 §18-23. Structured address fields for a Project's
 * OWN address snapshot — mirrors `features/customers/address-fields.tsx`
 * field-for-field, minus `label`/`type` (those are CustomerAddress
 * concepts; `Project.address` never has them, §18). Owns its own "Buscar
 * CEP" call, same fill rules as the Customer version (postal_code/street/
 * neighborhood/city/state always; complement only when still empty).
 *
 * The CEP lookup is manually triggered by a button that's disabled while
 * a request is in flight — a second lookup literally cannot fire until
 * the first resolves, so the "stale CEP response" race (§22) can't occur
 * by construction; no extra generation counter is needed here.
 */

import { useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import { BRAZILIAN_STATE_CODES } from "@/lib/brazilian-states";
import { formatCep, onlyDigits } from "@/lib/document";
import { lookupCep } from "@/features/customers/customers-client";

export interface ProjectAddressFieldsValue {
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference_point: string;
}

export const EMPTY_PROJECT_ADDRESS_FIELDS: ProjectAddressFieldsValue = {
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  reference_point: "",
};

export function isProjectAddressFieldsEmpty(value: ProjectAddressFieldsValue): boolean {
  return Object.values(value).every((field) => field.trim() === "");
}

export function ProjectAddressFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ProjectAddressFieldsValue;
  onChange: (patch: Partial<ProjectAddressFieldsValue>) => void;
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
        complement: value.complement === "" ? (result.provider_complement ?? value.complement) : value.complement,
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
