type Cell = string | number;

/**
 * Escapa una celda CSV. Ademas neutraliza formulas (=, +, -, @) para que una hoja de
 * calculo no ejecute contenido escrito por clientes (inyeccion CSV).
 */
export function csvCell(value: Cell) {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Varias tablas en un solo CSV, separadas por una linea en blanco. */
export function toCsv(
  sections: Array<{ title: string; header: string[]; rows: Cell[][] }>,
) {
  return sections
    .map((section) =>
      [[section.title], section.header, ...section.rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n"),
    )
    .join("\r\n\r\n");
}

/** Descarga el CSV con BOM para que Excel respete los acentos. */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["﻿", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
