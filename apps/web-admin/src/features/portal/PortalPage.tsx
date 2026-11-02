import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "../../components/ui/button";
import { Alert } from "../../components/ui/form";
import { Card, CardHeader, Skeleton } from "../../components/ui/surface";
import { useToast } from "../../components/ui/toast";
import { useTenant } from "../../state/tenant";

const QR_SIZE = 512;

/** Codigo QR del enlace de reservas, generado en el navegador (sin servicios externos). */
function useQrCode(text: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(text, {
      width: QR_SIZE,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((url) => active && setDataUrl(url))
      .catch(() => active && setDataUrl(null));
    return () => {
      active = false;
    };
  }, [text]);
  return dataUrl;
}

export function PortalPage() {
  const { tenant, bookingUrl, terms, readOnly } = useTenant();
  const toast = useToast();
  const qr = useQrCode(bookingUrl);

  const copy = () =>
    navigator.clipboard
      .writeText(bookingUrl)
      .then(() => toast.success("Enlace copiado."))
      .catch(() => toast.error("No se pudo copiar el enlace."));

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Portal de reservas
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Tus {terms.customers.toLowerCase()} eligen{" "}
          {terms.services.toLowerCase()}, profesional y horario, y confirman con
          un código que reciben por WhatsApp o SMS.
        </p>
      </header>

      {readOnly && (
        <div className="mb-6">
          <Alert tone="error">
            Con la suscripción vencida, el portal muestra que no hay reservas
            disponibles.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title="Tu enlace"
            description="Compártelo en tu WhatsApp, Instagram, Facebook o Google Maps."
          />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-surface-muted px-4 py-2.5 text-sm text-primary">
                {bookingUrl}
              </code>
              <Button
                variant="secondary"
                icon={<Copy className="size-4" />}
                onClick={copy}
              >
                Copiar
              </Button>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <ExternalLink className="size-4" /> Ver portal
              </a>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
              <li>
                Ponlo en la biografía de Instagram y en el botón de “Reservar”
                de Facebook.
              </li>
              <li>
                Agrégalo a tu perfil de empresa de Google para que te reserven
                desde Maps.
              </li>
              <li>Imprime el código QR para tu recepción o tus tarjetas.</li>
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Código QR" />
          <div className="flex flex-col items-center gap-4 p-5">
            {qr ? (
              <img
                src={qr}
                alt={`Código QR para reservar en ${tenant.name}`}
                className="size-48 rounded-xl border border-line bg-white p-2"
              />
            ) : (
              <Skeleton className="size-48" />
            )}
            <a
              href={qr ?? undefined}
              download={`reservas-${tenant.slug}.png`}
              aria-disabled={!qr}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              <Download className="size-4" /> Descargar PNG
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}
