import { describe, expect, it } from "vitest";
import {
  guardarEntrada,
  LIMITES_DO_HISTORICO,
  lerHistorico,
  limparTitulo,
  mensagensParaTitulo,
  removerEntrada,
  renomearEntrada,
  titularPelaIa,
  tituloPelasPalavras,
  type EntradaDoHistorico,
} from "./historico";

const ID_A = "123e4567-e89b-42d3-a456-426614174000";
const ID_B = "223e4567-e89b-42d3-a456-426614174000";
const ID_C = "323e4567-e89b-42d3-a456-426614174000";

const entrada = (id: string, extra: Partial<EntradaDoHistorico> = {}): EntradaDoHistorico => ({
  id,
  titulo: "Investir em Luanda",
  origem: "palavras",
  atualizada: 1000,
  estado: { mensagens: [] },
  ...extra,
});

describe("limparTitulo", () => {
  it("fica com uma só linha, sem aspas, asteriscos nem ponto final", () => {
    expect(limparTitulo('  "Investir em imóveis em Luanda."  ')).toBe("Investir em imóveis em Luanda");
    expect(limparTitulo("**Crédito para pequenas empresas**\nExplicação que não interessa")).toBe(
      "Crédito para pequenas empresas",
    );
    expect(limparTitulo("«Gestão de activos»")).toBe("Gestão de activos");
    expect(limparTitulo("Título: Planeamento financeiro")).toBe("Planeamento financeiro");
  });

  it("recusa o que não é texto ou fica vazio", () => {
    expect(limparTitulo(undefined)).toBe("");
    expect(limparTitulo(42)).toBe("");
    expect(limparTitulo('  ""  ')).toBe("");
  });

  it("corta numa palavra inteira, até 80 letras, e tira os caracteres de controlo", () => {
    const longo = limparTitulo(`${"palavra ".repeat(30)}fim`);
    expect(longo.length).toBeLessThanOrEqual(LIMITES_DO_HISTORICO.titulo);
    expect(longo.endsWith("palavra")).toBe(true);
    expect(limparTitulo("Con\u0007versa")).toBe("Conversa");
  });
});

describe("tituloPelasPalavras", () => {
  it("usa as primeiras palavras com valor, pela ordem em que a pessoa as escreveu e sem repetir", () => {
    expect(
      tituloPelasPalavras(
        ["Olá, queria saber como investir em imóveis em Luanda", "e investir em Benguela?"],
        "Conversa nova",
      ),
    ).toBe("Investir imóveis Luanda Benguela");
  });

  it("não passa das 5 palavras e a primeira leva maiúscula", () => {
    const t = tituloPelasPalavras(
      ["seguros crédito poupança reforma investimento imobiliário empresas"],
      "Conversa nova",
    );
    expect(t.split(" ")).toHaveLength(5);
    expect(t.startsWith("S")).toBe(true);
  });

  it("sem palavras com valor devolve o texto de recurso", () => {
    expect(tituloPelasPalavras(["Olá, bom dia!", "sim"], "Conversa nova")).toBe("Conversa nova");
    expect(tituloPelasPalavras([], "Conversa nova")).toBe("Conversa nova");
  });
});

describe("mensagensParaTitulo", () => {
  it("começa na primeira mensagem da pessoa (as de abertura do assistente não contam), curtas e no máximo 6", () => {
    const r = mensagensParaTitulo([
      { de: "bot", texto: "Que bom ter a sua visita." },
      { de: "eu", texto: "Quero investir em imóveis" },
      { de: "bot", texto: "x".repeat(900) },
      ...Array.from({ length: 10 }, (_, i) => ({ de: "eu" as const, texto: `pergunta ${i}` })),
    ]);
    expect(r[0]).toEqual({ papel: "user", texto: "Quero investir em imóveis" });
    expect(r[1]?.papel).toBe("assistant");
    expect(r[1]?.texto.length).toBe(LIMITES_DO_HISTORICO.caracteresParaTitulo);
    expect(r).toHaveLength(LIMITES_DO_HISTORICO.mensagensParaTitulo);
  });

  it("sem mensagens da pessoa não há nada para titular", () => {
    expect(mensagensParaTitulo([{ de: "bot", texto: "Olá" }])).toEqual([]);
  });
});

