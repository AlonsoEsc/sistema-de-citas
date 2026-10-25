/**
 * Forma de las configuraciones de integracion que la API guarda cifradas en
 * IntegrationConnection.configEnc y que el worker lee para enviar mensajes.
 */
export type EvolutionConfig = {
  provider: "evolution";
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookSecret: string;
};

export type TwilioWhatsappConfig = {
  provider: "twilio";
  accountSid: string;
  authToken: string;
  from: string;
};

export type WhatsappConfig = EvolutionConfig | TwilioWhatsappConfig;

export type ChatwootConfig = {
  baseUrl: string;
  apiToken: string;
  accountId: number;
  inboxId: number;
  webhookSecret: string;
};

/** Plantilla aprobada por Meta asociada a una NotificationTemplate de WhatsApp. */
export type ProviderTemplateConfig = {
  evolution?: {
    name: string;
    language?: string;
    parameterOrder?: string[];
    components?: unknown[];
  };
};
