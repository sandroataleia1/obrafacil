import type { CustomerAddressType } from "./types";

export const ADDRESS_TYPE_LABELS: Record<CustomerAddressType, string> = {
  residential: "Residencial",
  commercial: "Comercial",
  work_site: "Obra",
  billing: "Cobrança",
  delivery: "Entrega",
  other: "Outro",
};

export const ADDRESS_TYPE_OPTIONS: { value: CustomerAddressType; label: string }[] = (
  Object.entries(ADDRESS_TYPE_LABELS) as [CustomerAddressType, string][]
).map(([value, label]) => ({ value, label }));
