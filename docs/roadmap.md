# Hoja de ruta hacia un SaaS comercial

## Fase 0: higiene ✅

- Repositorio git, CI, Prettier, EditorConfig y scripts de verificación.
- Código muerto, mocks y la "Guía backend" eliminados; MUI, FullCalendar, framer-motion
  y react-router-dom retirados.
- Nombre del producto configurable.
- Prototipos, capturas de QA y logs de herramientas fuera del repositorio.

## Fase 1: arquitectura del backend ✅

- Monolito modular (`apps/api/src/modules/*`): rutas con esquemas Zod, reglas en
  servicios. Detalle en [arquitectura del backend](architecture/backend.md).
- Aislamiento por tenant centralizado en `forTenant()` (paquete `@citas/db`), con test que
  detecta modelos sin registrar.
- Validación, tipos y OpenAPI (`/docs`) generados desde los mismos esquemas.
- Prisma 7 y Zod 4; schema, migraciones y seed en `packages/db`, código común en
  `packages/shared`. API y worker empaquetados con tsup.
- Asistente de WhatsApp como máquina de estados; worker dividido en outbox, canales y
  recordatorios, con modo `log` fuera de producción para no enviar mensajes reales.
- Correcciones: reservas de clientes solo en espacios libres y dentro de la ventana, zona
  horaria del negocio en todo el sistema, respuestas públicas sin datos internos, SSRF en
  integraciones, 409 en reservas simultáneas, eliminado el cambio de plan sin pago.

Pendiente de esta fase, movido a fases siguientes:

- RLS de PostgreSQL como segunda barrera (fase 4): requiere fijar el tenant por
  transacción y un rol de base de datos sin privilegios de dueño.
- Reportes programados: la API los guarda pero ningún proceso los genera ni envía (fase 2).
- OTP por WhatsApp con plantilla de autenticación aprobada por Meta; fuera de la ventana de
  24 h el texto libre no se entrega (fase 2).

## Fase 2: núcleo SaaS ✅

- Rubro configurable (11 rubros) con vocabulario y servicios sugeridos.
- Registro autónomo con prueba de 14 días; guía de primeros pasos (`/onboarding`).
- Suscripciones (prueba, activa, pago pendiente, vencida, cancelada) y pagos; planes con
  límites de profesionales y cupo de WhatsApp; solo lectura al vencer.
- Panel y API de plataforma (superadmin): negocios, pagos manuales, cambio de plan,
  extensión de prueba, suspensión y edición de planes.
- Equipo: invitaciones, roles y desactivación; verificación de correo y recuperación de
  contraseña; cambiar la contraseña cierra las demás sesiones.
- Portal de reservas por URL (`/{slug}`) con zona horaria, moneda e idioma del negocio.
- Reportes programados reales (correo con CSV o WhatsApp) y OTP con plantilla de
  autenticación de Meta. Bitácora de auditoría.

Pendiente de esta fase:

- Pasarela de cobro recurrente (Wompi u otra): el modelo ya separa `provider` y
  `externalId`; falta el webhook de pagos y el cobro automático.
- Páginas públicas de términos y política de privacidad (el registro ya exige aceptarlas).

## Fase 3: frontend ✅

- Panel reconstruido por funcionalidad (`apps/web-admin/src/features`), una ruta por
  sección y carga diferida por pantalla. Se retiró `ProAdminApp` y su CSS con `!important`.
- Tokens de diseño en `index.css` (modo claro/oscuro con `data-theme`) y kit de UI propio:
  botones, tarjetas, diálogos nativos, avisos, pestañas, estados de carga, vacío y error.
- Fechas, montos y vocabulario del rubro del negocio en todo el panel y el portal.
- Agenda semanal/diaria con citas ubicadas por minuto y carriles para citas simultáneas;
  crear, reprogramar, cambiar estado y eliminar. Pide solo el rango visible.
- Editor de horario semanal con descansos (antes no existía y un negocio nuevo no podía
  terminar de configurarse).
- Clientes con borrado de datos personales (anonimiza si hay citas).
- Avisos activables por canal (el código de acceso es obligatorio); reportes con gráfica
  por día, desglose por profesional y servicio, exportación CSV y reportes programados.
- Integraciones reales (Evolution, Chatwoot, Google Calendar), usuarios, plan y consumo,
  cambio de contraseña, portal con enlace y código QR generado en el navegador.
- Portal de reservas dividido por componentes: acceso por código, “cualquier profesional”,
  días reservables según la política del negocio, mis citas y cancelación.
- Se retiraron las simulaciones (QR falso de WhatsApp, conversaciones y fotos de muestra,
  portal simulado, “WhatsApp pausado”).

Pendiente de esta fase:

- Responder conversaciones desde el panel (hoy se responde en WhatsApp o Chatwoot).
- Personalización visual del portal por negocio (logo y color).

## Fase 4: operación y legal (en paralelo)

- Imágenes Docker, staging, despliegue continuo.
- Backups con prueba de restauración, monitoreo de errores y uptime.
- Términos, política de privacidad, consentimiento y exportación/borrado de datos
  (Ley de Protección de Datos Personales de El Salvador).
