import { describe, expect, it } from "vitest";
import { CARACTERES_DA_PREVIA, textoDaPrevia } from "./previa";

describe("a prévia do balão", () => {
  it("o que cabe vai inteiro, com os parágrafos juntos e os espaços arrumados", () => {
    expect(textoDaPrevia(["  Somos   uma empresa\nde Luanda.  "])).toBe("Somos uma empresa de Luanda.");
    expect(textoDaPrevia(["Um.", "", "Dois."])).toBe("Um. Dois.");
    expect(textoDaPrevia([])).toBe("");
  });

  it("o que não cabe corta numa palavra inteira, sem reticências nem pontuação pendurada", () => {
    const texto =
      "Fazemos a intermediação entre empresas angolanas e investidores internacionais, com análise preventiva de risco para os projectos serem viáveis e seguros, sempre.";
    const r = textoDaPrevia([texto], 60);
    expect(r.length).toBeLessThanOrEqual(60);
    expect(texto.startsWith(r)).toBe(true);
    expect(r.endsWith(" ")).toBe(false);
    expect(r.endsWith("…")).toBe(false);
    expect(textoDaPrevia([`${"palavra ".repeat(60)}fim`]).length).toBeLessThanOrEqual(CARACTERES_DA_PREVIA);
  });

  it("uma palavra enorme sem espaços corta no limite", () => {
    expect(textoDaPrevia(["x".repeat(300)], 50)).toBe("x".repeat(50));
  });
});
