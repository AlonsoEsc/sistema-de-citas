import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/**
 * Reporte de errores del navegador a Sentry, solo si hay VITE_SENTRY_DSN. No envia
 * encabezados, cuerpos ni datos del usuario; las URLs pierden su query string.
 */
export function initMonitoring() {
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.url) {
          event.request.url = event.request.url.split("?")[0];
        }
      }
      return event;
    },
  });
}

function Fallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 text-center text-ink">
      <div className="max-w-sm space-y-3">
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="text-sm text-ink-muted">
          Ocurrió un error inesperado. Recarga la página; si se repite,
          avísanos.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary"
        >
          Recargar
        </button>
      </div>
    </main>
  );
}

/** Pantalla de error amable en lugar de una pagina en blanco si un componente falla. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={<Fallback />}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
