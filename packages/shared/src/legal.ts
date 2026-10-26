/**
 * Terminos del servicio y politica de privacidad. Es un BORRADOR redactado para un SaaS de
 * citas que opera en El Salvador: debe revisarlo un abogado antes de publicarse. Los datos
 * del responsable vienen de la configuracion de cada despliegue.
 */

export type LegalEntity = {
  productName: string;
  /** Nombre o razon social del responsable. */
  legalName?: string;
  /** Correo para consultas de privacidad y ejercicio de derechos. */
  email?: string;
  address?: string;
  country?: string;
};

export type LegalSection = { heading: string; paragraphs: string[] };

export type LegalDocument = {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
};

/** Fecha de la ultima revision de los textos (cambiarla al modificarlos). */
export const LEGAL_UPDATED_AT = "2026-10-27";

const PENDING = "[pendiente de completar]";

function entityOf(input: LegalEntity) {
  return {
    product: input.productName,
    name: input.legalName?.trim() || PENDING,
    email: input.email?.trim() || PENDING,
    address: input.address?.trim() || PENDING,
    country: input.country?.trim() || "El Salvador",
  };
}

/** True si faltan datos del responsable: la pagina lo muestra como aviso. */
export function legalEntityIncomplete(input: LegalEntity) {
  return !input.legalName?.trim() || !input.email?.trim();
}

export function termsOfService(input: LegalEntity): LegalDocument {
  const e = entityOf(input);
  return {
    title: "Términos del servicio",
    updatedAt: LEGAL_UPDATED_AT,
    sections: [
      {
        heading: "1. Quiénes somos",
        paragraphs: [
          `${e.product} es un servicio de agenda en línea operado por ${e.name}, con domicilio en ${e.address}, ${e.country}. Contacto: ${e.email}.`,
          "Estos términos regulan el uso del panel de administración por parte de los negocios suscritos y del portal de reservas por parte de sus clientes.",
        ],
      },
      {
        heading: "2. Cuenta y prueba gratuita",
        paragraphs: [
          "Para usar el panel necesitas crear una cuenta con datos verdaderos y mantener tu contraseña en secreto. Eres responsable de lo que ocurra con tu cuenta y de las personas de tu equipo a quienes des acceso.",
          "Los negocios nuevos tienen una prueba gratuita de 14 días sin tarjeta. Al terminar, el panel queda en modo consulta hasta que contrates un plan.",
        ],
      },
      {
        heading: "3. Planes y pagos",
        paragraphs: [
          "Cada plan incluye un número máximo de profesionales activos y un cupo mensual de mensajes de WhatsApp. Los precios están publicados en el panel y pueden cambiar con al menos 30 días de aviso.",
          "Si un pago no se confirma, tienes 3 días de gracia; después el panel pasa a modo consulta y el portal deja de recibir reservas, sin borrar tus datos.",
        ],
      },
      {
        heading: "4. Uso aceptable",
        paragraphs: [
          "No puedes usar el servicio para enviar mensajes no solicitados, suplantar a otra persona, tratar datos sin una base legítima ni intentar acceder a información de otros negocios.",
          "Los mensajes por WhatsApp deben cumplir las políticas de Meta. Tus clientes pueden dejar de recibirlos en cualquier momento respondiendo STOP.",
        ],
      },
      {
        heading: "5. Tus datos y los de tus clientes",
        paragraphs: [
          "Los datos que registras sobre tus clientes y citas son tuyos. Nosotros los tratamos solo para prestarte el servicio, según la Política de privacidad.",
          "Puedes exportar los datos de tu negocio desde Ajustes y eliminar los datos de un cliente desde el panel.",
        ],
      },
      {
        heading: "6. Disponibilidad",
        paragraphs: [
          "Hacemos respaldos diarios y monitoreamos el servicio, pero no garantizamos que funcione sin interrupciones. Avisaremos con anticipación los mantenimientos programados.",
        ],
      },
      {
        heading: "7. Cancelación",
        paragraphs: [
          "Puedes cancelar tu suscripción cuando quieras escribiendo a " +
            e.email +
            ". Podemos suspender cuentas que incumplan estos términos.",
          "Tras cancelar, conservamos los datos 30 días para que puedas exportarlos y luego los eliminamos, salvo lo que la ley obligue a conservar.",
        ],
      },
      {
        heading: "8. Responsabilidad",
        paragraphs: [
          "En la medida que la ley lo permita, nuestra responsabilidad se limita al monto pagado por el servicio en los últimos 3 meses.",
        ],
      },
      {
        heading: "9. Ley aplicable",
        paragraphs: [
          `Estos términos se rigen por las leyes de ${e.country}. Podemos actualizarlos; si el cambio es importante, te avisaremos por correo o en el panel.`,
        ],
      },
    ],
  };
}

