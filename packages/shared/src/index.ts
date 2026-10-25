// Nombre comercial provisional. Cada app lo puede sobrescribir por variable de entorno
// (VITE_PRODUCT_NAME en los frontends, PRODUCT_NAME en la API) sin tocar codigo.
export const DEFAULT_PRODUCT_NAME = "Agenda de Citas";

export function resolveProductName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : DEFAULT_PRODUCT_NAME;
}
