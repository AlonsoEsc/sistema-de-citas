import { useCallback, useEffect, useState } from "react";
import { bookingApi } from "./api";

export type BookingSession = {
  token: string;
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
    return parsed?.token ? parsed : null;
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

  const clear = useCallback(() => {
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
        clear();
        onExpired();
      }
      return Promise.reject(error);
    });
    return () => bookingApi.interceptors.response.eject(id);
  }, [clear, onExpired]);

  return { session, save, clear };
}

export function authHeader(session: BookingSession) {
  return { Authorization: `Bearer ${session.token}` };
}
