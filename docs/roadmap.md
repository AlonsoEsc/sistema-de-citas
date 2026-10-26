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
- Pantallas del panel para equipo, consumo del plan y cambio de contraseña: la API existe
  (`/team`, `/billing/usage`, `/auth/password/change`), la interfaz llega en la fase 3.
- Páginas públicas de términos y política de privacidad (el registro ya exige aceptarlas).

## Fase 3: frontend

- Rutas reales por sección y `ProAdminApp` dividido por funcionalidad (el enrutador ya
  existe para cuenta y plataforma).
- Vocabulario del rubro en todo el panel y el portal (`/tenants/me` y `/profile` ya lo
  entregan).
- Una sola librería de iconos y componentes base propios.
- Estados de carga, vacío y error en todas las pantallas.
- Retirar las simulaciones restantes (portal de clientes, conexión de WhatsApp,
  avatares de muestra).

## Fase 4: operación y legal (en paralelo)

- Imágenes Docker, staging, despliegue continuo.
- Backups con prueba de restauración, monitoreo de errores y uptime.
- Términos, política de privacidad, consentimiento y exportación/borrado de datos
  (Ley de Protección de Datos Personales de El Salvador).
