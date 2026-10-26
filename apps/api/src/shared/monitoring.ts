import * as Sentry from "@sentry/node";

/**
 * Reporte de errores a Sentry. Solo se activa con SENTRY_DSN; sin el, las funciones no
 * hacen nada. Nunca se envian datos personales: ni encabezados, ni cuerpos, ni usuarios.
 */
export function initMonitoring(options: {
  dsn?: string;
  environment: string;
  release: string;
  service: string;
}) {
  if (!options.dsn) {
    return false;
  }
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    initialScope: { tags: { service: options.service } },
    beforeSend(event) {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
  });
  return true;
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Envia los eventos pendientes antes de que el proceso termine. */
export function flushMonitoring() {
  return Sentry.flush(2_000);
}
