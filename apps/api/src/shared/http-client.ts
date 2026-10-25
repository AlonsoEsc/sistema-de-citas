const DEFAULT_TIMEOUT_MS = 10_000;

/** fetch con timeout: ninguna llamada a un proveedor externo puede colgar una peticion. */
export function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** Lee el cuerpo JSON de una respuesta sin fallar si no es JSON. */
export async function readJson<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}
