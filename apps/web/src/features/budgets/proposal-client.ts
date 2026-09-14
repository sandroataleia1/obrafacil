/**
 * Thin wrapper over `apiRequest` for the PUBLIC Proposal domain
 * (`/api/v1/proposals/{token}`) — no authenticated session, no
 * CurrentCompany/tenant context, no localStorage. `apiRequest` already
 * uses cookie-session auth only when the server actually requires it;
 * these public endpoints simply don't require a session, so calling
 * them through the same client is safe — never a raw `fetch` (§11/§63).
 */

import { apiRequest } from "@/lib/api-client";
import type { ApproveProposalPayload, PublicProposal, RejectProposalPayload } from "./types";

export function getPublicProposal(token: string): Promise<PublicProposal> {
  return apiRequest<PublicProposal>(`/api/v1/proposals/${encodeURIComponent(token)}`);
}

export function approvePublicProposal(
  token: string,
  payload: ApproveProposalPayload
): Promise<PublicProposal> {
  return apiRequest<PublicProposal>(`/api/v1/proposals/${encodeURIComponent(token)}/approve`, {
    method: "POST",
    body: payload,
  });
}

export function rejectPublicProposal(
  token: string,
  payload: RejectProposalPayload
): Promise<PublicProposal> {
  return apiRequest<PublicProposal>(`/api/v1/proposals/${encodeURIComponent(token)}/reject`, {
    method: "POST",
    body: payload,
  });
}
