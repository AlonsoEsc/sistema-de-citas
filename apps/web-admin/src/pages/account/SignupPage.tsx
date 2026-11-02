import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  AuthLayout,
  Field,
  PrimaryButton,
  SelectField,
  TextLink,
} from "../../components/ui/form";
import { api } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import { useAuth, type UserSession } from "../../state/auth";

type Industry = { code: string; label: string };

const TIME_ZONES = [
  { value: "America/El_Salvador", label: "El Salvador" },
  { value: "America/Guatemala", label: "Guatemala" },
  { value: "America/Tegucigalpa", label: "Honduras" },
  { value: "America/Managua", label: "Nicaragua" },
  { value: "America/Costa_Rica", label: "Costa Rica" },
  { value: "America/Panama", label: "Panamá" },
  { value: "America/Mexico_City", label: "México (centro)" },
];

export function SignupPage() {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const industries = useQuery({
    queryKey: ["industries"],
    queryFn: async () => (await api.get<Industry[]>("/industries")).data,
  });
  const [form, setForm] = useState({
    businessName: "",
    industry: "barbershop",
    timezone: "America/El_Salvador",
    ownerName: "",
    email: "",
    password: "",
    acceptTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update =
    (key: keyof typeof form) =>
    (event: { target: { value: string; checked?: boolean; type?: string } }) =>
      setForm((current) => ({
        ...current,
        [key]:
          event.target.type === "checkbox"
            ? event.target.checked
            : event.target.value,
      }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const response = await api.post<UserSession>("/signup", form);
      startSession(response.data);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        apiErrorMessage(err, "No se pudo crear la cuenta. Revisa los datos."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="14 días gratis, sin tarjeta. Tu negocio queda listo para recibir reservas."
      footer={
        <>
          ¿Ya tienes cuenta? <TextLink to="/">Inicia sesión</TextLink>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Nombre del negocio"
          value={form.businessName}
          onChange={update("businessName")}
          autoComplete="organization"
          required
        />
        <SelectField
          label="Tipo de negocio"
          value={form.industry}
          onChange={update("industry")}
        >
          {(industries.data ?? []).map((industry) => (
            <option key={industry.code} value={industry.code}>
              {industry.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="País"
          value={form.timezone}
          onChange={update("timezone")}
        >
          {TIME_ZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </SelectField>
        <Field
          label="Tu nombre"
          value={form.ownerName}
          onChange={update("ownerName")}
          autoComplete="name"
          required
        />
        <Field
          label="Correo"
          type="email"
          value={form.email}
          onChange={update("email")}
          autoComplete="email"
          required
        />
        <Field
          label="Contraseña"
          type="password"
          hint="Mínimo 10 caracteres, con letras y números."
          value={form.password}
          onChange={update("password")}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <label className="flex items-start gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.acceptTerms}
            onChange={update("acceptTerms")}
            required
          />
          <span>
            Acepto los{" "}
            <a
              href="/terminos"
              target="_blank"
              className="font-medium text-primary underline"
            >
              términos del servicio
            </a>{" "}
            y la{" "}
            <a
              href="/privacidad"
              target="_blank"
              className="font-medium text-primary underline"
            >
              política de privacidad
            </a>
            , incluido el tratamiento de los datos de mis clientes.
          </span>
        </label>
        <PrimaryButton loading={loading}>Crear cuenta</PrimaryButton>
      </form>
    </AuthLayout>
  );
}
