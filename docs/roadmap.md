# Hoja de ruta hacia un SaaS comercial

## Fase 0: higiene ✅

- Repositorio git, CI, Prettier, EditorConfig y scripts de verificación.
- Código muerto, mocks y la "Guía backend" eliminados; MUI, FullCalendar, framer-motion
  y react-router-dom retirados.
- Nombre del producto configurable.
- Prototipos, capturas de QA y logs de herramientas fuera del repositorio.

## Fase 1: arquitectura del backend

- Monolito modular: `src/modules/{auth, tenancy, catalog, customers, scheduling,
notifications, billing, messaging, reports}`, cada uno con rutas, servicio,
  repositorio y esquemas.
- Rutas delgadas; la lógica vive en servicios y el acceso a datos en repositorios.
- Aislamiento por tenant centralizado (extensión del cliente de Prisma) y RLS de
  PostgreSQL como segunda barrera.
- Esquemas Zod como contrato único: validación, tipos y OpenAPI generados de la misma
  fuente.
- Código compartido entre API y worker en paquetes (`packages/db`, `packages/domain`).
- Asistente de WhatsApp como máquina de estados en archivos pequeños y testeables.
- Actualizar Prisma y Zod a sus versiones mayores actuales (cierra los avisos de
  seguridad pendientes).

## Fase 2: núcleo SaaS

- Rubro configurable por negocio (barbería, salón, clínica, odontología, etc.):
  vocabulario (cliente/paciente, servicio/tratamiento), plantillas y datos iniciales.
- Registro autónomo con onboarding guiado y prueba gratuita.
- Suscripciones: planes, límites por plan (profesionales, mensajes de WhatsApp),
  cobros fallidos y cancelación.
- Panel de superadmin para operar la plataforma.
- Invitación de usuarios, recuperación de contraseña y verificación de correo.
- URL de reservas por negocio (`/:slug`) en lugar de un build por tenant.
- Zona horaria y moneda por tenant en disponibilidad y reportes.
- Bitácora de auditoría.

## Fase 3: frontend

- Rutas reales por sección y `ProAdminApp` dividido por funcionalidad.
- Una sola librería de iconos y componentes base propios.
- Estados de carga, vacío y error en todas las pantallas.
- Retirar las simulaciones restantes (portal de clientes, conexión de WhatsApp,
  avatares de muestra).

## Fase 4: operación y legal (en paralelo)

- Imágenes Docker, staging, despliegue continuo.
- Backups con prueba de restauración, monitoreo de errores y uptime.
- Términos, política de privacidad, consentimiento y exportación/borrado de datos
  (Ley de Protección de Datos Personales de El Salvador).
