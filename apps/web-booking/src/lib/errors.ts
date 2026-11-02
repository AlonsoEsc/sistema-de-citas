import axios from "axios";

type ApiErrorBody = {
  error?: string;
  message?: unknown;
  detail?: Array<{ message?: string }>;
};

/** Mensaje de la API ({ error, message, detail }) o el texto por defecto. */
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
    if (typeof body?.message === "string" && body.message.trim()) {
      return body.message;
    }
  }
  return fallback;
}
