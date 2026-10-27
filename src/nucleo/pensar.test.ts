import { describe, expect, it } from "vitest";
import { textosPadrao } from "./conteudo";
import {
  aplicarEventoAoRaciocinio,
  concluirRaciocinio,
  estadoDoFio,
  formaDoRaciocinio,
  frasesDoRaciocinio,
  raciocinioInicial,
  rotuloDoPensar,
  validarRaciocinio,
  type ChaveDePasso,
  type PassoDoRaciocinio,
} from "./pensar";

const T = textosPadrao;
const chaves = (p: readonly PassoDoRaciocinio[]) => p.map((x) => `${x.chave}:${x.estado}`);
const fonte = { titulo: "Angola", url: "https://pt.wikipedia.org/wiki/Angola", resumo: "País." };

describe("o ícone do que o assistente está a fazer", () => {
  it("o globo ao pesquisar na web, o lápis ao escrever, o cérebro nos outros passos", () => {
    const passo = (chave: ChaveDePasso, estado: "feito" | "ativo" | "pendente") => ({
      chave,
      titulo: chave,
      descricao: "",
      estado,
    });
    expect(formaDoRaciocinio([passo("perceber", "ativo")])).toBe("cerebro");
    expect(formaDoRaciocinio([passo("perceber", "feito"), passo("decidir", "ativo")])).toBe("cerebro");
    expect(
      formaDoRaciocinio([passo("perceber", "feito"), passo("pesquisar", "ativo"), passo("escrever", "pendente")]),
    ).toBe("globo");
    expect(
      formaDoRaciocinio([passo("perceber", "feito"), passo("pesquisar", "feito"), passo("escrever", "ativo")]),
    ).toBe("lapis");
    expect(formaDoRaciocinio([passo("orientar", "ativo")])).toBe("cerebro");
    expect(formaDoRaciocinio([])).toBe("cerebro");
  });
});

describe("o raciocínio ao vivo", () => {
  it("começa a perceber a pergunta", () => {
    const p = raciocinioInicial(T, "/servicos");
    expect(chaves(p)).toEqual(["perceber:ativo"]);
    expect(p[0]?.descricao).toContain("/servicos");
  });

  it("uma pesquisa: decide, pesquisa (a activo), escrever fica por fazer, depois as fontes e o texto", () => {
    let p = raciocinioInicial(T, "/");
    p = aplicarEventoAoRaciocinio(p, { pesquisa: "presidente de Angola" }, T);
    expect(chaves(p)).toEqual(["perceber:feito", "decidir:feito", "pesquisar:ativo", "escrever:pendente"]);
    expect(p[1]?.descricao).toContain("presidente de Angola");

    p = aplicarEventoAoRaciocinio(p, { fontes: [fonte] }, T);
    expect(chaves(p)).toEqual(["perceber:feito", "decidir:feito", "pesquisar:feito", "escrever:ativo"]);
    expect(p[2]?.fontes).toEqual([fonte]);
    expect(p[2]?.descricao).toBe(T.pensar.passos.pesquisarUma);
    // o que se procurou fica no passo (a descrição passa a dizer o que se encontrou), para o raciocínio mostrar a pesquisa completa
    expect(p[2]?.consulta).toBe("presidente de Angola");

    p = aplicarEventoAoRaciocinio(p, { orientacoes: 2 }, T);
    expect(chaves(p)).toEqual([
      "perceber:feito",
      "decidir:feito",
      "pesquisar:feito",
      "orientar:feito",
      "escrever:ativo",
    ]);
    expect(p[3]?.descricao).toContain("2");

    p = aplicarEventoAoRaciocinio(p, { t: "Olá" }, T);
    expect(chaves(p).at(-1)).toBe("escrever:ativo");
  });

  it("sem pesquisa, e a pesquisa sem fontes úteis", () => {
    const sem = aplicarEventoAoRaciocinio(raciocinioInicial(T, "/"), { semPesquisa: "nao" }, T);
    expect(chaves(sem)).toEqual(["perceber:feito", "decidir:feito", "escrever:ativo"]);
    expect(sem[1]?.descricao).toBe(T.pensar.passos.decidirNao);
    expect(aplicarEventoAoRaciocinio(raciocinioInicial(T, "/"), { semPesquisa: "equipa" }, T)[1]?.descricao).toBe(
      T.pensar.passos.decidirEquipa,
    );

    let p = aplicarEventoAoRaciocinio(raciocinioInicial(T, "/"), { pesquisa: "câmbio" }, T);
    p = aplicarEventoAoRaciocinio(p, { fontes: [] }, T);
    expect(p.find((x) => x.chave === "pesquisar")).toMatchObject({
      estado: "feito",
      descricao: T.pensar.passos.pesquisarNada,
    });
    expect(p.find((x) => x.chave === "pesquisar")?.fontes).toBeUndefined();
  });

  it("zero orientações não acrescenta nada, e o primeiro pedaço de texto activa o escrever sem eventos antes", () => {
    const base = raciocinioInicial(T, "/");
    expect(aplicarEventoAoRaciocinio(base, { orientacoes: 0 }, T)).toEqual(base);
    expect(chaves(aplicarEventoAoRaciocinio(base, { t: "x" }, T))).toEqual(["perceber:feito", "escrever:ativo"]);
  });

  it("não muda o original", () => {
    const base = raciocinioInicial(T, "/");
    const antes = JSON.stringify(base);
    aplicarEventoAoRaciocinio(base, { pesquisa: "x y" }, T);
    expect(JSON.stringify(base)).toBe(antes);
  });

  it("as frases ao vivo são as descrições", () => {
    const p = aplicarEventoAoRaciocinio(raciocinioInicial(T, "/"), { semPesquisa: "nao" }, T);
    expect(frasesDoRaciocinio(p)).toHaveLength(3);
    expect(frasesDoRaciocinio([{ chave: "perceber", titulo: "T", descricao: "", estado: "feito" }])).toEqual(["T"]);
  });
});

