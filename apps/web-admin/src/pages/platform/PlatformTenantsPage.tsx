import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { platformApi } from "../../lib/platform-api";
import { SubscriptionBadge, formatDate } from "./platform-format";

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  status: "active" | "suspended";
  createdAt: string;
  owner: { email: string; fullName: string | null } | null;
  plan: string | null;
  subscription: {
    state: string;
    access: string;
    accessUntil: string | null;
  };
  activeStaff: number;
  appointments: number;
};

type TenantPage = {
  total: number;
  page: number;
  pageSize: number;
  items: TenantSummary[];
};

export function PlatformTenantsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const tenants = useQuery({
    queryKey: ["platform-tenants", search, page],
    queryFn: async () =>
      (
        await platformApi.get<TenantPage>("/platform/tenants", {
          params: { search: search.trim() || undefined, page },
        })
      ).data,
  });
  const totalPages = tenants.data
    ? Math.max(1, Math.ceil(tenants.data.total / tenants.data.pageSize))
    : 1;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Negocios</h1>
          <p className="text-sm text-ink-muted">
            {tenants.data ? `${tenants.data.total} en total` : "Cargando…"}
          </p>
        </div>
        <input
          type="search"
          placeholder="Buscar por nombre, dirección o correo del dueño"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="w-full max-w-sm rounded-xl border border-line bg-surface px-3.5 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">Dueño</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Suscripción</th>
              <th className="px-4 py-3">Acceso hasta</th>
              <th className="px-4 py-3 text-right">Personal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tenants.data?.items.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-surface-muted">
                <td className="px-4 py-3">
                  <Link
                    to={`/plataforma/negocios/${tenant.id}`}
                    className="font-medium text-primary hover:text-primary-hover"
                  >
                    {tenant.name}
                  </Link>
                  <div className="text-xs text-ink-muted">/{tenant.slug}</div>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {tenant.owner?.email ?? "—"}
                </td>
                <td className="px-4 py-3 capitalize text-ink-muted">
                  {tenant.plan ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <SubscriptionBadge
                    state={tenant.subscription.state}
                    suspended={tenant.status === "suspended"}
                  />
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {formatDate(tenant.subscription.accessUntil)}
                </td>
                <td className="px-4 py-3 text-right text-ink-muted">
                  {tenant.activeStaff}
                </td>
              </tr>
            ))}
            {tenants.data?.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-ink-muted"
                >
                  No hay negocios que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((current) => current - 1)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="text-ink-muted">
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((current) => current + 1)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
