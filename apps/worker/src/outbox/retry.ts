/** Intentos tras los cuales una notificacion se marca como fallida definitivamente. */
export const MAX_ATTEMPTS = 7;
const MAX_BACKOFF_MINUTES = 60;

/** Backoff exponencial: 2, 4, 8... minutos, con tope de una hora. */
export function retryDelayMinutes(attempts: number) {
  return Math.min(MAX_BACKOFF_MINUTES, 2 ** attempts);
}

export function retryDecision(attempts: number, now = new Date()) {
  return {
    failed: attempts >= MAX_ATTEMPTS,
    nextRetryAt: new Date(now.getTime() + retryDelayMinutes(attempts) * 60_000),
  };
}
