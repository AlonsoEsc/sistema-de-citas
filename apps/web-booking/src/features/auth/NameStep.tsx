import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Field, Notice } from "../../components/ui";
import { bookingApi } from "../../lib/api";
import { apiErrorMessage } from "../../lib/errors";
import { useTenantProfile } from "../../lib/tenant-profile";

/** Primera reserva con este negocio: el nombre se pide despues de verificar el telefono. */
export function NameStep({
  slug,
  onSaved,
}: {
  slug: string;
  onSaved: (fullName: string) => void;
}) {
  const profile = useTenantProfile();
  const [fullName, setFullName] = useState("");
  const save = useMutation({
    mutationFn: async () =>
      (
        await bookingApi.patch<{ fullName: string }>(`/public/${slug}/me`, {
          fullName,
        })
      ).data,
    onSuccess: (customer) => onSaved(customer.fullName),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">¿Cómo te llamas?</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Es tu primera reserva con {profile.name}. Así sabrán a quién esperar.
        </p>
      </div>
      {save.isError && (
        <Notice tone="error">
          {apiErrorMessage(save.error, "No pudimos guardar tu nombre.")}
        </Notice>
      )}
      <Field
        label="Nombre completo"
        autoComplete="name"
        required
        minLength={2}
        maxLength={80}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
      />
      <Button type="submit" className="w-full" loading={save.isPending}>
        Continuar
      </Button>
    </form>
  );
}
