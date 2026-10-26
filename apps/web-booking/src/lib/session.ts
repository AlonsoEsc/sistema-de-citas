import { useCallback, useEffect, useState } from "react";
import { bookingApi } from "./api";

/** Datos del cliente para la interfaz; el token va en una cookie httpOnly. */
export type BookingSession = {
  customer: {
    id: string;
    fullName: string;
    phone?: string;
    email?: string;
  };
};

function storageKey(slug: string) {
  return `booking_session_${slug}`;
}

function readSession(slug: string): BookingSession | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    const parsed = raw ? (JSON.parse(raw) as BookingSession) : null;
    return parsed?.customer?.id ? { customer: parsed.customer } : null;
  } catch {
    return null;
  }
}

/**
 * Sesion del cliente en el portal de un negocio (una por negocio). Si la API rechaza el
 * token (vencido o revocado), se borra y se llama a `onExpired`.
 */
export function useBookingSession(slug: string, onExpired: () => void) {
  const [session, setSession] = useState<BookingSession | null>(() =>
    readSession(slug),
  );

  const save = useCallback(
    (next: BookingSession) => {
      setSession(next);
      try {
        localStorage.setItem(storageKey(slug), JSON.stringify(next));
      } catch {
        // Sin almacenamiento la sesion dura hasta cerrar la pestana.
      }
    },
    [slug],
  );

  const forget = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(storageKey(slug));
    } catch {
      // Nada que borrar.
    }
  }, [slug]);

  useEffect(() => {
    const id = bookingApi.interceptors.response.use(undefined, (error) => {
      const url = String(error?.config?.url ?? "");
      if (error?.response?.status === 401 && !url.includes("/auth/")) {
        forget();
        onExpired();
      }
      return Promise.reject(error);
    });
    return () => bookingApi.interceptors.response.eject(id);
  }, [forget, onExpired]);

  /** Cerrar sesion: la API borra la cookie (el navegador no puede, es httpOnly). */
  const clear = useCallback(() => {
    void bookingApi.post(`/public/${slug}/auth/logout`).catch(() => undefined);
    forget();
  }, [forget, slug]);

  return { session, save, clear, forget };
}