describe("concluirRaciocinio", () => {
  it("todos os passos ficam feitos, pela ordem certa, com o escrever no fim", () => {
    let p = raciocinioInicial(T, "/");
    p = aplicarEventoAoRaciocinio(p, { pesquisa: "câmbio" }, T);
    p = aplicarEventoAoRaciocinio(p, { fontes: [fonte] }, T);
    p = aplicarEventoAoRaciocinio(p, { orientacoes: 1 }, T);
    const fim = concluirRaciocinio(p, T);
    expect(chaves(fim)).toEqual([
      "perceber:feito",
      "decidir:feito",
      "pesquisar:feito",
      "orientar:feito",
      "escrever:feito",
    ]);
    expect(fim.at(-1)?.descricao).toBe(T.pensar.passos.escreverFeita);
  });

  it("uma pesquisa que nunca disse o que trouxe não fica «a procurar…»", () => {
    const p = aplicarEventoAoRaciocinio(raciocinioInicial(T, "/"), { pesquisa: "câmbio" }, T);
    const fim = concluirRaciocinio(p, T);
    expect(fim.find((x) => x.chave === "pesquisar")?.descricao).toBe(T.pensar.passos.pesquisarNada);
  });

  it("no recuo (respostas prontas) o último passo é o das respostas da equipa", () => {
    const fim = concluirRaciocinio(raciocinioInicial(T, "/"), T, { prontas: true });
    expect(chaves(fim)).toEqual(["perceber:feito", "prontas:feito"]);
    expect(fim.some((x) => x.chave === "escrever")).toBe(false);
  });
});

describe("rotuloDoPensar", () => {
  it("«Pensou» e «durante N s», com um mínimo de 1 s", () => {
    expect(rotuloDoPensar(T, 3.4)).toEqual({ verbo: "Pensou", resto: "durante 3 s" });
    expect(rotuloDoPensar(T, 0)).toEqual({ verbo: "Pensou", resto: "durante 1 s" });
  });
});

describe("validarRaciocinio", () => {
  const bom = {
    passos: [
      { chave: "perceber", titulo: "Perceber", descricao: "Li a mensagem.", estado: "feito" },
      {
        chave: "pesquisar",
        titulo: "Pesquisar",
        descricao: "1 fonte.",
        estado: "feito",
        fontes: [fonte, { titulo: "x", url: "http://mau" }],
      },
    ],
    segundos: 3.6,
  };

  it("aceita o que está bem formado e limpa as fontes", () => {
    const r = validarRaciocinio(bom);
    expect(r?.segundos).toBe(4);
    expect(r?.passos).toHaveLength(2);
    expect(r?.passos[1]?.fontes).toEqual([fonte]);
  });

  it("guarda a consulta só no passo da pesquisa, cortada e limpa", () => {
    const r = validarRaciocinio({
      passos: [
        { chave: "perceber", titulo: "Perceber", descricao: "x", estado: "feito", consulta: "isto não é daqui" },
        {
          chave: "pesquisar",
          titulo: "Pesquisar",
          descricao: "x",
          estado: "feito",
          consulta: "  presidente   Angola ",
        },
      ],
      segundos: 1,
    });
    expect(r?.passos[0]?.consulta).toBeUndefined();
    expect(r?.passos[1]?.consulta).toBe("presidente Angola");
  });

  it("descarta passos desconhecidos e recusa o que não tem nenhum passo válido", () => {
    expect(validarRaciocinio({ passos: [{ chave: "hackear", titulo: "x" }], segundos: 1 })).toBeNull();
    expect(validarRaciocinio({ passos: [], segundos: 1 })).toBeNull();
    expect(validarRaciocinio(null)).toBeNull();
    expect(validarRaciocinio("x")).toBeNull();
    const r = validarRaciocinio({ passos: [{ chave: "hackear", titulo: "x" }, bom.passos[0]], segundos: 1 });
    expect(r?.passos).toHaveLength(1);
  });

  it("corta os tamanhos e limita os segundos e os passos", () => {
    const longo = validarRaciocinio({
      passos: Array.from({ length: 20 }, () => ({
        chave: "perceber",
        titulo: "t".repeat(500),
        descricao: "d".repeat(900),
      })),
      segundos: 99999,
    });
    expect(longo?.passos).toHaveLength(14);
    expect(longo?.passos[0]?.titulo).toHaveLength(80);
    expect(longo?.passos[0]?.descricao).toHaveLength(280);
    expect(longo?.segundos).toBe(600);
    expect(validarRaciocinio({ passos: [bom.passos[0]], segundos: -5 })?.segundos).toBe(0);
  });
});

