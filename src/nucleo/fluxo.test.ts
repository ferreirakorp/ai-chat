import { describe, expect, it } from "vitest";
import { juntarTextos, perfilPadrao, preencher, textosPadrao } from "./conteudo";
import { lerEventoDoFluxo, lerFontesPesquisadas, urlHttpsValido } from "./fluxo";

describe("lerEventoDoFluxo", () => {
  it("lê cada tipo de evento", () => {
    expect(lerEventoDoFluxo('{"t":"Olá"}')).toEqual({ t: "Olá" });
    expect(lerEventoDoFluxo('{"fim":true}')).toEqual({ fim: true });
    expect(lerEventoDoFluxo('{"erro":"cortado"}')).toEqual({ erro: "cortado" });
    expect(lerEventoDoFluxo('{"pesquisa":"  presidente   de Angola "}')).toEqual({ pesquisa: "presidente de Angola" });
    expect(lerEventoDoFluxo('{"semPesquisa":"equipa"}')).toEqual({ semPesquisa: "equipa" });
    expect(lerEventoDoFluxo('{"orientacoes":2}')).toEqual({ orientacoes: 2 });
  });

  it("as fontes só ficam com https, título e domínio, e levam o resumo", () => {
    const e = lerEventoDoFluxo(
      JSON.stringify({
        fontes: [
          { titulo: "Angola", url: "https://pt.wikipedia.org/wiki/Angola", resumo: "País <b>africano</b>" },
          { titulo: "Mau", url: "http://exemplo.com/x", resumo: "x" },
          { titulo: "", url: "https://exemplo.com/", resumo: "x" },
          { titulo: "Local", url: "https://localhost/x", resumo: "x" },
          { titulo: "Sem resumo", url: "https://exemplo.com/a" },
        ],
      }),
    );
    expect(e).toEqual({
      fontes: [
        { titulo: "Angola", url: "https://pt.wikipedia.org/wiki/Angola", resumo: "País <b>africano</b>" },
        { titulo: "Sem resumo", url: "https://exemplo.com/a", resumo: "" },
      ],
    });
  });

  it("uma lista de fontes vazia continua a ser um evento (a pesquisa não trouxe nada)", () => {
    expect(lerEventoDoFluxo('{"fontes":[]}')).toEqual({ fontes: [] });
  });

  it("recusa o que não é um evento conhecido e bem formado", () => {
    for (const mau of [
      "",
      "   ",
      "não é json",
      "[]",
      "null",
      '{"semPesquisa":"outro"}',
      '{"orientacoes":-1}',
      '{"orientacoes":99}',
      '{"x":1}',
    ]) {
      expect(lerEventoDoFluxo(mau), mau).toBeNull();
    }
  });
});

describe("urlHttpsValido e lerFontesPesquisadas", () => {
  it("só https com domínio e sem espaços", () => {
    expect(urlHttpsValido("https://exemplo.com/a b")).toBeNull();
    expect(urlHttpsValido("javascript:alert(1)")).toBeNull();
    expect(urlHttpsValido("https://exemplo.com/a")).toBe("https://exemplo.com/a");
    expect(urlHttpsValido(42)).toBeNull();
  });

  it("corta ao máximo de fontes", () => {
    const lista = Array.from({ length: 10 }, (_, i) => ({ titulo: `F${i}`, url: `https://exemplo.com/${i}` }));
    expect(lerFontesPesquisadas(lista)).toHaveLength(6);
    expect(lerFontesPesquisadas(lista, 2)).toHaveLength(2);
    expect(lerFontesPesquisadas("x")).toEqual([]);
  });
});

describe("os textos", () => {
  it("preencher troca {nome} e deixa o que não conhece", () => {
    expect(preencher("durante {s} s", { s: 3 })).toBe("durante 3 s");
    expect(preencher("olá {quem}", {})).toBe("olá {quem}");
  });

  it("juntarTextos põe os textos do projecto por cima, em qualquer profundidade", () => {
    const t = juntarTextos(textosPadrao, {
      pensar: { aPensar: "Thinking…", passos: { perceberTitulo: "Understand" } },
    });
    expect(t.pensar.aPensar).toBe("Thinking…");
    expect(t.pensar.passos.perceberTitulo).toBe("Understand");
    expect(t.pensar.passos.decidirTitulo).toBe(textosPadrao.pensar.passos.decidirTitulo);
    expect(t.avaliar.pergunta).toBe(textosPadrao.avaliar.pergunta);
    expect(juntarTextos(textosPadrao, undefined)).toBe(textosPadrao);
  });

  it("o perfil por omissão não leva nada de um negócio", () => {
    const p = perfilPadrao("Acme");
    expect(p.nomeEmpresa).toBe("Acme");
    expect(JSON.stringify(p)).not.toMatch(/Angola|Luanda|financ/i);
  });
});

describe("um passo genérico do assistente", () => {
  it("lê o título, a descrição, o ícone e as fontes de uma ferramenta, e recusa o que não tem título", () => {
    expect(
      lerEventoDoFluxo(
        JSON.stringify({ passo: { titulo: "A ver o quarto", descricao: "Li a ficha.", icone: "globo", extra: 1 } }),
      ),
    ).toEqual({ passo: { titulo: "A ver o quarto", descricao: "Li a ficha.", icone: "globo" } });
    expect(lerEventoDoFluxo(JSON.stringify({ passo: { titulo: "x", icone: "estrela" } }))).toEqual({
      passo: { titulo: "x" },
    });
    expect(lerEventoDoFluxo(JSON.stringify({ passo: { titulo: "  " } }))).toBeNull();
    expect(lerEventoDoFluxo(JSON.stringify({ passo: "x" }))).toBeNull();
  });
});
