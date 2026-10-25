/** Normaliza a formato E.164 aproximado: solo digitos con prefijo "+". Vacio si no hay digitos. */
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

/** Oculta el numero dejando visibles los ultimos 4 digitos. */
export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? `•••• ${digits}` : `•••• ${digits.slice(-4)}`;
}
