import type { TwilioWhatsappConfig } from "@citas/shared/integrations";
import { env } from "../config.js";
import {
  postWithTimeout,
  readBody,
  type Delivery,
  type SendResult,
} from "./types.js";

type TwilioCredentials = Omit<TwilioWhatsappConfig, "provider">;

export async function sendTwilio(
  { item, message }: Delivery,
  credentials: TwilioCredentials,
  channel: "sms" | "whatsapp",
): Promise<SendResult> {
  const to =
    channel === "whatsapp" && !item.to.startsWith("whatsapp:")
      ? `whatsapp:${item.to}`
      : item.to;
  const response = await postWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: credentials.from,
        To: to,
        Body: message.body,
      }),
    },
  );
  const raw = await readBody(response);
  if (!response.ok) {
    throw new Error(
      `Twilio ${response.status}: ${String(raw.message ?? JSON.stringify(raw))}`,
    );
  }
  return {
    provider: "twilio",
    messageId: typeof raw.sid === "string" ? raw.sid : undefined,
    raw,
  };
}

export function sendSms(delivery: Delivery) {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_SMS_FROM
  ) {
    throw new Error("Twilio SMS no esta configurado");
  }
  return sendTwilio(
    delivery,
    {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_SMS_FROM,
    },
    "sms",
  );
}
