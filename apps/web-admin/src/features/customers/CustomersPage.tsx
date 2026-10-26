import { useState, type FormEvent } from "react";
import { Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import { PERMISSIONS } from "@citas/shared/access";
import { Button, IconButton } from "../../components/ui/button";
import { ConfirmDialog, Dialog } from "../../components/ui/dialog";
import { Field, TextAreaField } from "../../components/ui/form";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from "../../components/ui/surface";
import { apiErrorMessage } from "../../lib/errors";
import { useDebounced } from "../../lib/hooks";
import { initials } from "../../lib/format";
import { useAuth } from "../../state/auth";
import { useTenant } from "../../state/tenant";
import {
  useCustomers,
  useDeleteCustomer,
  useSaveCustomer,
  type Customer,
} from "./api";

/** Quien verifico su telefono en el portal pero no termino de dar su nombre. */
function displayName(customer: Customer) {
  return customer.fullName || "Sin nombre";
}

const EMPTY = { fullName: "", phone: "", email: "", notes: "" };

function CustomerDialog({
  customer,
  open,
  onClose,
}: {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}) {
  const { terms, industry } = useTenant();
  const save = useSaveCustomer();
  const [form, setForm] = useState(EMPTY);
  const [loadedFor, setLoadedFor] = useState<Customer | null | undefined>();

  if (open && loadedFor !== customer) {
    setLoadedFor(customer);
    setForm(
      customer
        ? {
            fullName: customer.fullName,
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            notes: customer.notes ?? "",
          }
        : EMPTY,
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      {
        id: customer?.id,
        fullName: form.fullName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          setLoadedFor(undefined);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        setLoadedFor(undefined);
        onClose();
      }}
      title={
        customer
          ? `Editar ${terms.customer.toLowerCase()}`
          : `Nuevo ${terms.customer.toLowerCase()}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="customer-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="space-y-4">
        <Field
          label="Nombre completo"
          required
          minLength={2}
          value={form.fullName}
          onChange={(event) =>
            setForm({ ...form, fullName: event.target.value })
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Teléfono"
            type="tel"
            placeholder="+503 7000 0000"
            value={form.phone}
            onChange={(event) =>
              setForm({ ...form, phone: event.target.value })
            }
          />
          <Field
            label="Correo"
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
          />
        </div>
        <TextAreaField
          label="Notas internas"
          maxLength={1000}
          hint={
            industry.handlesHealthData
              ? "Solo lo necesario para atender. No anotes diagnósticos aquí: son datos sensibles."
              : "Preferencias o datos útiles para atender. El cliente no las ve."
          }
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </form>
    </Dialog>
  );
}

export function CustomersPage() {
  const { terms, format, readOnly } = useTenant();
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.customersManage) && !readOnly;
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const customers = useCustomers(debounced);
  const remove = useDeleteCustomer();

  const [editing, setEditing] = useState<{ customer: Customer | null } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const rows = customers.data ?? [];

  return (
    <>
      <PageHeader
        title={terms.customers}
        description={`Busca, edita o elimina los datos de tus ${terms.customers.toLowerCase()}.`}
        actions={
          canManage && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setEditing({ customer: null })}
            >
              Nuevo {terms.customer.toLowerCase()}
            </Button>
          )
        }
      />

      <Card>
        <div className="border-b border-line p-4">
          <label className="relative block max-w-md">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              placeholder="Buscar por nombre, teléfono o correo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm text-ink outline-none focus:border-primary"
            />
          </label>
        </div>

        {customers.isError ? (
          <ErrorState
            message={apiErrorMessage(
              customers.error,
              "No se pudo cargar la lista.",
            )}
            onRetry={() => void customers.refetch()}
          />
        ) : customers.isLoading ? (
          <LoadingRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UserRound className="size-5" />}
            title={
              debounced
                ? "Sin resultados"
                : `Aún no tienes ${terms.customers.toLowerCase()}`
            }
            description={
              debounced
                ? "Prueba con otro nombre, teléfono o correo."
                : "Se agregan solos cuando reservan por el portal o WhatsApp."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Contacto
                  </th>
                  <th
                    scope="col"
                    className="hidden px-5 py-3 font-medium md:table-cell"
                  >
                    Alta
                  </th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((customer) => (
                  <tr key={customer.id} className="hover:bg-surface-muted/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                          {initials(displayName(customer))}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {displayName(customer)}
                          </p>
                          {customer.notes && (
                            <p className="max-w-xs truncate text-xs text-ink-muted">
                              {customer.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-muted">
                      <p>{customer.phone ?? "—"}</p>
                      {customer.email && (
                        <p className="text-xs">{customer.email}</p>
                      )}
                      {customer.whatsappOptOutAt && (
                        <Badge className="mt-1">No recibe WhatsApp</Badge>
                      )}
                    </td>
                    <td className="hidden px-5 py-3 text-ink-muted md:table-cell">
                      {format.date(customer.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <IconButton
                            label={`Editar a ${displayName(customer)}`}
                            onClick={() => setEditing({ customer })}
                          >
                            <Pencil className="size-4" />
                          </IconButton>
                          <IconButton
                            label={`Eliminar a ${displayName(customer)}`}
                            className="hover:bg-danger-soft hover:text-danger"
                            onClick={() => setDeleting(customer)}
                          >
                            <Trash2 className="size-4" />
                          </IconButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length >= 100 && (
              <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">
                Se muestran los 100 más recientes. Usa la búsqueda para
                encontrar a alguien más.
              </p>
            )}
          </div>
        )}
      </Card>

      <CustomerDialog
        open={Boolean(editing)}
        customer={editing?.customer ?? null}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Eliminar a ${deleting?.fullName ?? ""}`}
        message={
          <>
            Se borran sus datos personales, sus conversaciones de WhatsApp y los
            avisos pendientes. Si tiene {terms.appointments.toLowerCase()}{" "}
            registradas, se conservan sin nombre para no alterar tus reportes.
            Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar datos"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </>
  );
}
