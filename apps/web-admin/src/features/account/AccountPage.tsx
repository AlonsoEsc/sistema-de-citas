import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Alert, Field } from "../../components/ui/form";
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
} from "../../components/ui/surface";
import { useToast } from "../../components/ui/toast";
import { api } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import { useApiMutation } from "../../lib/mutation";
import { useAuth } from "../../state/auth";
import { useOnboarding } from "../overview/api";

function ChangePasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [problem, setProblem] = useState("");

  const change = useMutation({
    mutationFn: async () =>
      (
        await api.post("/auth/password/change", {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        })
      ).data,
    // La API cierra las demas sesiones y renueva la cookie de esta.
    onSuccess: () => {
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      toast.success("Contraseña actualizada. Cerramos tus otras sesiones.");
    },
    onError: (error) =>
      setProblem(apiErrorMessage(error, "No se pudo cambiar la contraseña.")),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirm) {
      setProblem("Las contraseñas nuevas no coinciden.");
      return;
    }
    setProblem("");
    change.mutate();
  };

  return (
    <Card>
      <CardHeader
        title="Contraseña"
        description="Al cambiarla se cierran tus sesiones en otros dispositivos."
      />
      <form onSubmit={submit} className="grid max-w-md gap-4 p-5">
        {problem && <Alert tone="error">{problem}</Alert>}
        <Field
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={(event) =>
            setForm({ ...form, currentPassword: event.target.value })
          }
        />
        <Field
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 10 caracteres, con letras y números."
          required
          minLength={10}
          value={form.newPassword}
          onChange={(event) =>
            setForm({ ...form, newPassword: event.target.value })
          }
        />
        <Field
          label="Repite la contraseña nueva"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={(event) =>
            setForm({ ...form, confirm: event.target.value })
          }
        />
        <div>
          <Button type="submit" loading={change.isPending}>
            Cambiar contraseña
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AccountPage() {
  const { session } = useAuth();
  const onboarding = useOnboarding();
  const verified = onboarding.data?.steps.find(
    (step) => step.key === "verify_email",
  )?.done;
  const resend = useApiMutation({
    mutationFn: async () => (await api.post("/auth/email/resend")).data,
    success: "Te enviamos un nuevo enlace de confirmación.",
    error: "No se pudo enviar el enlace.",
  });

  return (
    <>
      <PageHeader title="Mi cuenta" />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Acceso" />
          <div className="flex flex-wrap items-center gap-3 p-5 text-sm">
            <span className="font-medium">{session?.user.email}</span>
            {verified === true && (
              <Badge tone="success">Correo confirmado</Badge>
            )}
            {verified === false && (
              <>
                <Badge tone="warning">Correo sin confirmar</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={resend.isPending}
                  disabled={resend.isSuccess}
                  onClick={() => resend.mutate(undefined)}
                >
                  {resend.isSuccess ? "Enlace enviado" : "Reenviar enlace"}
                </Button>
              </>
            )}
          </div>
        </Card>
        <ChangePasswordCard />
      </div>
    </>
  );
}
