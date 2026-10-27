import { describe, expect, it } from "vitest";
import type { AvaliacaoEnviada } from "../nucleo/avaliacoes";
import type { FormularioValidado } from "../nucleo/formulario";
import { enderecoDoPedido, limitadorEmMemoria } from "./limite";
import { filtrosDeAvaliacao, type ParametrosDeLista } from "./repositorio";
import { repositorioMemoria } from "./repositorio-memoria";

const C1 = "123e4567-e89b-42d3-a456-426614174001";
const C2 = "123e4567-e89b-42d3-a456-426614174002";
const lista = (extra: Partial<ParametrosDeLista> = {}): ParametrosDeLista => ({
  q: "",
  ordem: "quando",
  direccao: "desc",
  tamanho: 10,
  desvio: 0,
  ...extra,
});
const avaliacao = (extra: Partial<AvaliacaoEnviada> = {}): AvaliacaoEnviada => ({
  conversa: C1,
  mensagem: 2,
  sentido: "boa",
  nota: 4,
  motivos: [],
  comentario: "",
  pergunta: "Que serviços oferecem?",
  resposta: "Quatro áreas.",
  raciocinio: null,
  fontes: [],
  pagina: "/",
  ...extra,
});
const formulario = (extra: Partial<FormularioValidado> = {}): FormularioValidado => ({
  conversa: C1,
  mensagem: 3,
  esquema: {
    id: "perfil",
    titulo: "Perfil",
    campos: [{ id: "sector", tipo: "escolha", rotulo: "Sector?", obrigatorio: true, opcoes: ["A", "B"] }],
  },
  respostas: [{ campo: "sector", rotulo: "Sector?", tipo: "escolha", texto: "A", numero: null, opcoes: ["A"] }],
  pagina: "/",
  ...extra,
});

describe("repositório em memória: avaliações", () => {
  it("uma avaliação por mensagem: enviar outra substitui a anterior e volta a «nova»", async () => {
    const r = repositorioMemoria();
    await r.guardarAvaliacao(avaliacao());
    const id = (await r.listarAvaliacoes(lista())).linhas[0]!.id;
    await r.marcarAvaliacao(id, "revista");
    await r.guardarAvaliacao(avaliacao({ sentido: "ma", nota: 1, motivos: ["errada"], comentario: "mudei de ideias" }));
    const { linhas, total } = await r.listarAvaliacoes(lista());
    expect(total).toBe(1);
    expect(linhas[0]).toMatchObject({ id, sentido: "ma", estado: "nova", comentario: "mudei de ideias" });
  });

  it("filtra por sentido, estado e texto, e ordena por nota", async () => {
    const r = repositorioMemoria();
    await r.guardarAvaliacao(avaliacao({ mensagem: 1, nota: 5 }));
    await r.guardarAvaliacao(avaliacao({ mensagem: 2, sentido: "ma", nota: 1, pergunta: "Qual o câmbio?" }));
    await r.guardarAvaliacao(avaliacao({ mensagem: 3, nota: 3 }));
    expect((await r.listarAvaliacoes(lista({ filtros: { sentido: "ma" } }))).total).toBe(1);
    expect((await r.listarAvaliacoes(lista({ filtros: { sentido: "boa", estado: "revista" } }))).total).toBe(0);
    expect((await r.listarAvaliacoes(lista({ q: "câmbio" }))).total).toBe(1);
    expect((await r.listarAvaliacoes(lista({ ordem: "nota", direccao: "asc" }))).linhas.map((a) => a.nota)).toEqual([
      1, 3, 5,
    ]);
    expect((await r.listarAvaliacoes(lista({ tamanho: 2, desvio: 2 }))).linhas).toHaveLength(1);
  });

  it("o resumo conta as avaliações", async () => {
    const r = repositorioMemoria();
    await r.guardarAvaliacao(avaliacao({ mensagem: 1, nota: 5 }));
    await r.guardarAvaliacao(avaliacao({ mensagem: 2, sentido: "ma", nota: 1, motivos: ["longa"] }));
    expect(await r.resumoDasAvaliacoes()).toMatchObject({
      total: 2,
      boas: 1,
      mas: 1,
      percentagemBoas: 50,
      porRever: 2,
    });
  });

  it("lerAvaliacao traz as orientações escritas a partir dela", async () => {
    const r = repositorioMemoria();
    await r.guardarAvaliacao(avaliacao());
    const id = (await r.listarAvaliacoes(lista())).linhas[0]!.id;
    await r.guardarOrientacao({
      titulo: "Serviços",
      palavras: ["serviços"],
      instrucao: "Lista sempre as quatro áreas.",
      ativa: true,
      avaliacaoId: id,
    });
    await r.guardarOrientacao({
      titulo: "Solta",
      palavras: ["x"],
      instrucao: "Uma orientação sem avaliação.",
      ativa: true,
    });
    const lida = await r.lerAvaliacao(id);
    expect(lida?.orientacoes.map((o) => o.titulo)).toEqual(["Serviços"]);
    expect(await r.lerAvaliacao("inexistente")).toBeNull();
  });
});

