import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resumirAvaliacoes } from "../nucleo/avaliacoes";
import { resumirPerguntas, type LinhaDeResposta } from "../nucleo/formulario";
import type { Raciocinio } from "../nucleo/pensar";
import {
  AvaliacaoLida,
  EstatisticasDasPerguntas,
  MedidasDasAvaliacoes,
  RaciocinioLido,
  RespostasLidas,
  rotuloDaAvaliacao,
} from "./leitura";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const raciocinio: Raciocinio = {
  segundos: 4,
  passos: [
    { chave: "perceber", titulo: "Perceber a pergunta", descricao: "Li a mensagem.", estado: "feito" },
    {
      chave: "pesquisar",
      titulo: "Pesquisar na web",
      descricao: "Encontrei 1 fonte útil.",
      estado: "feito",
      fontes: [{ titulo: "Angola", url: "https://pt.wikipedia.org/wiki/Angola", resumo: "País africano." }],
    },
  ],
};

describe("RaciocinioLido", () => {
  it("resume os passos e o tempo e mostra a cadeia de pensamento com as fontes", () => {
    const h = html(createElement(RaciocinioLido, { raciocinio }));
    expect(h).toContain("Raciocínio · 2 passos · 4 s");
    expect(h).toContain("Perceber a pergunta");
    expect(h).toContain("Encontrei 1 fonte útil.");
    expect(h).toContain('href="https://pt.wikipedia.org/wiki/Angola"');
    expect(h).toContain('rel="noopener noreferrer nofollow"');
    expect(h).not.toContain("<details open");
    expect(html(createElement(RaciocinioLido, { raciocinio, aberto: true }))).toContain("<details");
  });

  it("não deixa HTML passar (o que a IA escreveu é só texto)", () => {
    const mau: Raciocinio = {
      segundos: 1,
      passos: [{ chave: "perceber", titulo: "<script>alert(1)</script>", descricao: "<b>x</b>", estado: "feito" }],
    };
    const h = html(createElement(RaciocinioLido, { raciocinio: mau }));
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
  });
});

describe("AvaliacaoLida", () => {
  it("uma resposta boa mostra o nível e a nota; uma má mostra os motivos e o comentário", () => {
    const boa = html(createElement(AvaliacaoLida, { sentido: "boa", nota: 5, motivos: [], comentario: "Muito clara" }));
    expect(boa).toContain("Excelente");
    expect(boa).toContain("5/5");
    expect(boa).toContain("Muito clara");
    const ma = html(
      createElement(AvaliacaoLida, { sentido: "ma", nota: 1, motivos: ["errada", "longa"], comentario: "" }),
    );
    expect(ma).toContain("Má");
    expect(ma).toContain("Informação errada");
    expect(ma).toContain("Demasiado longa");
    expect(ma).not.toContain("blockquote");
  });

  it("os rótulos das notas", () => {
    expect(rotuloDaAvaliacao("boa", 3)).toBe("Boa");
    expect(rotuloDaAvaliacao("boa", 4)).toBe("Muito boa");
    expect(rotuloDaAvaliacao("boa", 5)).toBe("Excelente");
    expect(rotuloDaAvaliacao("ma", 1)).toBe("Má");
  });
});

describe("RespostasLidas", () => {
  it("uma pergunta e a sua resposta por linha, sem deixar passar HTML", () => {
    const h = html(
      createElement(RespostasLidas, {
        respostas: [
          {
            campo: "sector",
            rotulo: "Sector?",
            tipo: "escolha",
            texto: "Comércio",
            numero: null,
            opcoes: ["Comércio"],
          },
          {
            campo: "nome",
            rotulo: "Nome",
            tipo: "texto",
            texto: "<img src=x onerror=alert(1)>",
            numero: null,
            opcoes: [],
          },
        ],
      }),
    );
    expect(h).toContain("Sector?");
    expect(h).toContain("Comércio");
    expect(h).not.toContain("<img");
  });
});

describe("MedidasDasAvaliacoes", () => {
  const linhas = [
    {
      sentido: "boa" as const,
      nota: 5,
      motivos: [],
      comentario: "óptima",
      estado: "nova" as const,
      criado_em: new Date(),
    },
    {
      sentido: "ma" as const,
      nota: 1,
      motivos: ["errada"],
      comentario: null,
      estado: "revista" as const,
      criado_em: new Date(),
    },
  ];

  it("mostra os totais, a percentagem de boas, a nota média e os motivos", () => {
    const h = html(createElement(MedidasDasAvaliacoes, { resumo: resumirAvaliacoes(linhas) }));
    expect(h).toContain("Avaliações");
    expect(h).toContain("50 %");
    expect(h).toContain("3.0");
    expect(h).toContain("Informação errada");
    expect(h).toContain("Últimos 14 dias");
    expect(h.match(/<li title=/g)).toHaveLength(14);
  });

  it("sem avaliações não há percentagens nem motivos", () => {
    const h = html(createElement(MedidasDasAvaliacoes, { resumo: resumirAvaliacoes([]) }));
    expect(h).toContain("—");
    expect(h).toContain("Ainda ninguém disse porquê.");
  });
});

describe("EstatisticasDasPerguntas", () => {
  const l = (o: Partial<LinhaDeResposta>): LinhaDeResposta => ({
    formulario: "perfil",
    campo: "sector",
    rotulo: "Qual é o seu sector?",
    tipo: "escolha",
    texto: "Comércio",
    numero: null,
    opcoes: ["Comércio"],
    criado_em: "2026-10-21T10:00:00Z",
    ...o,
  });

  it("mostra cada pergunta com as opções (percentagens), as médias e exemplos de texto", () => {
    const h = html(
      createElement(EstatisticasDasPerguntas, {
        perguntas: resumirPerguntas([
          l({}),
          l({ texto: "Serviços", opcoes: ["Serviços"] }),
          l({ campo: "u", rotulo: "Quão urgente?", tipo: "escala", texto: "4", numero: 4, opcoes: [] }),
          l({ campo: "n", rotulo: "Nome", tipo: "texto", texto: "Ana", opcoes: [] }),
        ]),
      }),
    );
    expect(h).toContain("Qual é o seu sector?");
    expect(h).toContain("2 respostas");
    expect(h).toContain("50 %");
    expect(h).toContain("Média");
    expect(h).toContain("Ana");
  });

  it("sem respostas diz que ainda ninguém respondeu", () => {
    expect(html(createElement(EstatisticasDasPerguntas, { perguntas: [] }))).toContain("Ainda ninguém respondeu");
  });
});
