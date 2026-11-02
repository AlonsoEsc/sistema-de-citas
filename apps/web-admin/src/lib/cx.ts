/** Une clases CSS ignorando valores vacios o falsos. */
export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
