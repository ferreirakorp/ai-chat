import { describe, expect, it } from "vitest";
import { juntarTextos, lerModo, MODOS_DO_ASSISTENTE, textosPadrao } from "./conteudo";

describe("o modo do assistente (com quem se está a falar)", () => {
  it("só conhece a IA, uma pessoa e offline", () => {
    expect(MODOS_DO_ASSISTENTE).toEqual(["ia", "humano", "offline"]);
    expect(lerModo("humano")).toBe("humano");
    expect(lerModo("ia")).toBe("ia");
    expect(lerModo("offline")).toBe("offline");
    expect(lerModo("robot")).toBeNull();
    expect(lerModo(undefined)).toBeNull();
    expect(lerModo(3)).toBeNull();
  });

  it("o botão «i» tem os dois textos: mostrar e esconder as datas", () => {
    expect(textosPadrao.datas.mostrar).toContain("data e a hora");
    expect(textosPadrao.datas.esconder).toContain("Esconder");
  });

  it("cada modo tem o seu texto e o projecto pode mudar um sem perder os outros", () => {
    expect(textosPadrao.estado.ia).toBe("A falar com o modelo de IA");
    expect(textosPadrao.estado.humano).toBe("A falar com um humano");
    expect(textosPadrao.estado.offline).toBe("Ninguém online de momento");
    const t = juntarTextos(textosPadrao, { estado: { humano: "Fale com a equipa" } });
    expect(t.estado.humano).toBe("Fale com a equipa");
    expect(t.estado.ia).toBe("A falar com o modelo de IA");
  });
});
