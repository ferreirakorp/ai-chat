import { describe, expect, it } from "vitest";
import { horaDeEnvio, LIMITES_DA_CONVERSA, validarRegistoDeConversa } from "./conversas";

const ID = "3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f";
const base = { id: ID, mensagens: [{ papel: "user", texto: "Olá" }] };

describe("validarRegistoDeConversa", () => {
  it("aceita mensagens da pessoa e do assistente, com fontes https e a hora", () => {
    const r = validarRegistoDeConversa({
      id: ID.toUpperCase(),
      pagina: "/servicos#faq",
      mensagens: [
        { papel: "user", texto: "  Quais são os câmbios? ", em: 1_700_000_000_000 },
        {
          papel: "assistant",
          texto: "Segundo a pesquisa…",
          fontes: [
            { titulo: "BNA", url: "https://www.bna.ao/" },
            { titulo: "Mau", url: "javascript:alert(1)" },
            { titulo: "Sem https", url: "http://exemplo.com" },
          ],
        },
      ],
    });
    expect(r).toEqual({
      ok: true,
      registo: {
        id: ID,
        pagina: "/servicos#faq",
        mensagens: [
          { papel: "user", texto: "Quais são os câmbios?", fontes: [], raciocinio: null, em: 1_700_000_000_000 },
          {
            papel: "assistant",
            texto: "Segundo a pesquisa…",
            fontes: [{ titulo: "BNA", url: "https://www.bna.ao/" }],
            raciocinio: null,
            em: null,
          },
        ],
      },
    });
  });

  it("o raciocínio só fica nas respostas do assistente e só se for válido", () => {
    const raciocinio = {
      passos: [{ chave: "perceber", titulo: "Perceber", descricao: "Li.", estado: "feito" }],
      segundos: 2,
    };
    const r = validarRegistoDeConversa({
      id: ID,
      mensagens: [
        { papel: "user", texto: "Olá", raciocinio },
        { papel: "assistant", texto: "Bom dia", raciocinio },
        { papel: "assistant", texto: "Outra", raciocinio: { passos: [] } },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registo.mensagens.map((m) => m.raciocinio?.passos.length ?? 0)).toEqual([0, 1, 0]);
  });

  it("recusa o que não tem a forma certa", () => {
    expect(validarRegistoDeConversa(null)).toEqual({ ok: false, erro: "invalido" });
    expect(validarRegistoDeConversa({ ...base, id: "nao-e-um-uuid" })).toEqual({ ok: false, erro: "invalido" });
    expect(validarRegistoDeConversa({ id: ID, mensagens: "olá" })).toEqual({ ok: false, erro: "invalido" });
    expect(validarRegistoDeConversa({ id: ID, mensagens: [] })).toEqual({ ok: false, erro: "vazio" });
    expect(validarRegistoDeConversa({ id: ID, mensagens: [{ papel: "system", texto: "x" }] })).toEqual({
      ok: false,
      erro: "invalido",
    });
    expect(validarRegistoDeConversa({ id: ID, mensagens: [{ papel: "user", texto: "   " }] })).toEqual({
      ok: false,
      erro: "vazio",
    });
  });

  it("recusa texto e mensagens a mais", () => {
    const longa = "a".repeat(LIMITES_DA_CONVERSA.caracteresPorMensagem + 1);
    expect(validarRegistoDeConversa({ id: ID, mensagens: [{ papel: "user", texto: longa }] })).toEqual({
      ok: false,
      erro: "tamanho",
    });
    const muitas = Array.from({ length: LIMITES_DA_CONVERSA.porEnvio + 1 }, () => ({ papel: "user", texto: "x" }));
    expect(validarRegistoDeConversa({ id: ID, mensagens: muitas })).toEqual({ ok: false, erro: "tamanho" });
  });

  it("a página tem de ser um caminho do site", () => {
    expect(validarRegistoDeConversa({ ...base, pagina: "https://mau.exemplo" })).toMatchObject({
      registo: { pagina: "/" },
    });
    expect(validarRegistoDeConversa({ ...base, pagina: "/blog<script>" })).toMatchObject({ registo: { pagina: "/" } });
  });
});

describe("horaDeEnvio", () => {
  const agora = 1_800_000_000_000;
  it("usa a hora do navegador se for do último dia e não do futuro; senão, agora", () => {
    expect(horaDeEnvio(agora - 5_000, agora).getTime()).toBe(agora - 5_000);
    expect(horaDeEnvio(null, agora).getTime()).toBe(agora);
    expect(horaDeEnvio(agora - 3 * 24 * 60 * 60 * 1000, agora).getTime()).toBe(agora);
    expect(horaDeEnvio(agora + 10 * 60 * 1000, agora).getTime()).toBe(agora);
  });
});
