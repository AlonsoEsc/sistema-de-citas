import { env, isProduction } from "../config.js";
import { postWithTimeout, type Delivery, type SendResult } from "./types.js";

export async function sendEmail({
  item,
  message,
}: Delivery): Promise<SendResult> {
  if (!env.SENDGRID_API_KEY || !env.EMAIL_FROM) {
    if (isProduction) {
      throw new Error("SendGrid no esta configurado");
    }
    console.log(
      `[worker] email (desarrollo) -> ${item.to} evento=${item.eventType}`,
    );
    return { provider: "development" };
  }

  const response = await postWithTimeout(
    "https://api.sendgrid.com/v3/mail/send",
    {
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: item.to }] }],
        from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
        subject: message.subject,
        content: [{ type: "text/plain", value: message.body }],
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
  }
  return {
    provider: "sendgrid",
    messageId: response.headers.get("x-message-id") ?? undefined,
  };
}
