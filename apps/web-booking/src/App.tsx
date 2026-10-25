import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import dayjs from "dayjs";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle,
  LogOut,
  Smartphone,
} from "lucide-react";
import { bookingApi, tenantSlug } from "./lib/api";
import type {
  AvailabilityResponse,
  CustomerAppointment,
  Service,
  Staff,
} from "./lib/types";
import { PRODUCT_NAME } from "./config/brand";

type BookingView = "auth" | "menu" | "book" | "cancel";

type BookingSession = {
  token: string;
  customer: {
    id: string;
    fullName: string;
    phone?: string;
    email?: string;
  };
};

type StartAuthResponse = {
  ok: boolean;
  sessionId: string;
  expiresAt: string;
  phoneMasked: string;
  channel: "sms" | "whatsapp";
  devOtpCode?: string;
};

type VerifyAuthResponse = {
  ok: boolean;
  token: string;
  customer: BookingSession["customer"];
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
    FB?: {
      init: (config: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: {
          authResponse?: { accessToken: string };
        }) => void,
        options: { scope: string },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const SESSION_KEY = `booking_session_${tenantSlug}`;

function formatDateLabel(value: string) {
  return new Date(value).toLocaleString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(priceCents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(priceCents / 100);
}

function Notice({
  tone,
  children,
  onClose,
}: {
  tone: "success" | "error" | "info" | "warning";
  children: ReactNode;
  onClose?: () => void;
}) {
  const styles = {
    success: "border-emerald-800/40 bg-emerald-950/40 text-emerald-300",
    error: "border-rose-800/40 bg-rose-950/35 text-rose-300",
    info: "border-blue-800/40 bg-blue-950/30 text-blue-300",
    warning: "border-amber-800/40 bg-amber-950/25 text-amber-300",
  }[tone];

  const Icon =
    tone === "success" ? CheckCircle : tone === "warning" ? AlertCircle : Check;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs font-bold ${styles}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{children}</span>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-[10px] font-extrabold uppercase tracking-wider hover:underline"
        >
          Aceptar
        </button>
      )}
    </div>
  );
}

