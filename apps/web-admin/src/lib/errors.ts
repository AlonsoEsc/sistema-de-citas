import axios from "axios";

type ApiErrorBody = {
  error?: string;
  message?: unknown;
  detail?: Array<{ message?: string }>;
};

/**
 * Mensaje legible de un error de la API ({ error, message, detail }) o un texto por
 * defecto. En errores de validacion muestra el motivo concreto del primer campo.
 */
export function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    const detail =
      body?.error === "VALIDATION_ERROR"
        ? body.detail?.[0]?.message
        : undefined;
    if (detail) {
      return detail;
    }
    const message = body?.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}
