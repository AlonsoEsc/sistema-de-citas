import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cx } from "../lib/cx";
import { useOnboarding } from "../features/overview/api";
import { useTenant } from "../state/tenant";

const DAY_MS = 86_400_000;

function daysUntil(date: string | null) {
  return date
    ? Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / DAY_MS))
    : 0;
}

const tones = {
  info: "border-primary/25 bg-primary-soft text-ink",
  warning: "border-warning/30 bg-warning-soft text-ink",
  danger: "border-danger/30 bg-danger-soft text-ink",
};

/**
 * Estado de la cuenta visible en todo el panel: dias de prueba, cuenta en solo lectura y
 * correo sin verificar. Explica por que una accion puede quedar bloqueada.
 */
export function AccountBanner() {
  const { subscription, readOnly } = useTenant();
  const onboarding = useOnboarding();
  const resend = useMutation({
    mutationFn: async () => api.post("/auth/email/resend"),
  });

  const emailPending = onboarding.data?.steps.some(
    (step) => step.key === "verify_email" && !step.done,
  );

  const notices: Array<{ tone: keyof typeof tones; text: string }> = [];
  if (readOnly) {
    notices.push({
      tone: "danger",
      text: "Tu prueba o suscripción venció. El panel está en modo consulta y tu portal no recibe reservas. Escríbenos para renovar tu plan.",
    });
  } else if (subscription.state === "trialing") {
    const days = daysUntil(subscription.accessUntil);
    notices.push({
      tone: "info",
      text: `Te ${days === 1 ? "queda 1 día" : `quedan ${days} días`} de prueba gratis.`,
    });
  } else if (subscription.state === "past_due") {
    notices.push({
      tone: "warning",
      text: "Tu pago está pendiente. Renueva para no perder el acceso.",
    });
  }

  if (notices.length === 0 && !emailPending) {
    return null;
  }

  return (
    <div className="mb-6 space-y-2">
      {notices.map((notice) => (
        <p
          key={notice.text}
          role="status"
          className={cx(
            "rounded-xl border px-4 py-2.5 text-sm",
            tones[notice.tone],
          )}
        >
          {notice.text}
        </p>
      ))}
      {emailPending && (
        <p
          className={cx(
            "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm",
            tones.warning,
          )}
        >
          <span>Confirma tu correo para proteger tu cuenta.</span>
          <button
            type="button"
            disabled={resend.isPending || resend.isSuccess}
            onClick={() => resend.mutate()}
            className="font-semibold text-primary underline disabled:no-underline disabled:opacity-60"
          >
            {resend.isSuccess ? "Enlace enviado" : "Reenviar enlace"}
          </button>
        </p>
      )}
    </div>
  );
}