describe("o fio entre as bolas dos passos", () => {
  const passo = (estado: "feito" | "ativo" | "pendente") => ({ estado });
  it("azul cheio até onde já se chegou, a correr até ao passo que se está a fazer e a pontilhado depois", () => {
    const passos = [passo("feito"), passo("feito"), passo("ativo"), passo("pendente")];
    expect(estadoDoFio(passos, 0)).toBe("feito");
    expect(estadoDoFio(passos, 1)).toBe("ativo");
    expect(estadoDoFio(passos, 2)).toBe("pendente");
  });
  it("quando tudo está feito, todos os fios ficam azuis", () => {
    const passos = [passo("feito"), passo("feito"), passo("feito")];
    expect(estadoDoFio(passos, 0)).toBe("feito");
    expect(estadoDoFio(passos, 1)).toBe("feito");
  });
});

describe("os passos de ferramentas do projecto (acao)", () => {
  const textos = textosPadrao;
  it("cada passo fica a decorrer e o anterior acaba; o escrever fica pendente", () => {
    let passos = raciocinioInicial(textos, "/");
    passos = aplicarEventoAoRaciocinio(passos, { passo: { titulo: "A ver o quarto" } }, textos);
    passos = aplicarEventoAoRaciocinio(passos, { passo: { titulo: "A preparar a reserva", icone: "lapis" } }, textos);
    const acoes = passos.filter((p) => p.chave === "acao");
    expect(acoes.map((p) => [p.titulo, p.estado])).toEqual([
      ["A ver o quarto", "feito"],
      ["A preparar a reserva", "ativo"],
    ]);
    expect(passos.find((p) => p.chave === "perceber")?.estado).toBe("feito");
    expect(passos.at(-1)).toMatchObject({ chave: "escrever", estado: "pendente" });
    expect(formaDoRaciocinio(passos)).toBe("lapis");
  });

  it("um passo com fontes já vem feito e leva-as; sem ícone o cérebro", () => {
    const fontes = [{ titulo: "Um", url: "https://exemplo.pt/um", resumo: "" }];
    const passos = aplicarEventoAoRaciocinio(
      raciocinioInicial(textos, "/"),
      { passo: { titulo: "A pesquisar", consulta: "hotel", fontes } },
      textos,
    );
    expect(passos.find((p) => p.chave === "acao")).toMatchObject({ estado: "feito", consulta: "hotel", fontes });
    expect(formaDoRaciocinio([{ chave: "acao", titulo: "x", descricao: "x", estado: "ativo" }])).toBe("cerebro");
  });

  it("guarda-se e lê-se de volta (o ícone e a consulta passam, o resto limpa-se)", () => {
    const lido = validarRaciocinio({
      segundos: 3,
      passos: [
        { chave: "acao", titulo: "A ver", descricao: "Li.", estado: "feito", icone: "globo", consulta: "quarto" },
      ],
    });
    expect(lido?.passos[0]).toMatchObject({ chave: "acao", icone: "globo", consulta: "quarto" });
    expect(
      validarRaciocinio({ passos: [{ chave: "acao", titulo: "A", icone: "estrela" }] })?.passos[0]?.icone,
    ).toBeUndefined();
  });
});

describe("o progresso de um passo de ferramenta", () => {
  const textos = textosPadrao;
  it("o mesmo passo a decorrer actualiza-se (ganha as fontes) em vez de se repetir", () => {
    const fontes = [{ titulo: "Um", url: "https://exemplo.pt/um", resumo: "" }];
    let passos = raciocinioInicial(textos, "/");
    passos = aplicarEventoAoRaciocinio(
      passos,
      { passo: { titulo: "A pesquisar", consulta: "hotel", icone: "globo" } },
      textos,
    );
    passos = aplicarEventoAoRaciocinio(passos, { passo: { titulo: "A pesquisar", fontes } }, textos);
    const acoes = passos.filter((p) => p.chave === "acao");
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({ estado: "feito", consulta: "hotel", icone: "globo", fontes });
  });
});
