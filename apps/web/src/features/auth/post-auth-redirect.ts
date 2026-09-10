/**
 * Single rule for "where does an authenticated user belong" — used after
 * login/register success and by every auth-adjacent route guard
 * (/login, /cadastro, /selecionar-empresa), so the decision is never
 * duplicated or allowed to drift between them.
 */
export function postAuthRedirectPath(state: { requiresCompanySelection: boolean }): string {
  return state.requiresCompanySelection ? "/selecionar-empresa" : "/";
}
