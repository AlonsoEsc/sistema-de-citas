import { Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Template = {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  eventType: string;
  body: string;
  subject?: string | null;
};

export function SettingsPage() {
  const entitlements = useQuery({
    queryKey: ["entitlements"],
    queryFn: async () => (await api.get<Record<string, unknown>>("/entitlements")).data
  });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await api.get<Template[]>("/notifications/templates")).data
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Configuración y canales</Typography>

      <Paper sx={{ p: 2.5, borderRadius: 4 }}>
        <Typography variant="h6">Entitlements del plan</Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {Object.entries(entitlements.data ?? {}).map(([key, value]) => (
            <Typography key={key} variant="body2">
              <b>{key}</b>: {JSON.stringify(value)}
            </Typography>
          ))}
          {!Object.keys(entitlements.data ?? {}).length && (
            <Typography color="text.secondary">No hay entitlements cargados.</Typography>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2.5, borderRadius: 4 }}>
        <Typography variant="h6">Plantillas de notificación</Typography>
        <Stack spacing={1.2} sx={{ mt: 1.5 }}>
          {templates.data?.map((tpl) => (
            <Paper key={tpl.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2">
                <b>{tpl.channel}</b> · {tpl.eventType}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {tpl.subject ? `${tpl.subject} | ` : ""}
                {tpl.body}
              </Typography>
            </Paper>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
