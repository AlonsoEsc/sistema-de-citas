import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("escapa comas, comillas y saltos de linea", () => {
    expect(csvCell("Corte, barba")).toBe('"Corte, barba"');
    expect(csvCell('Dice "hola"')).toBe('"Dice ""hola"""');
    expect(csvCell(1500)).toBe("1500");
  });

  it("neutraliza formulas escritas por usuarios", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+50370000000")).toBe("'+50370000000");
    expect(csvCell(-5)).toBe("-5");
  });
});

describe("toCsv", () => {
  it("une secciones con titulo y encabezado", () => {
    expect(
      toCsv([
        {
          title: "Por profesional",
          header: ["Nombre", "Citas"],
          rows: [["Ana", 3]],
        },
        { title: "Por dia", header: ["Fecha", "Citas"], rows: [] },
      ]),
    ).toBe(
      "Por profesional\r\nNombre,Citas\r\nAna,3\r\n\r\nPor dia\r\nFecha,Citas",
    );
  });
});
