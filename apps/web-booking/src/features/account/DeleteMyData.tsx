import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BackButton, Button, Notice } from "../../components/ui";
import { bookingApi } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import { useTenantProfile, useTerms } from "../../lib/tenant-profile";

/**
 * Derecho de supresion: el cliente borra sus datos de este negocio sin tener que pedirlo.
 * Sus citas futuras se cancelan; el historial queda sin nombre para los reportes.
 */
export function DeleteMyData({
  slug,
  onBack,
  onDeleted,
}: {
  slug: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const profile = useTenantProfile();
  const terms = useTerms();
  const [confirmed, setConfirmed] = useState(false);
  const remove = useMutation({
    mutationFn: async () => bookingApi.post(`/public/${slug}/me/delete`),
    onSuccess: onDeleted,
  });

  return (
    <div className="space-y-5">
      <BackButton onClick={onBack} />
      <div>
        <h2 className="text-lg font-semibold">Eliminar mis datos</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Borraremos tu nombre, teléfono, correo y mensajes de {profile.name}.
          Tus {terms.appointments} futuras se cancelarán y no podrás deshacerlo.
        </p>
      </div>
      {remove.isError && (
        <Notice tone="error">
          {apiErrorMessage(
            remove.error,
            "No se pudieron eliminar tus datos. Intenta de nuevo.",
          )}
        </Notice>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 accent-[var(--primary)]"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Entiendo que esta acción es definitiva.
      </label>
      <Button
        className="w-full bg-danger hover:bg-danger hover:opacity-90"
        disabled={!confirmed}
        loading={remove.isPending}
        onClick={() => remove.mutate()}
      >
        Eliminar mis datos
      </Button>
    </div>
  );
}
