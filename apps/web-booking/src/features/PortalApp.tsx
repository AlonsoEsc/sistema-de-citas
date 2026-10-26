import { useCallback, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ListChecks,
  LogOut,
} from "lucide-react";
import { Button, Notice } from "../components/ui";
import { PRODUCT_NAME } from "../config/brand";
import { legalLinks } from "../lib/legal";
import { useBookingSession } from "../lib/session";
import {
  formatDateLabel,
  useTenantProfile,
  useTerms,
} from "../lib/tenant-profile";
import { DeleteMyData } from "./account/DeleteMyData";
import { MyAppointments } from "./appointments/MyAppointments";
import { NameStep } from "./auth/NameStep";
import { PhoneVerification } from "./auth/PhoneVerification";
import { BookingFlow, type BookedAppointment } from "./booking/BookingFlow";

type View =
  | { name: "home" }
  | { name: "book" }
  | { name: "mine" }
  | { name: "delete" }
  | { name: "booked"; appointment: BookedAppointment };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function HomeOption({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-primary/50"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-muted">{description}</span>
      </span>
    </button>
  );
}

/** Portal publico de un negocio: acceso por telefono, reservar y ver o cancelar citas. */
export function PortalApp({ slug }: { slug: string }) {
  const profile = useTenantProfile();
  const terms = useTerms();
  const [view, setView] = useState<View>({ name: "home" });
  const [expired, setExpired] = useState(false);
  const [dataDeleted, setDataDeleted] = useState(false);
  const onExpired = useCallback(() => {
    setExpired(true);
    setView({ name: "home" });
  }, []);
  const { session, save, clear } = useBookingSession(slug, onExpired);

  let content: ReactNode;
  if (!session) {
    content = (
      <>
        {dataDeleted && (
          <Notice tone="success">
            Eliminamos tus datos de {profile.name}. Puedes volver a reservar
            cuando quieras.
          </Notice>
        )}
        {expired && (
          <Notice tone="info">
            Tu sesión venció. Confirma tu número de nuevo.
          </Notice>
        )}
        <PhoneVerification
          slug={slug}
          onVerified={(next) => {
            save(next);
            setExpired(false);
            setDataDeleted(false);
            setView({ name: "book" });
          }}
        />
      </>
    );
  } else if (!session.customer.fullName) {
    content = (
      <NameStep
        slug={slug}
        onSaved={(fullName) =>
          save({ customer: { ...session.customer, fullName } })
        }
      />
    );
  } else if (view.name === "book") {
    content = (
      <BookingFlow
        slug={slug}
        onBack={() => setView({ name: "home" })}
        onBooked={(appointment) => setView({ name: "booked", appointment })}
      />
    );
  } else if (view.name === "delete") {
    content = (
      <DeleteMyData
        slug={slug}
        onBack={() => setView({ name: "home" })}
        onDeleted={() => {
          clear();
          setDataDeleted(true);
          setView({ name: "home" });
        }}
      />
    );
  } else if (view.name === "mine") {
    content = (
      <MyAppointments
        slug={slug}
        onBack={() => setView({ name: "home" })}
        onBook={() => setView({ name: "book" })}
      />
    );
  } else if (view.name === "booked") {
    content = (
      <div className="space-y-5 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <div>
          <h2 className="text-lg font-semibold">
            ¡Listo! Tu {terms.appointment} quedó reservada
          </h2>
          <p className="mt-2 text-sm text-ink-muted first-letter:uppercase">
            {formatDateLabel(view.appointment.startAt, profile)}
          </p>
          <p className="text-sm text-ink-muted">
            {view.appointment.serviceName} con {view.appointment.staffName}
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          Te enviaremos la confirmación y un recordatorio antes de la cita.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={() => setView({ name: "mine" })}>
            Ver mis {terms.appointments}
          </Button>
          <Button variant="ghost" onClick={() => setView({ name: "home" })}>
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          Hola, {session.customer.fullName.split(" ")[0]}
        </h2>
        <HomeOption
          icon={<CalendarPlus className="size-5" />}
          title={`Reservar ${terms.appointment}`}
          description="Elige qué necesitas, con quién y a qué hora."
          onClick={() => setView({ name: "book" })}
        />
        <HomeOption
          icon={<ListChecks className="size-5" />}
          title={`Mis ${terms.appointments}`}
          description="Revisa o cancela tus próximas reservas."
          onClick={() => setView({ name: "mine" })}
        />
        <button
          type="button"
          onClick={() => setView({ name: "delete" })}
          className="w-full pt-2 text-center text-sm text-ink-muted hover:text-danger"
        >
          Eliminar mis datos
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary font-bold text-on-primary">
            {initials(profile.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold">{profile.name}</h1>
            <p className="flex items-center gap-1 text-xs text-ink-muted">
              <CalendarCheck className="size-3.5" /> Reservas en línea
            </p>
          </div>
          {session && (
            <button
              type="button"
              onClick={() => {
                clear();
                setView({ name: "home" });
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-muted hover:text-ink"
            >
              <LogOut className="size-4" /> Salir
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-5 px-4 py-6">{content}</main>
      <footer className="space-y-1 pb-8 text-center text-xs text-ink-muted">
        <p>Con tecnología de {PRODUCT_NAME}</p>
        {legalLinks && (
          <p className="space-x-3">
            <a
              href={legalLinks.privacy}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              Privacidad
            </a>
            <a
              href={legalLinks.terms}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              Términos
            </a>
          </p>
        )}
      </footer>
    </div>
  );
}
