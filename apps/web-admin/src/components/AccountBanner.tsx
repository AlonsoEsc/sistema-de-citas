import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type TenantMe = {
  bookingUrl: string;
  access: "full" | "read_only";
  subscription: {
    state: "trialing" | "active" | "past_due" | "expired" | "canceled";
    accessUntil: string | null;
  };
};

type Onboarding = {
  steps: Array<{ key: string; done: boolean }>;
};

const DAY_MS = 86_400_000;

function daysUntil(date: string | null) {
  return date
    ? Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / DAY_MS))
    : 0;
}

/**
 * Estado de la cuenta visible en todo el panel: dias de prueba, cuenta en solo lectura y
 * correo sin verificar. Explica por que una accion puede quedar bloqueada.
 */
export function AccountBanner() {
  const me = useQuery({
    queryKey: ["tenant-me"],
    queryFn: async () => (await api.get<TenantMe>("/tenants/me")).data,
  });
  const onboarding = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => (await api.get<Onboarding>("/onboarding")).data,
  });
  const resend = useMutation({
    mutationFn: async () => api.post("/auth/email/resend"),
  });

  if (!me.data) {
    return null;
  }
  const { subscription, access } = me.data;
  const emailPending = onboarding.data?.steps.some(
    (step) => step.key === "verify_email" && !step.done,
  );

  const notices: Array<{ tone: "info" | "warning" | "danger"; text: string }> =
    [];
  if (access === "read_only") {
    notices.push({
      tone: "danger",
      text: "Tu prueba o suscripción venció. El panel está en modo consulta y tu portal no recibe reservas. Escríbenos para renovar tu plan.",
    });
  } else if (subscription.state === "trialing") {
    notices.push({
      tone: "info",
      text: `Te quedan ${daysUntil(subscription.accessUntil)} días de prueba gratis. Tu enlace de reservas: ${me.data.bookingUrl}`,
    });
  } else if (subscription.state === "past_due") {
    notices.push({
      tone: "warning",
      text: "Tu pago está pendiente. Renueva para no perder el acceso.",
    });
  }

  const styles = {
    info: "border-indigo-200 bg-indigo-50 text-indigo-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className="mb-4 space-y-2">
      {notices.map((notice) => (
        <p
          key={notice.text}
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm ${styles[notice.tone]}`}
        >
          {notice.text}
        </p>
      ))}
      {emailPending && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Confirma tu correo para proteger tu cuenta.</span>
          <button
            type="button"
            disabled={resend.isPending || resend.isSuccess}
            onClick={() => resend.mutate()}
            className="font-semibold underline disabled:no-underline disabled:opacity-60"
          >
            {resend.isSuccess ? "Enlace enviado" : "Reenviar enlace"}
          </button>
        </p>
      )}
    </div>
  );
}
