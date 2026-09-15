/**
 * FRONTEND-COMPANY-PROFILE-01 §4: mirrors `App\Http\Resources\CompanyProfileResource`
 * (GET/PUT response shape) — `address` is nested here.
 */
export interface CompanyProfileAddress {
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_point: string | null;
}

export interface CompanyProfile {
  id: string;
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;

  phone: string | null;
  whatsapp: string | null;
  email: string | null;

  address: CompanyProfileAddress;

  timezone: string;

  logo_url: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * §4: mirrors `UpdateCompanyProfileRequest`'s rules() — deliberately FLAT
 * (never `address: {...}`), because that's the actual wire shape the PUT
 * endpoint accepts. `CompanyProfile.address` (nested, GET/PUT response)
 * and `CompanyProfileUpdatePayload` (flat, PUT request) are two distinct
 * shapes on purpose — never conflate them, and never
 * `updateCompanyProfile(profile)` a raw `CompanyProfile` directly.
 */
export interface CompanyProfileUpdatePayload {
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  document: string | null;

  phone: string | null;
  whatsapp: string | null;
  email: string | null;

  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_point: string | null;

  timezone: string;
}