export function privacyPolicy(input: LegalEntity): LegalDocument {
  const e = entityOf(input);
  return {
    title: "Política de privacidad",
    updatedAt: LEGAL_UPDATED_AT,
    sections: [
      {
        heading: "1. Responsables",
        paragraphs: [
          `${e.name} (${e.address}, ${e.country}; ${e.email}) es responsable de los datos de las cuentas de los negocios que usan ${e.product}.`,
          "Cada negocio es responsable de los datos de sus propios clientes. Nosotros actuamos como encargados: los tratamos por cuenta del negocio y solo para prestar el servicio.",
        ],
      },
      {
        heading: "2. Qué datos tratamos",
        paragraphs: [
          "De los negocios y su equipo: nombre, correo, contraseña (guardada solo como hash, nunca legible), rol y datos de facturación.",
          "De los clientes que reservan: nombre, teléfono, correo (opcional), citas, mensajes de WhatsApp con el negocio y, si el negocio lo registra, notas internas.",
          "Datos técnicos: dirección IP y registros de actividad para seguridad y auditoría.",
        ],
      },
      {
        heading: "3. Para qué los usamos",
        paragraphs: [
          "Gestionar citas, enviar confirmaciones y recordatorios, verificar el teléfono con un código, generar reportes para el negocio, facturar el servicio y proteger la plataforma contra abusos.",
          "No vendemos datos ni los usamos para publicidad.",
        ],
      },
      {
        heading: "4. Datos de salud",
        paragraphs: [
          "Clínicas y consultorios pueden registrar información relacionada con la salud. Son datos sensibles: el negocio debe registrar solo lo necesario y nosotros los protegemos con controles de acceso por rol y aislamiento entre negocios.",
        ],
      },
      {
        heading: "5. Con quién los compartimos",
        paragraphs: [
          "Con proveedores que nos ayudan a prestar el servicio, solo en lo necesario: alojamiento del servidor, envío de correos (SendGrid), mensajes (Meta WhatsApp, Twilio), reporte de errores (Sentry, sin datos personales) y, si el negocio lo conecta, Google Calendar o Chatwoot.",
          "Algunos proveedores procesan datos fuera de " +
            e.country +
            "; exigimos que apliquen medidas de seguridad equivalentes.",
        ],
      },
      {
        heading: "6. Cuánto tiempo los guardamos",
        paragraphs: [
          "Mientras la cuenta del negocio esté activa y hasta 30 días después de cancelarla. Los respaldos se conservan 14 días.",
          "Cuando un negocio elimina a un cliente, sus datos personales se borran; si tenía citas, quedan sin nombre para no alterar los reportes del negocio.",
        ],
      },
      {
        heading: "7. Tus derechos",
        paragraphs: [
          "Puedes pedir acceso, rectificación, supresión, oposición y portabilidad de tus datos.",
          "Si eres cliente de un negocio, puedes eliminar tus datos desde el portal de reservas (opción “Eliminar mis datos”) o pedírselo al negocio. Si eres un negocio, escríbenos a " +
            e.email +
            ".",
          "Respondemos en un plazo máximo de 15 días hábiles.",
        ],
      },
      {
        heading: "8. Seguridad",
        paragraphs: [
          "Usamos conexiones cifradas (HTTPS), contraseñas con hash, credenciales de integraciones cifradas, aislamiento entre negocios a nivel de base de datos, registro de auditoría y respaldos diarios con pruebas de restauración.",
        ],
      },
      {
        heading: "9. Cambios",
        paragraphs: [
          "Si cambiamos esta política de forma importante, lo avisaremos en el panel o por correo antes de que el cambio aplique.",
        ],
      },
    ],
  };
}
