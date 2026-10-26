import { useState, type FormEvent } from "react";
import { MailPlus, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui/button";
import { Field, SelectField, Switch } from "../../components/ui/form";
import {
  Badge,
  Card,
  CardHeader,
  ErrorState,
  LoadingRows,
} from "../../components/ui/surface";
import { apiErrorMessage } from "../../lib/errors";
import { initials } from "../../lib/format";
import { useAuth } from "../../state/auth";
import { useTenant } from "../../state/tenant";
import {
  useInvite,
  useRevokeInvitation,
  useTeam,
  useUpdateMember,
} from "./api";

/**
 * Usuarios con acceso al panel (no confundir con el personal que atiende: un profesional
 * puede no tener usuario, y una recepcionista no atiende citas).
 */
export function TeamTab() {
  const { session } = useAuth();
  const { format, readOnly } = useTenant();
  const team = useTeam();
  const invite = useInvite();
  const revoke = useRevokeInvitation();
  const update = useUpdateMember();
  const [form, setForm] = useState({ email: "", role: "receptionist" });

  const roleLabel = (name: string) =>
    team.data?.roles.find((role) => role.name === name)?.label ?? name;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    invite.mutate(form, { onSuccess: () => setForm({ ...form, email: "" }) });
  };

  if (team.isError) {
    return (
      <Card>
        <ErrorState
          message={apiErrorMessage(team.error, "No se pudo cargar el equipo.")}
          onRetry={() => void team.refetch()}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Invitar a alguien"
          description="Recibirá un correo para crear su contraseña. La invitación vence en 7 días."
        />
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[14rem] flex-1">
            <Field
              label="Correo"
              type="email"
              required
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </div>
          <div className="w-48">
            <SelectField
              label="Rol"
              value={form.role}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value })
              }
            >
              {(team.data?.roles ?? []).map((role) => (
                <option key={role.name} value={role.name}>
                  {role.label}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            type="submit"
            icon={<MailPlus className="size-4" />}
            loading={invite.isPending}
            disabled={readOnly}
          >
            Invitar
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Personas con acceso" />
        {team.isLoading ? (
          <LoadingRows />
        ) : (
          <ul className="divide-y divide-line">
            {(team.data?.members ?? []).map((member) => {
              const isMe = member.userId === session?.user.id;
              return (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center gap-4 px-5 py-3.5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                    {initials(member.fullName ?? member.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {member.fullName ?? member.email}
                      {isMe && <Badge tone="primary">Tú</Badge>}
                      {!member.emailVerified && (
                        <Badge tone="warning">Correo sin confirmar</Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {member.email}
                    </p>
                  </div>
                  <select
                    aria-label={`Rol de ${member.email}`}
                    value={member.roles[0] ?? ""}
                    disabled={isMe || readOnly || update.isPending}
                    onChange={(event) =>
                      update.mutate({
                        userId: member.userId,
                        role: event.target.value,
                      })
                    }
                    className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink disabled:opacity-60"
                  >
                    {(team.data?.roles ?? []).map((role) => (
                      <option key={role.name} value={role.name}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <Switch
                    label={`Acceso de ${member.email}`}
                    checked={member.active}
                    disabled={isMe || readOnly || update.isPending}
                    onChange={(active) =>
                      update.mutate({ userId: member.userId, active })
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(team.data?.invitations ?? []).length > 0 && (
        <Card>
          <CardHeader title="Invitaciones pendientes" />
          <ul className="divide-y divide-line">
            {team.data!.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center gap-4 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {invitation.email}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {roleLabel(invitation.role)} · vence{" "}
                    {format.date(invitation.expiresAt)}
                  </p>
                </div>
                <IconButton
                  label={`Anular invitación de ${invitation.email}`}
                  disabled={readOnly}
                  onClick={() => revoke.mutate(invitation.id)}
                >
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