describe("lerHistorico", () => {
  it("aceita o que está bem formado e põe a mais recente primeiro", () => {
    const lista = lerHistorico([entrada(ID_A, { atualizada: 1 }), entrada(ID_B, { atualizada: 5 })]);
    expect(lista.map((e) => e.id)).toEqual([ID_B, ID_A]);
  });

  it("descarta o que não é uma conversa válida: sem identificador certo, sem título, sem estado, repetido", () => {
    const lista = lerHistorico([
      entrada("nao-e-uuid"),
      entrada(ID_A, { titulo: "   " }),
      { ...entrada(ID_B), estado: "texto" },
      entrada(ID_C),
      entrada(ID_C, { titulo: "Repetida" }),
      null,
      "x",
    ]);
    expect(lista.map((e) => e.id)).toEqual([ID_C]);
    expect(lista[0]?.titulo).toBe("Investir em Luanda");
  });

  it("uma origem desconhecida volta a «palavras» e o que não é lista dá lista vazia", () => {
    expect(lerHistorico([{ ...entrada(ID_A), origem: "hacker" }])[0]?.origem).toBe("palavras");
    expect(lerHistorico({})).toEqual([]);
    expect(lerHistorico(null)).toEqual([]);
  });
});

describe("guardarEntrada e limites", () => {
  it("a mesma conversa é substituída, não repetida", () => {
    const l1 = guardarEntrada([], entrada(ID_A));
    const l2 = guardarEntrada(l1, entrada(ID_A, { titulo: "Outro", atualizada: 9 }));
    expect(l2).toHaveLength(1);
    expect(l2[0]?.titulo).toBe("Outro");
  });

  it("ficam só as 12 mais recentes", () => {
    let lista: EntradaDoHistorico[] = [];
    for (let i = 0; i < 15; i++) {
      const id = `${String(i).padStart(8, "0")}-e89b-42d3-a456-426614174000`;
      lista = guardarEntrada(lista, entrada(id, { atualizada: i }));
    }
    expect(lista).toHaveLength(LIMITES_DO_HISTORICO.conversas);
    expect(lista[0]?.atualizada).toBe(14);
    expect(lista[lista.length - 1]?.atualizada).toBe(3);
  });

  it("se passar do tamanho cai a mais antiga (e a mais recente nunca cai)", () => {
    const grande = (id: string, atualizada: number) =>
      entrada(id, { atualizada, estado: { texto: "x".repeat(500_000) } });
    const lista = guardarEntrada(guardarEntrada([], grande(ID_A, 1)), grande(ID_B, 2));
    expect(lista.map((e) => e.id)).toEqual([ID_B]);
  });
});

describe("os títulos", () => {
  const base = [entrada(ID_A), entrada(ID_B)];

  it("a pessoa muda o título e ele fica para sempre; um título vazio não muda nada", () => {
    const r = renomearEntrada(base, ID_A, "  Plano de reforma ");
    expect(r[0]).toMatchObject({ titulo: "Plano de reforma", origem: "pessoa" });
    expect(renomearEntrada(base, ID_A, "   ")[0]?.titulo).toBe("Investir em Luanda");
  });

  it("a IA dá o título se a pessoa ainda não o mudou; depois de mudado, a IA já não o troca", () => {
    const daIa = titularPelaIa(base, ID_B, "Crédito para empresas");
    expect(daIa[1]).toMatchObject({ titulo: "Crédito para empresas", origem: "ia" });
    const daPessoa = renomearEntrada(daIa, ID_B, "O meu título");
    expect(titularPelaIa(daPessoa, ID_B, "Outra coisa")[1]).toMatchObject({ titulo: "O meu título", origem: "pessoa" });
    expect(titularPelaIa(base, ID_A, "")[0]?.titulo).toBe("Investir em Luanda");
  });

  it("remove uma conversa", () => {
    expect(removerEntrada(base, ID_A).map((e) => e.id)).toEqual([ID_B]);
  });
});