describe("repositório em memória: orientações", () => {
  it("cria, edita, alterna, lista as activas e apaga", async () => {
    const r = repositorioMemoria();
    const id = await r.guardarOrientacao({
      titulo: "Câmbio",
      palavras: ["câmbio"],
      instrucao: "Não dês valores.",
      ativa: true,
    });
    await r.guardarOrientacao({
      id,
      titulo: "Câmbio (v2)",
      palavras: ["câmbio", "kwanza"],
      instrucao: "Não dês valores de câmbio.",
      ativa: true,
    });
    expect((await r.listarOrientacoes())[0]).toMatchObject({ titulo: "Câmbio (v2)", palavras: ["câmbio", "kwanza"] });
    expect(await r.orientacoesAtivas()).toHaveLength(1);
    await r.alternarOrientacao(id, false);
    expect(await r.orientacoesAtivas()).toEqual([]);
    expect(await r.listarOrientacoes()).toHaveLength(1);
    await r.apagarOrientacao(id);
    expect(await r.listarOrientacoes()).toEqual([]);
    await expect(
      r.guardarOrientacao({ id: "nao-existe", titulo: "x", palavras: ["y"], instrucao: "z".repeat(12), ativa: true }),
    ).rejects.toThrow();
  });

  it("apagar a avaliação de origem não apaga a orientação", async () => {
    const r = repositorioMemoria();
    await r.guardarAvaliacao(avaliacao());
    const id = (await r.listarAvaliacoes(lista())).linhas[0]!.id;
    await r.guardarOrientacao({
      titulo: "Serviços",
      palavras: ["serviços"],
      instrucao: "Lista sempre as quatro áreas.",
      ativa: true,
      avaliacaoId: id,
    });
    await r.retirarAvaliacao(C1, 2);
    expect(await r.listarOrientacoes()).toHaveLength(1);
  });
});

describe("repositório em memória: formulários", () => {
  it("um formulário por mensagem, com as respostas por pergunta e a análise", async () => {
    const r = repositorioMemoria();
    const id = await r.guardarFormulario(formulario());
    expect(
      await r.guardarFormulario(
        formulario({
          respostas: [{ campo: "sector", rotulo: "Sector?", tipo: "escolha", texto: "B", numero: null, opcoes: ["B"] }],
        }),
      ),
    ).toBe(id);
    await r.guardarFormulario(formulario({ conversa: C2 }));
    const { linhas, total } = await r.listarFormularios(lista());
    expect(total).toBe(2);
    expect(linhas.map((f) => f.respostas[0]?.texto).sort()).toEqual(["A", "B"]);
    expect((await r.listarFormularios(lista({ q: "perfil" }))).total).toBe(2);
    expect((await r.listarFormularios(lista({ q: "zzz" }))).total).toBe(0);
    expect((await r.lerFormulario(id))?.esquema.titulo).toBe("Perfil");
    const analise = await r.respostasParaAnalise();
    expect(analise).toHaveLength(2);
    expect(analise[0]).toMatchObject({ formulario: "perfil", rotulo: "Sector?", tipo: "escolha" });
  });
});

