/**
 * Frontend contract for the Laravel API's identity payload
 * (`App\Support\MePayload`). Deliberately NOT shared/imported from PHP —
 * each side defines its own types (see ADR-001).
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface CompanySummary {
  id: string;
  name: string;
}

export type CompanyRole = "owner" | "admin" | "member";

export interface Membership {
  company: CompanySummary;
  role: CompanyRole;
}

/** Shape returned by POST /api/v1/login, POST /api/v1/register, GET /api/v1/me, and POST /api/v1/companies/{id}/activate. */
export interface MePayload {
  user: AuthUser;
  memberships: Membership[];
  active_company: CompanySummary | null;
  requires_company_selection: boolean;
}
