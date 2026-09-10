/**
 * Thin wrapper over `apiRequest` for the real Customers domain (mirrors
 * `features/notifications/notifications-client.ts`) — the only place in
 * the app allowed to know the `/api/v1/customers` / `/api/v1/lookups/*`
 * paths. Every caller (list/detail/create/edit pages, BudgetForm,
 * ProjectForm) goes through here — never a raw `fetch` (C12/LK1/LK2).
 */

import { apiRequest } from "@/lib/api-client";
import type {
  AddressCreatePayload,
  AddressUpdatePayload,
  CompanyRegistryLookupResult,
  ContactCreatePayload,
  ContactUpdatePayload,
  Customer,
  CustomerAddress,
  CustomerContact,
  CustomerCreatePayload,
  CustomerPaginationResponse,
  CustomerUpdatePayload,
  PostalCodeLookupResult,
} from "./types";

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listCustomers(params: {
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<CustomerPaginationResponse> {
  const query = buildQuery({
    search: params.search,
    page: params.page,
    per_page: params.perPage,
  });
  return apiRequest<CustomerPaginationResponse>(`/api/v1/customers${query}`);
}

export function getCustomer(id: string): Promise<Customer> {
  return apiRequest<Customer>(`/api/v1/customers/${encodeURIComponent(id)}`);
}

export function createCustomer(payload: CustomerCreatePayload): Promise<Customer> {
  return apiRequest<Customer>("/api/v1/customers", { method: "POST", body: payload });
}

export function updateCustomer(id: string, payload: CustomerUpdatePayload): Promise<Customer> {
  return apiRequest<Customer>(`/api/v1/customers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

export function deleteCustomer(id: string): Promise<void> {
  return apiRequest<void>(`/api/v1/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function createAddress(
  customerId: string,
  payload: AddressCreatePayload
): Promise<CustomerAddress> {
  return apiRequest<CustomerAddress>(`/api/v1/customers/${encodeURIComponent(customerId)}/addresses`, {
    method: "POST",
    body: payload,
  });
}

export function updateAddress(
  customerId: string,
  addressId: string,
  payload: AddressUpdatePayload
): Promise<CustomerAddress> {
  return apiRequest<CustomerAddress>(
    `/api/v1/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}`,
    { method: "PUT", body: payload }
  );
}

export function deleteAddress(customerId: string, addressId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}`,
    { method: "DELETE" }
  );
}

export function createContact(
  customerId: string,
  payload: ContactCreatePayload
): Promise<CustomerContact> {
  return apiRequest<CustomerContact>(`/api/v1/customers/${encodeURIComponent(customerId)}/contacts`, {
    method: "POST",
    body: payload,
  });
}

export function updateContact(
  customerId: string,
  contactId: string,
  payload: ContactUpdatePayload
): Promise<CustomerContact> {
  return apiRequest<CustomerContact>(
    `/api/v1/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(contactId)}`,
    { method: "PUT", body: payload }
  );
}

export function deleteContact(customerId: string, contactId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(contactId)}`,
    { method: "DELETE" }
  );
}

export function lookupCep(cep: string): Promise<PostalCodeLookupResult> {
  return apiRequest<PostalCodeLookupResult>(`/api/v1/lookups/cep${buildQuery({ cep })}`);
}

export function lookupCnpj(cnpj: string): Promise<CompanyRegistryLookupResult> {
  return apiRequest<CompanyRegistryLookupResult>(`/api/v1/lookups/cnpj${buildQuery({ cnpj })}`);
}
