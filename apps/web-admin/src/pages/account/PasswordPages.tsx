import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import {
  Alert,
  AuthLayout,
  Field,
  PrimaryButton,
  TextLink,
} from "../../components/ui/form";
import { api } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";

const backToLogin = <TextLink to="/">Volver a iniciar sesión</TextLink>;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await api.post("/auth/password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(
        apiErrorMessage(err, "No se pudo enviar el enlace. Intenta más tarde."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Recupera tu contraseña"
      subtitle="Te enviaremos un enlace para crear una nueva."
      footer={backToLogin}
    >
      {sent ? (
        <Alert tone="success">
          Si el correo está registrado, recibirás un enlace en unos minutos.
          Vence en 1 hora.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            label="Correo"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <PrimaryButton loading={loading}>Enviar enlace</PrimaryButton>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await api.post("/auth/password/reset", { token, password });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo cambiar la contraseña."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Nueva contraseña" footer={backToLogin}>
      {done ? (
        <Alert tone="success">
          Listo. Inicia sesión con tu nueva contraseña; cerramos las sesiones
          anteriores.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!token && <Alert tone="error">El enlace está incompleto.</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            label="Contraseña nueva"
            type="password"
            hint="Mínimo 10 caracteres, con letras y números."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
          <PrimaryButton loading={loading} disabled={!token}>
            Guardar contraseña
          </PrimaryButton>
        </form>
      )}
    </AuthLayout>
  );
}