describe("repositório em memória: conversas", () => {
  const registo = (id: string, n = 1) => ({
    id,
    pagina: "/",
    mensagens: Array.from({ length: n }, (_, i) => ({
      papel: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      texto: `mensagem ${i}`,
      fontes: [],
      raciocinio: null,
      em: null,
    })),
  });

  it("guarda mensagens, lê a conversa com as avaliações e os formulários, e respeita o limite", async () => {
    const r = repositorioMemoria();
    expect(await r.guardarMensagens(registo(C1, 2))).toBe("ok");
    expect(await r.guardarMensagens(registo(C1, 1))).toBe("ok");
    await r.guardarAvaliacao(avaliacao());
    await r.guardarFormulario(formulario());
    const lida = await r.lerConversa(C1);
    expect(lida?.conversa.mensagens).toBe(3);
    expect(lida?.conversa.primeira_pergunta).toBe("mensagem 0");
    expect(lida?.avaliacoes).toHaveLength(1);
    expect(lida?.formularios).toHaveLength(1);
    expect(await r.guardarMensagens(registo(C1, 199))).toBe("cheia");
    expect((await r.listarConversas(lista())).total).toBe(1);
    expect((await r.listarConversas(lista({ q: "mensagem 1" }))).total).toBe(1);
    expect((await r.listarConversas(lista({ q: "nada" }))).total).toBe(0);
  });

  it("apagar remove também as avaliações e os formulários, mas só os dessa conversa", async () => {
    const r = repositorioMemoria();
    await r.guardarMensagens(registo(C1));
    await r.guardarAvaliacao(avaliacao());
    await r.guardarAvaliacao(avaliacao({ conversa: C2 }));
    await r.guardarFormulario(formulario());
    expect(await r.apagarConversa(C1)).toBe(true);
    expect(await r.apagarConversa(C1)).toBe(false);
    expect((await r.listarAvaliacoes(lista())).linhas.map((a) => a.conversa)).toEqual([C2]);
    expect((await r.listarFormularios(lista())).total).toBe(0);
    expect(await r.apagarConversa("x")).toBe(false);
  });

  it("apagar uma avaliação sem conversa guardada também conta", async () => {
    const r = repositorioMemoria();
    await r.guardarAvaliacao(avaliacao());
    expect(await r.apagarConversa(C1)).toBe(true);
  });
});

describe("filtrosDeAvaliacao", () => {
  it("valores desconhecidos contam como sem filtro", () => {
    expect(filtrosDeAvaliacao(lista({ filtros: { sentido: "ma", estado: "nova" } }))).toEqual({
      sentido: "ma",
      estado: "nova",
    });
    expect(filtrosDeAvaliacao(lista({ filtros: { sentido: "x", estado: "" } }))).toEqual({
      sentido: null,
      estado: null,
    });
    expect(filtrosDeAvaliacao(lista())).toEqual({ sentido: null, estado: null });
  });
});

describe("limitador em memória", () => {
  it("deixa passar até ao limite e diz quanto esperar", async () => {
    let t = 1_000_000;
    const limitar = limitadorEmMemoria(() => t);
    const regra = { limite: 2, janelaSegundos: 60 };
    expect((await limitar("a", regra)).permitido).toBe(true);
    expect((await limitar("a", regra)).permitido).toBe(true);
    const recusa = await limitar("a", regra);
    expect(recusa).toEqual({ permitido: false, repetirEmSegundos: 60 });
    expect((await limitar("b", regra)).permitido).toBe(true);
    t += 61_000;
    expect((await limitar("a", regra)).permitido).toBe(true);
  });

  it("o endereço vem do túnel, do proxy ou fica desconhecido", () => {
    expect(enderecoDoPedido(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe(
      "1.1.1.1",
    );
    expect(enderecoDoPedido(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(enderecoDoPedido(new Headers({ "x-real-ip": "4.4.4.4" }))).toBe("4.4.4.4");
    expect(enderecoDoPedido(new Headers())).toBe("desconhecido");
  });
});
