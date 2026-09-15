import { apiRequest } from "@/lib/api-client";
import type { CompanyProfile, CompanyProfileUpdatePayload } from "./types";

const ENDPOINT = "/api/v1/company/profile";

export function getCompanyProfile(): Promise<CompanyProfile> {
  return apiRequest<CompanyProfile>(ENDPOINT);
}

/**
 * §4: `payload` is always the FLAT `CompanyProfileUpdatePayload` shape —
 * never the nested `CompanyProfile` GET/PUT response shape.
 */
export function updateCompanyProfile(payload: CompanyProfileUpdatePayload): Promise<CompanyProfile> {
  return apiRequest<CompanyProfile>(ENDPOINT, { method: "PUT", body: payload });
}

/** §5/§42: multipart upload — `apiRequest` passes a FormData body straight to fetch (§7). */
export function uploadCompanyLogo(file: File): Promise<CompanyProfile> {
  const form = new FormData();
  form.append("logo", file);
  return apiRequest<CompanyProfile>(`${ENDPOINT}/logo`, { method: "POST", body: form });
}

export function deleteCompanyLogo(): Promise<CompanyProfile> {
  return apiRequest<CompanyProfile>(`${ENDPOINT}/logo`, { method: "DELETE" });
}