function BookingContent() {
  const queryClient = useQueryClient();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined;
  const facebookAppId = import.meta.env.VITE_FACEBOOK_APP_ID as
    | string
    | undefined;
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<BookingView>("auth");
  const [bookingSession, setBookingSession] = useState<BookingSession | null>(
    null,
  );
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [slot, setSlot] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [authSessionId, setAuthSessionId] = useState<string | null>(null);
  const [otpDebugCode, setOtpDebugCode] = useState<string | null>(null);
  const [otpChannel, setOtpChannel] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      setView("auth");
      return;
    }
    try {
      const parsed = JSON.parse(stored) as BookingSession;
      setBookingSession(parsed);
      setView("menu");
    } catch {
      localStorage.removeItem(SESSION_KEY);
      setView("auth");
    }
  }, []);

  // Si el token del cliente vence o es rechazado, vuelve a pedir verificacion del telefono.
  useEffect(() => {
    const interceptorId = bookingApi.interceptors.response.use(
      undefined,
      (err) => {
        const url = String(err?.config?.url ?? "");
        if (err?.response?.status === 401 && !url.includes("/auth/")) {
          localStorage.removeItem(SESSION_KEY);
          setBookingSession(null);
          setView("auth");
          setSuccess(null);
          setError("Tu sesion vencio. Verifica tu telefono de nuevo.");
        }
        return Promise.reject(err);
      },
    );
    return () => bookingApi.interceptors.response.eject(interceptorId);
  }, []);

  const servicesQuery = useQuery({
    queryKey: ["public-services", tenantSlug],
    enabled: Boolean(bookingSession && view === "book"),
    queryFn: async () =>
      (await bookingApi.get<Service[]>(`/public/${tenantSlug}/services`)).data,
  });

  const staffQuery = useQuery({
    queryKey: ["public-staff", tenantSlug],
    enabled: Boolean(bookingSession && view === "book"),
    queryFn: async () =>
      (await bookingApi.get<Staff[]>(`/public/${tenantSlug}/staff`)).data,
  });

  const availabilityQuery = useQuery({
    queryKey: ["availability", tenantSlug, staffId, serviceId, date],
    enabled: Boolean(
      bookingSession && view === "book" && staffId && serviceId && date,
    ),
    queryFn: async () =>
      (
        await bookingApi.get<AvailabilityResponse>(
          `/public/${tenantSlug}/availability`,
          {
            params: { date, staffId, serviceIds: serviceId },
          },
        )
      ).data,
  });

  const myAppointmentsQuery = useQuery({
    queryKey: ["my-appointments", tenantSlug],
    enabled: Boolean(bookingSession && view === "cancel"),
    queryFn: async () =>
      (
        await bookingApi.get<CustomerAppointment[]>(
          `/public/${tenantSlug}/my-appointments`,
          {
            headers: { Authorization: `Bearer ${bookingSession?.token}` },
          },
        )
      ).data,
  });

  const slots = useMemo(
    () => availabilityQuery.data?.data[0]?.slots ?? [],
    [availabilityQuery.data],
  );
  const selectedService = servicesQuery.data?.find(
    (service) => service.id === serviceId,
  );
  const selectedStaff = staffQuery.data?.find((staff) => staff.id === staffId);

  const startAuthMutation = useMutation({
    mutationFn: async (payload: {
      provider: "manual" | "google" | "facebook";
      phone: string;
      fullName?: string;
      email?: string;
      googleIdToken?: string;
      facebookAccessToken?: string;
    }) =>
      (
        await bookingApi.post<StartAuthResponse>(
          `/public/${tenantSlug}/auth/start`,
          payload,
        )
      ).data,
    onSuccess: (response) => {
      setAuthSessionId(response.sessionId);
      setOtpChannel(response.channel);
      setOtpDebugCode(response.devOtpCode ?? null);
      setAuthInfo(
        `Codigo enviado a ${response.phoneMasked} por ${response.channel}.`,
      );
      setError(null);
    },
    onError: (err: unknown) => {
      const response = (
        err as { response?: { status?: number; data?: { message?: string } } }
      ).response;
      setAuthInfo(null);
      setError(
        response?.status === 429
          ? (response.data?.message ??
              "Demasiados intentos. Espera unos minutos.")
          : "No se pudo enviar el codigo. Revisa telefono y configuracion social.",
      );
    },
  });

  const verifyAuthMutation = useMutation({
    mutationFn: async () =>
      (
        await bookingApi.post<VerifyAuthResponse>(
          `/public/${tenantSlug}/auth/verify`,
          {
            sessionId: authSessionId,
            code: otpCode,
          },
        )
      ).data,
    onSuccess: (response) => {
      const session: BookingSession = {
        token: response.token,
        customer: response.customer,
      };
      setBookingSession(session);
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setView("menu");
      setError(null);
      setSuccess(null);
      setAuthInfo("Telefono verificado correctamente.");
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      setError(
        status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : "Codigo invalido o expirado.",
      );
    },
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!bookingSession?.token) {
        throw new Error("No auth");
      }
      await bookingApi.post(
        `/public/${tenantSlug}/book`,
        { staffId, serviceIds: [serviceId], startAt: slot },
        { headers: { Authorization: `Bearer ${bookingSession.token}` } },
      );
    },
    onSuccess: async () => {
      setError(null);
      setSuccess("Cita confirmada correctamente.");
      setSlot("");
      setView("menu");
      await queryClient.invalidateQueries({
        queryKey: ["my-appointments", tenantSlug],
      });
    },
    onError: (err: unknown) => {
      const defaultMessage = "No se pudo reservar.";
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { message?: string } } }).response
          ?.data?.message === "string"
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : defaultMessage;
      setSuccess(null);
      setError(message ?? defaultMessage);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      if (!bookingSession?.token) {
        throw new Error("No auth");
      }
      return bookingApi.post(
        `/public/${tenantSlug}/cancel`,
        { appointmentId },
        { headers: { Authorization: `Bearer ${bookingSession.token}` } },
      );
    },
    onSuccess: async () => {
      setError(null);
      setSuccess("Cita cancelada correctamente.");
      await queryClient.invalidateQueries({
        queryKey: ["my-appointments", tenantSlug],
      });
    },
    onError: () => {
      setSuccess(null);
      setError("No se pudo cancelar la cita.");
    },
  });

  useEffect(() => {
    if (!googleClientId || view !== "auth") {
      return;
    }
    const scriptId = "google-gsi-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const timer = window.setInterval(() => {
      if (!window.google || !googleButtonRef.current) {
        return;
      }
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: ({ credential }) => {
          if (!phone) {
            setError("Para Google login, primero escribe tu telefono.");
            return;
          }
          startAuthMutation.mutate({
            provider: "google",
            phone,
            googleIdToken: credential,
          });
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 280,
      });
      window.clearInterval(timer);
    }, 300);
    return () => window.clearInterval(timer);
  }, [googleClientId, phone, startAuthMutation, view]);

  useEffect(() => {
    if (!facebookAppId || view !== "auth") {
      return;
    }
    const scriptId = "facebook-jssdk";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: facebookAppId,
        cookie: true,
        xfbml: false,
        version: "v23.0",
      });
    };
  }, [facebookAppId, view]);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function goBook() {
    clearMessages();
    setServiceId("");
    setStaffId("");
    setSlot("");
    setDate(dayjs().format("YYYY-MM-DD"));
    setView("book");
  }

  function logoutBookingSession() {
    setBookingSession(null);
    setView("auth");
    setServiceId("");
    setStaffId("");
    setDate(dayjs().format("YYYY-MM-DD"));
    setSlot("");
    setAuthSessionId(null);
    setOtpCode("");
    setAuthInfo(null);
    setOtpDebugCode(null);
    localStorage.removeItem(SESSION_KEY);
  }

  function manualStartAuth(event: FormEvent) {
    event.preventDefault();
    startAuthMutation.mutate({
      provider: "manual",
      fullName,
      email: email || undefined,
      phone,
    });
  }

  function startFacebookAuth() {
    if (!window.FB) {
      setError("Facebook SDK no esta listo. Recarga la pagina.");
      return;
    }
    if (!phone) {
      setError("Para Facebook login, primero escribe tu telefono.");
      return;
    }
    window.FB.login(
      (response) => {
        const accessToken = response.authResponse?.accessToken;
        if (!accessToken) {
          setError("No se pudo autenticar con Facebook.");
          return;
        }
        startAuthMutation.mutate({
          provider: "facebook",
          phone,
          facebookAccessToken: accessToken,
        });
      },
      { scope: "public_profile,email" },
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-6 font-sans text-gray-200 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                {PRODUCT_NAME}
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Portal de Reservas
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-blue-800/30 bg-blue-950/20 p-3 text-blue-400">
          <Smartphone className="h-5 w-5 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Portal de Reservas de Clientes
          </span>
        </div>

        <div className="flex min-h-[560px] flex-col overflow-hidden rounded-3xl border border-[#2a2a2a] bg-[#141414] shadow-2xl">
          <div className="border-b border-[#2a2a2a] bg-[#121212] p-6">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-white">
                Reserva en 2 minutos
              </h2>
              <p className="text-xs font-medium text-gray-400">
                Acceso sin password con verificacion por telefono.
              </p>
            </div>
            {bookingSession && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#2a2a2a] pt-3 text-xs">
                <span className="font-medium text-gray-300">
                  Sesion activa:{" "}
                  <strong className="text-white">
                    {bookingSession.customer.fullName}
                  </strong>{" "}
                  ({bookingSession.customer.phone})
                </span>
                <button
                  onClick={logoutBookingSession}
                  className="flex items-center gap-1 text-blue-400 hover:underline"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="font-bold">Cerrar Sesion</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-3 p-6">
            {error && (
              <Notice tone="error" onClose={() => setError(null)}>
                {error}
              </Notice>
            )}
            {success && (
              <Notice tone="success" onClose={() => setSuccess(null)}>
                {success}
              </Notice>
            )}
            {authInfo && <Notice tone="info">{authInfo}</Notice>}
            {otpDebugCode && view === "auth" && (
              <Notice tone="warning">Modo dev OTP: {otpDebugCode}</Notice>
            )}

            <AnimatePresence mode="wait">
              {view === "auth" && (
                <motion.form
                  key="auth"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  onSubmit={manualStartAuth}
                  className="my-auto space-y-4"
                >
                  <div className="space-y-3">
                    <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-white">
                      Inicia sesion
                    </h3>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Telefono (obligatorio)
                      </label>
                      <input
                        type="text"
                        placeholder="Ingresa tu celular"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className="w-full rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                        required
                      />
                    </div>

                    <div className="rounded-xl border border-dashed border-[#2a2a2a] bg-[#121212] p-3">
                      <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-widest text-gray-500">
                        Registro manual por primera vez
                      </span>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          placeholder="Nombre completo"
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                        />
                        <input
                          type="email"
                          placeholder="Correo electronico"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      !phone || !fullName || startAuthMutation.isPending
                    }
                    className="w-full rounded-xl border border-blue-500/20 bg-blue-600 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-[#2a2a2a]/60 disabled:bg-[#1a1a1a] disabled:text-gray-600"
                  >
                    {startAuthMutation.isPending
                      ? "Enviando..."
                      : "Enviar Codigo"}
                  </button>

                  <div className="space-y-2 rounded-xl border border-[#2a2a2a] bg-[#121212] p-3">
                    <span className="block text-[9px] font-extrabold uppercase tracking-widest text-gray-500">
                      Social login
                    </span>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div ref={googleButtonRef} className="min-h-10" />
                      <button
                        type="button"
                        onClick={startFacebookAuth}
                        disabled={!facebookAppId || startAuthMutation.isPending}
                        className="rounded-xl border border-[#2a2a2a] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:text-gray-600"
                      >
                        Continuar con Facebook
                      </button>
                    </div>
                    {!googleClientId && (
                      <p className="text-[10px] font-semibold text-gray-500">
                        Google no configurado.
                      </p>
                    )}
                    {!facebookAppId && (
                      <p className="text-[10px] font-semibold text-gray-500">
                        Facebook no configurado.
                      </p>
                    )}
                  </div>

                  {authSessionId && (
                    <div className="space-y-3 rounded-xl border border-[#2a2a2a] bg-[#121212] p-3">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Verifica OTP
                      </label>
                      <p className="text-xs font-semibold text-gray-400">
                        Ingresa el codigo recibido por{" "}
                        {otpChannel ?? "telefono"}.
                      </p>
                      <input
                        type="text"
                        placeholder="Codigo de 6 digitos"
                        value={otpCode}
                        onChange={(event) => setOtpCode(event.target.value)}
                        onKeyDown={(event) => {
                          // Enter verifica el codigo; sin esto enviaria el formulario y pediria otro OTP.
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (
                              otpCode.length === 6 &&
                              !verifyAuthMutation.isPending
                            ) {
                              verifyAuthMutation.mutate();
                            }
                          }
                        }}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="w-full rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3.5 text-center font-mono text-lg font-semibold tracking-widest text-white outline-none focus:border-blue-500"
                        maxLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => verifyAuthMutation.mutate()}
                        disabled={
                          otpCode.length !== 6 || verifyAuthMutation.isPending
                        }
                        className="w-full rounded-xl border border-blue-500/20 bg-blue-600 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-[#2a2a2a]/60 disabled:bg-[#1a1a1a] disabled:text-gray-600"
                      >
                        Verificar Telefono
                      </button>
                    </div>
                  )}
                </motion.form>
              )}

              {view === "menu" && bookingSession && (
                <motion.div
                  key="menu"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="w-full space-y-6"
                >
                  <div className="py-4 text-center">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-blue-400">
                      Acceso Correcto
                    </span>
                    <h3 className="mt-1 text-lg font-bold tracking-tight text-white">
                      Que quieres hacer?
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col justify-between rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 transition-all hover:bg-[#222]">
                      <div className="space-y-2">
                        <h4 className="text-sm font-bold tracking-tight text-white">
                          Hacer cita
                        </h4>
                        <p className="text-xs font-medium leading-relaxed text-gray-400">
                          Elegir servicio, profesional y horario disponible.
                        </p>
                      </div>
                      <button
                        onClick={goBook}
                        className="mt-6 rounded-xl border border-blue-500/20 bg-blue-600 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white transition-all hover:bg-blue-700"
                      >
                        Ir a hacer cita
                      </button>
                    </div>
                    <div className="flex flex-col justify-between rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 transition-all hover:bg-[#222]">
                      <div className="space-y-2">
                        <h4 className="text-sm font-bold tracking-tight text-white">
                          Cancelar cita
                        </h4>
                        <p className="text-xs font-medium leading-relaxed text-gray-400">
                          Ver tus citas activas y cancelar la que necesites.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          clearMessages();
                          setView("cancel");
                        }}
                        className="mt-6 rounded-xl border border-[#2a2a2a] bg-[#121212] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 transition-all hover:bg-[#1a1a1a]"
                      >
                        Ir a cancelar cita
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {view === "book" && bookingSession && (
                <motion.div
                  key="book"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  className="w-full space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-white">
                      Nueva Cita
                    </h3>
                    <button
                      onClick={() => setView("menu")}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Volver</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-bold tracking-tight text-white">
                      1) Elige un servicio
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {servicesQuery.data?.map((service) => (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => setServiceId(service.id)}
                          className={`rounded-xl border px-3 py-2 text-center text-[10px] font-bold transition-all ${
                            serviceId === service.id
                              ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                              : "border-[#2a2a2a] bg-[#1a1a1a] text-gray-300 hover:bg-[#222]"
                          }`}
                        >
                          {service.name} - {service.durationMinutes} min
                        </button>
                      ))}
                      {servicesQuery.isLoading && (
                        <p className="text-xs font-semibold text-gray-500">
                          Cargando servicios...
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="block text-xs font-bold tracking-tight text-white">
                      2) Selecciona profesional y fecha
                    </span>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase text-gray-500">
                          Especialista
                        </label>
                        <select
                          value={staffId}
                          onChange={(event) => setStaffId(event.target.value)}
                          className="w-full rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                        >
                          <option value="" className="bg-[#141414]">
                            Selecciona
                          </option>
                          {staffQuery.data?.map((staff) => (
                            <option
                              key={staff.id}
                              value={staff.id}
                              className="bg-[#141414]"
                            >
                              {staff.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[9px] font-bold uppercase text-gray-500">
                          Fecha
                        </label>
                        <input
                          type="date"
                          value={date}
                          onChange={(event) => setDate(event.target.value)}
                          className="w-full rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-2.5 text-xs font-semibold text-gray-200 outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-bold tracking-tight text-white">
                      3) Horarios disponibles
                    </span>
                    {availabilityQuery.isLoading && (
                      <p className="text-xs font-semibold text-gray-500">
                        Buscando horarios...
                      </p>
                    )}
                    {slots.length > 0 ? (
                      <div className="grid max-h-[160px] grid-cols-4 gap-1.5 overflow-y-auto rounded-xl border border-[#2a2a2a] bg-[#121212] p-2 sm:grid-cols-6">
                        {slots.map((item) => (
                          <button
                            key={item.startAt}
                            type="button"
                            onClick={() => setSlot(item.startAt)}
                            className={`rounded-lg border py-1.5 text-center text-[10px] font-extrabold transition-all ${
                              slot === item.startAt
                                ? "border-rose-500 bg-rose-600 text-white shadow-sm"
                                : "border-[#2a2a2a] bg-[#1a1a1a] text-gray-300 hover:bg-[#222]"
                            }`}
                          >
                            {dayjs(item.startAt).format("HH:mm")}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-center text-xs font-semibold text-gray-500">
                        {serviceId && staffId
                          ? "No hay horarios para esta combinacion."
                          : "Elige servicio y profesional."}
                      </p>
                    )}
                  </div>

                  {(selectedService || selectedStaff) && (
                    <div className="rounded-xl border border-[#2a2a2a] bg-[#121212] p-3 text-xs font-semibold text-gray-400">
                      {selectedService && (
                        <span>
                          {selectedService.name} ·{" "}
                          {formatCurrency(selectedService.priceCents)}
                        </span>
                      )}
                      {selectedService && selectedStaff && <span> · </span>}
                      {selectedStaff && (
                        <span>{selectedStaff.displayName}</span>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => bookMutation.mutate()}
                    disabled={
                      !serviceId || !staffId || !slot || bookMutation.isPending
                    }
                    className="w-full rounded-xl border border-blue-500/20 bg-blue-600 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-[#2a2a2a]/60 disabled:bg-[#1a1a1a] disabled:text-gray-600"
                  >
                    {bookMutation.isPending
                      ? "Reservando..."
                      : "Confirmar Cita"}
                  </button>
                </motion.div>
              )}

              {view === "cancel" && bookingSession && (
                <motion.div
                  key="cancel"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  className="w-full space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-white">
                      Tus Citas Activas
                    </h3>
                    <button
                      onClick={() => setView("menu")}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Volver</span>
                    </button>
                  </div>

                  {myAppointmentsQuery.isLoading && (
                    <p className="py-6 text-center text-xs font-semibold text-gray-500">
                      Cargando tus citas activas...
                    </p>
                  )}

                  <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
                    {myAppointmentsQuery.data?.map((appointment) => (
                      <div
                        key={appointment.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a]/60 p-4 transition-all"
                      >
                        <div>
                          <h4 className="text-xs font-bold text-white">
                            {appointment.services
                              .map((item) => item.service.name)
                              .join(", ")}
                          </h4>
                          <p className="mt-0.5 text-[10px] font-bold text-gray-400">
                            {formatDateLabel(appointment.startAt)}
                          </p>
                          <p className="text-[10px] font-medium text-gray-500">
                            Especialista: {appointment.staff.displayName}
                          </p>
                        </div>
                        <button
                          onClick={() => cancelMutation.mutate(appointment.id)}
                          disabled={cancelMutation.isPending}
                          className="rounded-lg border border-rose-800/40 px-3 py-1.5 text-[10px] font-bold text-rose-400 transition-all hover:bg-rose-950/20 disabled:opacity-50"
                        >
                          Cancelar Reserva
                        </button>
                      </div>
                    ))}
                  </div>

                  {!myAppointmentsQuery.isLoading &&
                    !myAppointmentsQuery.data?.length && (
                      <div className="space-y-1 py-12 text-center font-medium text-gray-500">
                        <p>No tienes citas activas para cancelar.</p>
                        <p className="text-[10px]">
                          Agenda un servicio desde el menu de opciones.
                        </p>
                      </div>
                    )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <BookingContent />
    </QueryClientProvider>
  );
}
