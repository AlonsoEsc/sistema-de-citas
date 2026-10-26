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
    /**
     * "authentication": plantilla de codigo de verificacion de Meta (cuerpo y boton de copiar
     * codigo llevan el mismo parametro). Es la unica forma de entregar un OTP por WhatsApp a
     * quien no escribio en las ultimas 24 h.
     */
    kind?: "standard" | "authentication";
    parameterOrder?: string[];
    components?: unknown[];
  };
};
