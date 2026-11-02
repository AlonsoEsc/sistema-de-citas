import { useState, type FormEvent } from "react";
import {
  Alert,
  AuthLayout,
  Field,
  PrimaryButton,
  TextLink,
} from "../components/ui/form";
import { apiErrorMessage } from "../lib/errors";
import { useAuth } from "../state/auth";

export function LoginPage() {
  const { login } = useAuth();
  // Las credenciales demo solo se precargan en desarrollo, nunca en el build de produccion.
  const [email, setEmail] = useState(
    import.meta.env.DEV ? "admin@demo.com" : "",
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? "Admin1234!" : "",
  );
  const [tenantSlug, setTenantSlug] = useState(
    import.meta.env.DEV ? "demo-barberia" : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await login({ email, password, tenantSlug });
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          "No se pudo iniciar sesión. Revisa tus credenciales y el identificador del negocio.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Panel administrativo"
      subtitle="Ingresa para gestionar tu agenda."
      footer={
        <>
          ¿Aún no tienes cuenta?{" "}
          <TextLink to="/registro">Prueba 14 días gratis</TextLink>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Identificador del negocio"
          hint="Es la última parte de tu enlace de reservas."
          value={tenantSlug}
          onChange={(event) =>
            setTenantSlug(event.target.value.trim().toLowerCase())
          }
          autoComplete="organization"
          required
        />
        <Field
          label="Correo"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
        <Field
          label="Contraseña"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <PrimaryButton loading={loading}>Entrar</PrimaryButton>
        <p className="text-center text-sm">
          <TextLink to="/recuperar">¿Olvidaste tu contraseña?</TextLink>
        </p>
      </form>
    </AuthLayout>
  );
}
