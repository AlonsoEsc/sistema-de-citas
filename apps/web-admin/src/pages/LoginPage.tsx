import { useState, type FormEvent } from "react";
import { PRODUCT_NAME } from "../config/brand";
import { useAuth } from "../state/auth";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function LoginPage() {
  const { login } = useAuth();
  // Las credenciales demo solo se precargan en desarrollo, nunca en el build de produccion.
  const [email, setEmail] = useState(import.meta.env.DEV ? "admin@demo.com" : "");
  const [password, setPassword] = useState(import.meta.env.DEV ? "Admin1234!" : "");
  const [tenantSlug, setTenantSlug] = useState(import.meta.env.DEV ? "demo-barberia" : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await login({ email, password, tenantSlug });
    } catch {
      setError("No se pudo iniciar sesión. Revisa tus credenciales y el identificador del negocio.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">{PRODUCT_NAME}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Panel administrativo</h1>
          <p className="mt-1 text-sm text-slate-500">Ingresa para gestionar tu agenda.</p>
        </header>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Identificador del negocio</span>
          <input
            className={inputClass}
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            autoComplete="organization"
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Correo</span>
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Ingresando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
