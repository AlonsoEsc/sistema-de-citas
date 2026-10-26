# WhatsApp, Evolution API and Chatwoot

## Architecture

The appointments API remains the source of truth. Evolution API transports WhatsApp
messages and Chatwoot provides the human inbox. Neither service owns appointment
availability or appointment state.

Outbound flow:

1. Appointment events create idempotent `NotificationOutbox` rows.
2. The worker atomically claims pending rows.
3. The tenant WhatsApp connection selects Evolution or the legacy Twilio fallback.
4. The provider message id and delivery/read events are stored.

Inbound flow:

1. Evolution calls `/webhooks/whatsapp/evolution/:connectionId`.
2. The webhook authenticates with a per-connection secret and deduplicates provider ids.
3. The assistant handles booking, confirmation, cancellation, rescheduling, opt-out,
   feedback and human handoff.
4. When Chatwoot is configured, inbound messages are mirrored to the tenant inbox.
5. Chatwoot `message_created` webhooks enqueue agent replies through the same outbox.

## Local database

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
```

## Messaging infrastructure

Copy `infra/messaging/.env.example` to `infra/messaging/.env`, replace every secret,
then run on a host with Docker:

```bash
docker compose -f infra/messaging/docker-compose.yml run --rm chatwoot-rails bundle exec rails db:chatwoot_prepare
docker compose -f infra/messaging/docker-compose.yml up -d
```

Both HTTP ports bind to localhost intentionally. Put Evolution and Chatwoot behind an
HTTPS reverse proxy and set `SERVER_URL`, `FRONTEND_URL` and the main application's
`API_PUBLIC_BASE_URL` to their public HTTPS URLs.

The local Evolution port is `8081` because the bundled EnterpriseDB HTTP service can
already occupy `8080` on Windows installations.

Evolution is pinned to stable `v2.3.7`; do not switch production to a release
candidate. Chatwoot is pinned to `v4.14.2-ce`. Review and test upgrades before changing
either tag.

## Connect Evolution

1. Create an Evolution instance using the WhatsApp Cloud API integration.
2. In the admin panel open Settings → WhatsApp.
3. Enter Evolution URL, global/instance API key and instance name.
4. The API validates `connectionState`, stores credentials encrypted and configures
   `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE` and `CONNECTION_UPDATE`.

`API_PUBLIC_BASE_URL` must be reachable by Evolution. A localhost URL only works when
both processes share the same host/network.

## Connect Chatwoot

Create an inbox and an API access token, then call:

```http
POST /integrations/chatwoot/connect
Authorization: Bearer <tenant-admin-jwt>
Content-Type: application/json

{
  "baseUrl": "https://chat.example.com",
  "apiToken": "...",
  "accountId": 1,
  "inboxId": 1
}
```

The response returns a tenant-specific webhook URL. Register it in Chatwoot for
`message_created`. Never expose this URL publicly in logs because it contains the
webhook secret.

## Approved WhatsApp templates

Messages initiated outside Meta's customer-service window require approved templates.
For each WhatsApp `NotificationTemplate`, set `variablesJson` like:

```json
{
  "evolution": {
    "name": "appointment_reminder_24h",
    "language": "es",
    "parameterOrder": ["customerName", "staffName", "startAt"]
  }
}
```

The worker then uses Evolution's `sendTemplate` endpoint. Without this metadata it
uses `sendText`, which is appropriate only inside an active customer-service window.

## Assistant commands

- `AGENDAR`: service → professional → date → available slot → final confirmation.
- Dates accept `HOY`, `MAÑANA`, `DD/MM/AAAA` and `AAAA-MM-DD`, subject to the
  tenant booking window.
- `CONFIRMAR`: confirms the next active appointment.
- `REAGENDAR`: date → available slot → final confirmation while preserving the old
  slot until the change is accepted.
- `CANCELAR`: cancels the next active appointment when the tenant cancellation
  policy permits it; late requests are transferred to reception.
- `ASESOR`: enables Chatwoot human handoff.
- `BOT` or `MENU`: exits human handoff and returns to automation.
- `#BOT`, `/bot` or `DEVOLVER AL BOT` from a Chatwoot agent returns the conversation
  to automation without forwarding the control command to the customer.
- `STOP`: records WhatsApp opt-out.
- `ALTA`: records opt-in again.
- `1` to `5`: records feedback after a completed appointment.

## Production checklist

- Public HTTPS URLs and reverse proxy configured.
- Evolution uses WhatsApp Cloud API, not a linked-device session, for commercial tenants.
- Meta business, phone number and templates approved.
- Chatwoot webhook registered and tested.
- `ENCRYPTION_KEY` backed up securely; changing it invalidates stored integrations.
- Worker runs with at least two replicas only after verifying atomic outbox claims.
- Database backups, Redis persistence, metrics and alerting enabled.
- Quiet hours, tenant timezone and local consent wording reviewed before launch.
- Reminder recovery windows and no-show follow-up reviewed for each tenant.

## Códigos de verificación (OTP) por WhatsApp

Meta solo entrega mensajes iniciados por el negocio fuera de la ventana de 24 horas si usan
una plantilla aprobada. Para los códigos del portal de reservas cada negocio debe crear en
su cuenta de WhatsApp Business una plantilla de la categoría **Autenticación**:

- Nombre: `codigo_verificacion`
- Idioma: Español (`es`)
- Botón: copiar código

Todo negocio nuevo nace con su plantilla `auth.otp.requested` asociada a ese nombre
(`kind: "authentication"`); el worker envía el código en el cuerpo y en el botón. Si el
negocio usa otro nombre, se cambia desde Ajustes → Plantillas (o
`PUT /notifications/templates/:id/provider`).

## Cupo de mensajes

Cada plan incluye un número de mensajes de WhatsApp al mes. Al agotarse, los avisos
automáticos (confirmaciones, recordatorios) dejan de salir por WhatsApp y siguen por correo;
las respuestas del asistente y los códigos de verificación no se bloquean.
