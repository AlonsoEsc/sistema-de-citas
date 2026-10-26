import type { MessageDeliveryStatus } from "@citas/db";
import { asRecord, type JsonRecord } from "../../shared/json.js";

/** Lectura tolerante de los payloads de webhook de Evolution API. */

export type EvolutionKey = {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
};

export function evolutionEvent(payload: JsonRecord) {
  const rawData = payload.data;
  const data = asRecord(Array.isArray(rawData) ? rawData[0] : rawData);
  return {
    event: String(payload.event ?? "").toLowerCase(),
    data,
    key: asRecord(data.key) as EvolutionKey,
  };
}

export function messageText(data: JsonRecord) {
  const message = asRecord(data.message);
  const extended = asRecord(message.extendedTextMessage);
  const buttons = asRecord(message.buttonsResponseMessage);
  const list = asRecord(message.listResponseMessage);
  const single = asRecord(list.singleSelectReply);
  return String(
    message.conversation ??
      extended.text ??
      buttons.selectedDisplayText ??
      buttons.selectedButtonId ??
      list.title ??
      single.selectedRowId ??
      "",
  ).trim();
}

/** Telefono del remitente; vacio para grupos (@g.us) e identificadores ocultos (@lid). */
export function phoneFromJid(jid?: string) {
  if (!jid || jid.endsWith("@lid") || jid.endsWith("@g.us")) {
    return "";
  }
  const digits = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits ? `+${digits}` : "";
}

export function connectionStateOf(data: JsonRecord, payload: JsonRecord) {
  return String(
    data.state ?? data.status ?? payload.state ?? payload.status ?? "unknown",
  ).toLowerCase();
}

export function deliveryStatusOf(
  data: JsonRecord,
  payload: JsonRecord,
): Exclude<MessageDeliveryStatus, "queued"> {
  const raw = String(data.status ?? payload.status ?? "").toLowerCase();
  if (raw.includes("read")) {
    return "read";
  }
  if (raw.includes("deliver")) {
    return "delivered";
  }
  if (raw.includes("fail") || raw.includes("error")) {
    return "failed";
  }
  return "sent";
}
