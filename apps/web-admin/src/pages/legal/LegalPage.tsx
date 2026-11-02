import { Link } from "react-router";
import {
  legalEntityIncomplete,
  privacyPolicy,
  termsOfService,
  type LegalEntity,
} from "@citas/shared/legal";
import { PRODUCT_NAME } from "../../config/brand";

const entity: LegalEntity = {
  productName: PRODUCT_NAME,
  legalName: import.meta.env.VITE_LEGAL_NAME as string | undefined,
  email: import.meta.env.VITE_LEGAL_EMAIL as string | undefined,
  address: import.meta.env.VITE_LEGAL_ADDRESS as string | undefined,
};

/** Terminos y privacidad: paginas publicas, enlazadas desde el registro y el portal. */
export function LegalPage({ document }: { document: "terms" | "privacy" }) {
  const content =
    document === "terms" ? termsOfService(entity) : privacyPolicy(entity);
  const updated = new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(
    new Date(`${content.updatedAt}T12:00:00Z`),
  );

  return (
    <main className="min-h-screen bg-bg px-4 py-10 text-ink">
      <article className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            {PRODUCT_NAME}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
          <p className="text-sm text-ink-muted">
            Última actualización: {updated}
          </p>
        </header>
        {legalEntityIncomplete(entity) && (
          <p
            role="note"
            className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm"
          >
            Faltan los datos del responsable (nombre legal y correo).
            Configúralos antes de publicar el servicio.
          </p>
        )}
        {content.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed text-ink-muted">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <footer className="flex gap-4 border-t border-line pt-6 text-sm">
          <Link
            to="/terminos"
            className="font-medium text-primary hover:underline"
          >
            Términos del servicio
          </Link>
          <Link
            to="/privacidad"
            className="font-medium text-primary hover:underline"
          >
            Política de privacidad
          </Link>
        </footer>
      </article>
    </main>
  );
}
