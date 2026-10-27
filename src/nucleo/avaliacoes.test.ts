import { describe, expect, it } from "vitest";
import { resumirAvaliacoes, validarAvaliacao, validarRetirada, type LinhaParaResumo } from "./avaliacoes";

const conversa = "123e4567-e89b-42d3-a456-426614174000";
const base = {
  conversa,
  mensagem: 4,
  sentido: "boa",
  nota: 4,
  pergunta: "Que serviços oferecem?",
  resposta: "Trabalhamos em quatro áreas.",
  comentario: "  Muito clara. ",
  pagina: "/servicos",
};
const raciocinio = {
  passos: [{ chave: "perceber", titulo: "Perceber", descricao: "Li.", estado: "feito" }],
  segundos: 2,
};

describe("validarAvaliacao", () => {
  it("uma resposta boa leva a nota de 3 a 5 e limpa o comentário", () => {
    const r = validarAvaliacao({
      ...base,
      motivos: ["errada"],
      raciocinio,
      fontes: [{ titulo: "A", url: "https://a.pt/x" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avaliacao).toMatchObject({ sentido: "boa", nota: 4, comentario: "Muito clara.", pagina: "/servicos" });
    // numa resposta boa os motivos de má não contam
    expect(r.avaliacao.motivos).toEqual([]);
    expect(r.avaliacao.raciocinio?.passos).toHaveLength(1);
    expect(r.avaliacao.fontes).toHaveLength(1);
  });

  it("uma resposta má vale 1 e guarda só os motivos conhecidos, sem repetidos", () => {
    const r = validarAvaliacao({
      ...base,
      sentido: "ma",
      nota: 1,
      motivos: ["errada", "errada", "inventado", "longa"],
    });
    expect(r.ok && r.avaliacao.motivos).toEqual(["errada", "longa"]);
    expect(validarAvaliacao({ ...base, sentido: "ma", nota: 1 }).ok).toBe(true);
  });

  it("recusa notas que não batem com o sentido", () => {
    expect(validarAvaliacao({ ...base, sentido: "boa", nota: 1 }).ok).toBe(false);
    expect(validarAvaliacao({ ...base, sentido: "boa", nota: 2 }).ok).toBe(false);
    expect(validarAvaliacao({ ...base, sentido: "boa", nota: 6 }).ok).toBe(false);
    expect(validarAvaliacao({ ...base, sentido: "ma", nota: 4 }).ok).toBe(false);
    expect(validarAvaliacao({ ...base, sentido: "talvez" }).ok).toBe(false);
  });

  it("recusa a forma errada", () => {
    for (const mau of [
      null,
      "x",
      { ...base, conversa: "123" },
      { ...base, mensagem: 0 },
      { ...base, mensagem: 1.5 },
      { ...base, pergunta: "" },
      { ...base, resposta: "  " },
    ]) {
      expect(validarAvaliacao(mau).ok, JSON.stringify(mau)).toBe(false);
    }
  });

  it("recusa texto a mais em vez de o cortar", () => {
    expect(validarAvaliacao({ ...base, comentario: "x".repeat(501) })).toEqual({ ok: false, erro: "tamanho" });
    expect(validarAvaliacao({ ...base, pergunta: "x".repeat(1501) })).toEqual({ ok: false, erro: "tamanho" });
    expect(validarAvaliacao({ ...base, resposta: "x".repeat(4001) })).toEqual({ ok: false, erro: "tamanho" });
  });

  it("a página tem de ser do site e o raciocínio inválido fica de fora", () => {
    const r = validarAvaliacao({ ...base, pagina: "https://mau.com", raciocinio: { passos: [] } });
    expect(r.ok && r.avaliacao.pagina).toBe("/");
    expect(r.ok && r.avaliacao.raciocinio).toBeNull();
  });
});

describe("validarRetirada", () => {
  it("precisa da conversa e da mensagem", () => {
    expect(validarRetirada({ conversa: conversa.toUpperCase(), mensagem: 3 })).toEqual({ conversa, mensagem: 3 });
    expect(validarRetirada({ conversa: "x", mensagem: 3 })).toBeNull();
    expect(validarRetirada({ conversa, mensagem: 0 })).toBeNull();
    expect(validarRetirada(null)).toBeNull();
  });
});

describe("resumirAvaliacoes", () => {
  const agora = new Date("2026-10-21T12:00:00Z");
  const linha = (o: Partial<LinhaParaResumo>): LinhaParaResumo => ({
    sentido: "boa",
    nota: 5,
    motivos: [],
    comentario: null,
    estado: "nova",
    criado_em: "2026-10-21T08:00:00Z",
    ...o,
  });

  it("sem avaliações não há percentagens nem médias", () => {
    const r = resumirAvaliacoes([], agora);
    expect(r).toMatchObject({ total: 0, percentagemBoas: null, notaMedia: null, porRever: 0, comComentario: 0 });
    expect(r.ultimosDias).toHaveLength(14);
    expect(r.ultimosDias.at(-1)?.dia).toBe("2026-10-21");
  });

  it("conta boas e más, a média, a distribuição, os motivos e os comentários", () => {
    const r = resumirAvaliacoes(
      [
        linha({ nota: 5 }),
        linha({ nota: 4, comentario: "óptima", estado: "revista" }),
        linha({ sentido: "ma", nota: 1, motivos: ["errada", "longa"], criado_em: "2026-10-20T09:00:00Z" }),
        linha({ sentido: "ma", nota: 1, motivos: ["errada"], comentario: "  " }),
      ],
      agora,
    );
    expect(r).toMatchObject({
      total: 4,
      boas: 2,
      mas: 2,
      percentagemBoas: 50,
      notaMedia: 2.8,
      comComentario: 1,
      porRever: 3,
    });
    expect(r.porNota).toEqual({ 1: 2, 2: 0, 3: 0, 4: 1, 5: 1 });
    expect(r.motivos).toEqual([
      { motivo: "errada", total: 2 },
      { motivo: "longa", total: 1 },
    ]);
    expect(r.ultimosDias.at(-1)).toEqual({ dia: "2026-10-21", boas: 2, mas: 1 });
    expect(r.ultimosDias.at(-2)).toEqual({ dia: "2026-10-20", boas: 0, mas: 1 });
  });

  it("ignora motivos desconhecidos e dias fora da janela", () => {
    const r = resumirAvaliacoes(
      [linha({ sentido: "ma", nota: 1, motivos: ["estranho"], criado_em: "2020-01-01T00:00:00Z" })],
      agora,
    );
    expect(r.motivos).toEqual([]);
    expect(r.ultimosDias.every((d) => d.boas === 0 && d.mas === 0)).toBe(true);
  });
});
