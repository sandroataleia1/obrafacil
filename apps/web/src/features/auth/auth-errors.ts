import { ApiError, ApiNetworkError, ApiValidationError } from "@/lib/api-client";

/**
 * Turns a thrown auth-request error into a single, generic, Portuguese
 * message safe to show the user — never the raw backend message (which is
 * in English and, for credential failures, must not confirm/deny whether
 * an email exists), never a stacktrace or raw JSON.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    // Field-level errors are handled separately by the form; this is only
    // the fallback for a general/non-field validation failure.
    return "Verifique os dados informados.";
  }

  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 422) {
      return "E-mail ou senha inválidos.";
    }
    if (error.status === 429) {
      return "Muitas tentativas. Aguarde um momento e tente novamente.";
    }
    if (error.status === 419) {
      return "Sua sessão expirou. Atualize a página e tente novamente.";
    }
    if (error.status === 409) {
      return "Você já está autenticado.";
    }
    return "Não foi possível concluir a operação. Tente novamente.";
  }

  if (error instanceof ApiNetworkError) {
    return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}
