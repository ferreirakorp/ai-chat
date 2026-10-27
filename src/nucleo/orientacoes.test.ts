import { describe, expect, it } from "vitest";
import {
  blocoDeOrientacoes,
  orientacoesParaMensagem,
  palavrasSugeridas,
  validarOrientacao,
  type Orientacao,
} from "./orientacoes";

const o = (id: string, palavras: string[], extra: Partial<Orientacao> = {}): Orientacao => ({
  id,
  titulo: `T${id}`,
  palavras,
  instrucao: `Instrução ${id}`,
  ativa: true,
  ...extra,
});

describe("validarOrientacao", () => {
  const boa = {
    titulo: "  Câmbio ",
    palavras: "câmbio, kwanza; dólar\ncambio",
    instrucao: "Não dês valores de câmbio; diz que variam todos os dias.",
  };

  it("aceita lista ou texto de palavras, limpa e tira repetidas (sem acentos)", () => {
    const r = validarOrientacao(boa);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orientacao.titulo).toBe("Câmbio");
    expect(r.orientacao.palavras).toEqual(["câmbio", "kwanza", "dólar"]);
    expect(r.orientacao.ativa).toBe(true);
    expect(validarOrientacao({ ...boa, palavras: ["a b", "c d"], ativa: false })).toMatchObject({
      ok: true,
      orientacao: { ativa: false },
    });
  });

  it("diz qual é o campo mal preenchido", () => {
    expect(validarOrientacao({ ...boa, titulo: "ab" })).toEqual({ ok: false, erro: "titulo" });
    expect(validarOrientacao({ ...boa, titulo: "t".repeat(81) })).toEqual({ ok: false, erro: "titulo" });
    expect(validarOrientacao({ ...boa, palavras: "" })).toEqual({ ok: false, erro: "palavras" });
    expect(validarOrientacao({ ...boa, palavras: Array.from({ length: 13 }, (_, i) => `palavra${i}`) })).toEqual({
      ok: false,
      erro: "palavras",
    });
    expect(validarOrientacao({ ...boa, instrucao: "curta" })).toEqual({ ok: false, erro: "instrucao" });
    expect(validarOrientacao({ ...boa, instrucao: "x".repeat(601) })).toEqual({ ok: false, erro: "instrucao" });
    expect(validarOrientacao(null)).toEqual({ ok: false, erro: "titulo" });
  });
});

describe("palavrasSugeridas", () => {
  it("as palavras que contam da pergunta (sem as vazias), até ao máximo", () => {
    expect(palavrasSugeridas("Qual é o câmbio do kwanza para o dólar hoje?")).toEqual([
      "cambio",
      "kwanza",
      "dolar",
      "hoje",
    ]);
    expect(palavrasSugeridas("câmbio kwanza dólar hoje", 2)).toHaveLength(2);
  });
});

describe("orientacoesParaMensagem", () => {
  const lista = [
    o("1", ["câmbio", "kwanza"]),
    o("2", ["investimento"]),
    o("3", ["taxa de juro"], { ativa: false }),
    o("4", ["etiquetas electrónicas"]),
    o("5", ["bna"]),
  ];

  it("serve pelas palavras-chave, a mais certeira primeiro", () => {
    expect(orientacoesParaMensagem("Qual o câmbio do kwanza?", lista).map((x) => x.id)).toEqual(["1"]);
    expect(orientacoesParaMensagem("kwanza e câmbio e investimento", lista).map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("palavras de 5 letras ou mais servem pela raiz; as curtas e as expressões têm de coincidir inteiras", () => {
    expect(orientacoesParaMensagem("Quero investir bem", lista).map((x) => x.id)).toEqual(["2"]);
    expect(orientacoesParaMensagem("o bna mudou", lista).map((x) => x.id)).toEqual(["5"]);
    expect(orientacoesParaMensagem("o bnado mudou", lista)).toEqual([]);
    expect(orientacoesParaMensagem("sobre as etiquetas electrónicas", lista).map((x) => x.id)).toEqual(["4"]);
    expect(orientacoesParaMensagem("só electrónicas", lista)).toEqual([]);
  });

  it("ignora as inactivas e respeita o máximo", () => {
    expect(orientacoesParaMensagem("taxa de juro", lista)).toEqual([]);
    const muitas = Array.from({ length: 6 }, (_, i) => o(String(i), ["kwanza"]));
    expect(orientacoesParaMensagem("kwanza", muitas)).toHaveLength(3);
    expect(orientacoesParaMensagem("kwanza", muitas, 1)).toHaveLength(1);
    expect(orientacoesParaMensagem("", lista)).toEqual([]);
  });
});

describe("blocoDeOrientacoes", () => {
  it("vazio sem orientações; senão numerado e com a prioridade das regras fixas", () => {
    expect(blocoDeOrientacoes([])).toBe("");
    const b = blocoDeOrientacoes([o("1", ["a"]), o("2", ["b"])]);
    expect(b).toContain("ORIENTAÇÕES DA EQUIPA");
    expect(b).toContain("REGRAS FIXAS");
    expect(b).toContain("1. Instrução 1");
    expect(b).toContain("2. Instrução 2");
  });
});
