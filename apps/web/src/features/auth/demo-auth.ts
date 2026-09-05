/**
 * Autenticação de demonstração — não apropriada para produção.
 *
 * This is a frontend-only credential check for the ObraFácil pilot —
 * there is no backend, no token, no hash, no session secret, nothing
 * that should be mistaken for real security. It exists solely so the
 * pilot can be gated behind a login screen before Laravel
 * authentication exists. When the real backend is integrated, this
 * entire module is replaced — never extended into JWT-like tokens,
 * custom crypto, or a middleware that pretends to validate a secret
 * that doesn't actually exist on the client.
 *
 * The demo password is a plain constant needed to validate the login
 * — it is NEVER written to the persisted session. Only the minimal
 * `DemoAuthSession` shape below is persisted.
 */

const DEMO_EMAIL = "admin@admin.com";
const DEMO_PASSWORD = "admin@123";
const DEMO_USER: DemoAuthUser = { email: DEMO_EMAIL, name: "Administrador" };

const STORAGE_KEY = "obrafacil:demo-auth-session";

export interface DemoAuthUser {
  email: string;
  name: string;
}

export interface DemoAuthSession {
  authenticated: true;
  user: DemoAuthUser;
}

export type AuthenticateResult = { ok: true; session: DemoAuthSession } | { ok: false; error: string };

/**
 * Exact match on email (trimmed) and password (never trimmed/altered)
 * — the only "credential rule" this demo needs. Never reveals which
 * of the two fields was wrong.
 */
export function authenticateDemoUser(email: string, password: string): AuthenticateResult {
  const normalizedEmail = email.trim();
  if (normalizedEmail === DEMO_EMAIL && password === DEMO_PASSWORD) {
    const session: DemoAuthSession = { authenticated: true, user: DEMO_USER };
    setDemoAuthSession(session);
    return { ok: true, session };
  }
  return { ok: false, error: "E-mail ou senha inválidos." };
}

function isValidDemoAuthSession(value: unknown): value is DemoAuthSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DemoAuthSession>;
  return (
    candidate.authenticated === true &&
    typeof candidate.user === "object" &&
    candidate.user !== null &&
    typeof candidate.user.email === "string" &&
    typeof candidate.user.name === "string"
  );
}

export function getDemoAuthSession(): DemoAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidDemoAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setDemoAuthSession(session: DemoAuthSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/** Removes ONLY the auth session key — never touches any other `obrafacil:*` store. */
export function clearDemoAuthSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
