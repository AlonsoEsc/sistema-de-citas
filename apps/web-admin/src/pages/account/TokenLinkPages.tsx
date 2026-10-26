import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Alert,
  AuthLayout,
  Field,
  PrimaryButton,
  TextLink,
} from "../../components/ui/form";
import { api } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import { useAuth, type UserSession } from "../../state/auth";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const verify = useMutation({
    mutationFn: async () => api.post("/auth/email/verify", { token }),
  });
  const { mutate } = verify;
  // El token es de un solo uso: no se envia dos veces aunque React repita el efecto.
  const requested = useRef(false);

  useEffect(() => {
    if (token && !requested.current) {
      requested.current = true;
      mutate();
    }
  }, [token, mutate]);

  return (
    <AuthLayout
      title="Verificación de correo"
      footer={<TextLink to="/">Ir al panel</TextLink>}
    >
      {!token && <Alert tone="error">El enlace está incompleto.</Alert>}
      {verify.isPending && <Alert tone="info">Verificando…</Alert>}
      {verify.isSuccess && (
        <Alert tone="success">Tu correo quedó verificado.</Alert>
      )}
      {verify.isError && (
        <Alert tone="error">
          {apiErrorMessage(verify.error, "El enlace no es válido o ya venció.")}
        </Alert>
      )}
    </AuthLayout>
  );
}

type InvitationInfo = {
  businessName: string;
  email: string;
  roleLabel: string;
  hasAccount: boolean;
};

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const invitation = useQuery({
    queryKey: ["invitation", token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () =>
      (
        await api.get<InvitationInfo>("/team/invitations/lookup", {
          params: { token },
        })
      ).data,
  });
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const response = await api.post<UserSession>("/team/invitations/accept", {
        token,
        password,
        ...(invitation.data?.hasAccount ? {} : { fullName }),
      });
      startSession(response.data);
      navigate("/", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo aceptar la invitación."));
    } finally {
      setLoading(false);
    }
  };

  if (!token || invitation.isError) {
    return (
      <AuthLayout
        title="Invitación"
        footer={<TextLink to="/">Ir al inicio</TextLink>}
      >
        <Alert tone="error">
          {invitation.isError
            ? apiErrorMessage(
                invitation.error,
                "La invitación no es válida o ya venció.",
              )
            : "El enlace está incompleto."}
        </Alert>
      </AuthLayout>
    );
  }
  if (!invitation.data) {
    return (
      <AuthLayout title="Invitación">
        <Alert tone="info">Cargando invitación…</Alert>
      </AuthLayout>
    );
  }

  const info = invitation.data;
  return (
    <AuthLayout
      title={`Únete a ${info.businessName}`}
      subtitle={`Te invitaron como ${info.roleLabel} con el correo ${info.email}.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {!info.hasAccount && (
          <Field
            label="Tu nombre"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            required
          />
        )}
        <Field
          label={
            info.hasAccount ? "Tu contraseña actual" : "Crea una contraseña"
          }
          type="password"
          hint={
            info.hasAccount
              ? undefined
              : "Mínimo 10 caracteres, con letras y números."
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={info.hasAccount ? "current-password" : "new-password"}
          required
        />
        <PrimaryButton loading={loading}>Aceptar invitación</PrimaryButton>
      </form>
    </AuthLayout>
  );
}
