import { resolveProductName } from "@citas/shared";

export const PRODUCT_NAME = resolveProductName(import.meta.env.VITE_PRODUCT_NAME);
