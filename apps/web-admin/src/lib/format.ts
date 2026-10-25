export const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

export function currency(valueCents: number) {
  return mxn.format(valueCents / 100);
}
