import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { BackButton, Button, Field, Notice } from "../../components/ui";
import { bookingApi } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import type { BookingSession } from "../../lib/session";
import { useTerms } from "../../lib/tenant-profile";
import { SOCIAL_LOGIN_AVAILABLE, SocialLogin } from "./SocialLogin";

type StartPayload = {
  provider: "manual" | "google" | "facebook";
  phone: string;
  fullName?: string;
  email?: string;
  googleIdToken?: string;
  facebookAccessToken?: string;
};

type StartResponse = {
  sessionId: string;
  phoneMasked: string;
  channel: "sms" | "whatsapp";
  devOtpCode?: string;
};

const CHANNEL_LABEL = { sms: "SMS", whatsapp: "WhatsApp" };

/**
 * Acceso sin contrasena: el cliente deja su telefono y confirma con un codigo de 6 digitos.
 * Asi el negocio sabe que el numero es real antes de reservar.
 */
export function PhoneVerification({
  slug,
  onVerified,
}: {
  slug: string;
  onVerified: (session: BookingSession) => void;
}) {
  const terms = useTerms();
  const [form, setForm] = useState({ phone: "", fullName: "", email: "" });
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<StartResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: async (payload: StartPayload) =>
      (
        await bookingApi.post<StartResponse>(
          `/public/${slug}/auth/start`,
          payload,
        )
      ).data,
    onSuccess: (response) => {
      setSent(response);
      setCode("");
      setProblem(null);
    },
    onError: (error) =>
      setProblem(
        apiErrorMessage(
          error,
          "No pudimos enviar el código. Revisa el número e intenta de nuevo.",
        ),
      ),
  });

  const verify = useMutation({
    mutationFn: async () =>
      (
        await bookingApi.post<BookingSession>(`/public/${slug}/auth/verify`, {
          sessionId: sent?.sessionId,
          code,
        })
      ).data,
    onSuccess: (session) =>
      onVerified({ token: session.token, customer: session.customer }),
    onError: (error) =>
      setProblem(apiErrorMessage(error, "El código no es válido o ya venció.")),
  });

  const requestCode = (
    provider: StartPayload["provider"],
    extra: Partial<StartPayload> = {},
  ) => {
    if (!form.phone.trim()) {
      setProblem("Escribe tu número de teléfono primero.");
      return;
    }
    start.mutate({
      provider,
      phone: form.phone,
      fullName: form.fullName || undefined,
      email: form.email || undefined,
      ...extra,
    });
  };

  const submitDetails = (event: FormEvent) => {
    event.preventDefault();
    requestCode("manual");
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    verify.mutate();
  };

  if (sent) {
    return (
      <form onSubmit={submitCode} className="space-y-5">
        <BackButton onClick={() => setSent(null)}>Cambiar número</BackButton>
        <div>
          <h2 className="text-lg font-semibold">Escribe el código</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Te lo enviamos por {CHANNEL_LABEL[sent.channel]} al{" "}
            {sent.phoneMasked}.
          </p>
        </div>
        {problem && <Notice tone="error">{problem}</Notice>}
        {import.meta.env.DEV && sent.devOtpCode && (
          <Notice tone="warning">
            Código de desarrollo: {sent.devOtpCode}
          </Notice>
        )}
        <Field
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          className="text-center font-mono text-xl tracking-[0.5em]"
        />
        <Button
          type="submit"
          className="w-full"
          loading={verify.isPending}
          disabled={code.length !== 6}
        >
          Confirmar
        </Button>
        <button
          type="button"
          disabled={start.isPending}
          onClick={() => requestCode("manual")}
          className="w-full text-center text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          Enviar un código nuevo
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitDetails} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          Reserva tu {terms.appointment}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Sin contraseñas: te enviaremos un código para confirmar tu número.
        </p>
      </div>
      {problem && <Notice tone="error">{problem}</Notice>}
      <Field
        label="Teléfono celular"
        type="tel"
        autoComplete="tel"
        placeholder="7000 0000"
        required
        minLength={7}
        value={form.phone}
        onChange={(event) => setForm({ ...form, phone: event.target.value })}
      />
      <Field
        label="Nombre completo"
        autoComplete="name"
        required
        minLength={2}
        value={form.fullName}
        onChange={(event) => setForm({ ...form, fullName: event.target.value })}
      />
      <Field
        label="Correo (opcional)"
        type="email"
        autoComplete="email"
        hint="Para enviarte la confirmación y los recordatorios."
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
      />
      <Button type="submit" className="w-full" loading={start.isPending}>
        Enviar código
      </Button>

      {SOCIAL_LOGIN_AVAILABLE && (
        <div className="space-y-3 border-t border-line pt-5">
          <p className="text-center text-xs text-ink-muted">
            O completa tus datos con tu cuenta (igual verificaremos tu teléfono)
          </p>
          <SocialLogin
            disabled={start.isPending}
            onError={setProblem}
            onGoogle={(googleIdToken) =>
              requestCode("google", { googleIdToken })
            }
            onFacebook={(facebookAccessToken) =>
              requestCode("facebook", { facebookAccessToken })
            }
          />
        </div>
      )}
    </form>
  );
}
