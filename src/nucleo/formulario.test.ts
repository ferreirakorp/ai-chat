import { describe, expect, it } from "vitest";
import {
  lerEsquema,
  resumirPerguntas,
  respostasEmTexto,
  respostasParaCsv,
  separarFormulario,
  textoSemFormulario,
  validarFormularioEnviado,
  validarRespostas,
  type EsquemaDoFormulario,
  type LinhaDeResposta,
} from "./formulario";

const esquemaBruto = {
  id: "Perfil-Empresa",
  titulo: "  Conte-nos sobre a sua empresa ",
  campos: [
    {
      id: "sector",
      tipo: "escolha",
      rotulo: "Qual é o seu sector?",
      opcoes: ["Comércio", "Serviços", "Comércio", "Indústria"],
    },
    {
      id: "objectivo",
      tipo: "multipla",
      rotulo: "O que procura?",
      opcoes: ["Crescer", "Proteger", "Diversificar"],
      obrigatorio: false,
    },
    { id: "urgente", tipo: "sim-nao", rotulo: "É urgente?" },
    { id: "urgencia", tipo: "escala", rotulo: "De 1 a 5, quanto?", min: 1, max: 5 },
    { id: "lojas", tipo: "numero", rotulo: "Quantas lojas tem?", min: 0, max: 5000 },
    { id: "nome", tipo: "texto", rotulo: "O seu nome", ajuda: "Primeiro e último" },
  ],
};
const esquema = lerEsquema(esquemaBruto) as EsquemaDoFormulario;
const conversa = "123e4567-e89b-42d3-a456-426614174000";

describe("lerEsquema", () => {
  it("aceita um formulário bem formado e limpa-o", () => {
    expect(esquema.id).toBe("perfil-empresa");
    expect(esquema.titulo).toBe("Conte-nos sobre a sua empresa");
    expect(esquema.campos).toHaveLength(6);
    expect(esquema.campos[0]?.opcoes).toEqual(["Comércio", "Serviços", "Indústria"]);
    expect(esquema.campos[0]?.obrigatorio).toBe(true);
    expect(esquema.campos[1]?.obrigatorio).toBe(false);
    expect(esquema.campos[3]).toMatchObject({ min: 1, max: 5 });
    expect(esquema.campos[5]?.ajuda).toBe("Primeiro e último");
  });

  it("descarta os campos que não servem e recusa um formulário sem campos válidos", () => {
    const r = lerEsquema({
      campos: [
        { id: "a b", tipo: "texto", rotulo: "id inválido" },
        { id: "x", tipo: "inventado", rotulo: "tipo desconhecido" },
        { id: "y", tipo: "escolha", rotulo: "poucas opções", opcoes: ["só uma"] },
        { id: "z", tipo: "escala", rotulo: "escala larga", min: 1, max: 50 },
        { id: "ok", tipo: "texto", rotulo: "Este serve" },
        { id: "ok", tipo: "texto", rotulo: "repetido" },
      ],
    });
    expect(r?.campos.map((c) => c.id)).toEqual(["ok"]);
    expect(r?.id).toBe("formulario");
    expect(lerEsquema({ campos: [] })).toBeNull();
    expect(lerEsquema({ campos: "x" })).toBeNull();
    expect(lerEsquema(null)).toBeNull();
  });

  it("limita os campos, as opções e os tamanhos", () => {
    const muitos = lerEsquema({
      campos: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        tipo: "escolha",
        rotulo: "r".repeat(400),
        opcoes: Array.from({ length: 20 }, (_, j) => `opção ${j}`),
      })),
    });
    expect(muitos?.campos).toHaveLength(6);
    expect(muitos?.campos[0]?.rotulo).toHaveLength(160);
    expect(muitos?.campos[0]?.opcoes).toHaveLength(8);
  });
});

describe("separarFormulario", () => {
  const json = JSON.stringify(esquemaBruto);

  it("separa o texto antes, o formulário e o texto depois", () => {
    const s = separarFormulario(`Olá!\n[[formulario]]\n${json}\n[[/formulario]]\nObrigado.`);
    expect(s.antes).toBe("Olá!\n");
    expect(s.esquema?.id).toBe("perfil-empresa");
    expect(s.depois).toBe("\nObrigado.");
    expect(s.emCurso).toBe(false);
  });

  it("aceita o JSON dentro de uma cerca de código e variações da marca", () => {
    const s = separarFormulario("[[ Formulário ]]\n```json\n" + json + "\n```\n[[ / formulario ]]");
    expect(s.esquema?.campos).toHaveLength(6);
  });

  it("enquanto não fecha está em curso e não mostra nada; sem formulário o texto fica igual", () => {
    expect(separarFormulario(`Olá\n[[formulario]]\n{"id":"pe`)).toEqual({
      antes: "Olá\n",
      esquema: null,
      depois: "",
      emCurso: true,
    });
    expect(separarFormulario("só texto")).toEqual({ antes: "só texto", esquema: null, depois: "", emCurso: false });
  });

  it("um JSON mau ou grande demais desaparece, e só o primeiro formulário conta", () => {
    expect(separarFormulario("a[[formulario]]{mau}[[/formulario]]b")).toEqual({
      antes: "a",
      esquema: null,
      depois: "b",
      emCurso: false,
    });
    expect(separarFormulario(`a[[formulario]]${"x".repeat(5000)}[[/formulario]]b`).esquema).toBeNull();
    const dois = separarFormulario(`a[[formulario]]${json}[[/formulario]]b[[formulario]]${json}[[/formulario]]c`);
    expect(dois.depois).toBe("b");
  });

  it("textoSemFormulario junta o antes e o depois", () => {
    expect(textoSemFormulario(`Olá [[formulario]]${json}[[/formulario]] fim`)).toBe("Olá  fim");
  });
});

describe("validarRespostas", () => {
  const boas = {
    sector: "Comércio",
    objectivo: ["Crescer", "Proteger"],
    urgente: true,
    urgencia: 4,
    lojas: 12,
    nome: "  Ana   Silva ",
  };

  it("valida cada campo pelo seu tipo e devolve uma linha por pergunta", () => {
    const r = validarRespostas(esquema, boas);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.respostas).toHaveLength(6);
    expect(r.respostas[0]).toEqual({
      campo: "sector",
      rotulo: "Qual é o seu sector?",
      tipo: "escolha",
      texto: "Comércio",
      numero: null,
      opcoes: ["Comércio"],
    });
    expect(r.respostas[1]).toMatchObject({ texto: "Crescer; Proteger", opcoes: ["Crescer", "Proteger"] });
    expect(r.respostas[2]).toMatchObject({ texto: "Sim", numero: 1, opcoes: ["Sim"] });
    expect(r.respostas[3]).toMatchObject({ texto: "4", numero: 4 });
    expect(r.respostas[5]?.texto).toBe("Ana Silva");
    expect(r.respostas[4]).toMatchObject({ texto: "12", numero: 12 });
  });

  it("os campos facultativos podem faltar; os obrigatórios não", () => {
    const semFacultativos: Record<string, unknown> = { ...boas };
    delete semFacultativos.objectivo;
    expect(validarRespostas(esquema, semFacultativos).ok).toBe(true);
    const semSector: Record<string, unknown> = { ...boas };
    delete semSector.sector;
    expect(validarRespostas(esquema, semSector)).toEqual({ ok: false, erro: { campo: "sector", erro: "obrigatorio" } });
    expect(validarRespostas(esquema, { ...boas, nome: "   " })).toEqual({
      ok: false,
      erro: { campo: "nome", erro: "obrigatorio" },
    });
  });

  it("recusa valores fora do tipo, das opções ou dos limites", () => {
    const mau = (campo: string, valor: unknown) => validarRespostas(esquema, { ...boas, [campo]: valor });
    expect(mau("sector", "Outro")).toEqual({ ok: false, erro: { campo: "sector", erro: "invalido" } });
    expect(mau("sector", 3).ok).toBe(false);
    expect(mau("objectivo", ["Crescer", "Voar"]).ok).toBe(false);
    expect(mau("objectivo", "Crescer").ok).toBe(false);
    expect(mau("urgente", "sim").ok).toBe(false);
    expect(mau("urgencia", 6).ok).toBe(false);
    expect(mau("urgencia", 2.5).ok).toBe(false);
    expect(mau("lojas", -1).ok).toBe(false);
    expect(mau("lojas", Number.NaN).ok).toBe(false);
    expect(mau("nome", "x".repeat(301)).ok).toBe(false);
    expect(validarRespostas(esquema, null).ok).toBe(false);
    expect(validarRespostas(esquema, []).ok).toBe(false);
  });

  it("valida telefones e e-mails", () => {
    const e = lerEsquema({
      campos: [
        { id: "tel", tipo: "telefone", rotulo: "Telefone", obrigatorio: false },
        { id: "email", tipo: "email", rotulo: "E-mail", obrigatorio: false },
      ],
    }) as EsquemaDoFormulario;
    expect(validarRespostas(e, { tel: "+351 000 000 000" }).ok).toBe(true);
    expect(validarRespostas(e, { tel: "abc" }).ok).toBe(false);
    expect(validarRespostas(e, { email: "ana@exemplo.com" }).ok).toBe(true);
    expect(validarRespostas(e, { email: "não-é-email" }).ok).toBe(false);
    // sem nenhuma resposta não há nada a guardar
    expect(validarRespostas(e, {})).toEqual({ ok: false, erro: { campo: "", erro: "obrigatorio" } });
  });

  it("as respostas em texto, para a conversa", () => {
    const r = validarRespostas(esquema, boas);
    expect(r.ok && respostasEmTexto(r.respostas).split("\n")[0]).toBe("Qual é o seu sector? Comércio");
  });
});

describe("validarFormularioEnviado", () => {
  it("junta a conversa, a mensagem, o esquema e as respostas", () => {
    const r = validarFormularioEnviado({
      conversa: conversa.toUpperCase(),
      mensagem: 5,
      esquema: esquemaBruto,
      respostas: { sector: "Serviços", urgente: false, urgencia: 3, lojas: 1, nome: "Ana" },
      pagina: "/contactos",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formulario).toMatchObject({ conversa, mensagem: 5, pagina: "/contactos" });
    expect(r.formulario.respostas).toHaveLength(5);
  });

  it("recusa conversa, mensagem, esquema ou respostas inválidos", () => {
    const ok = {
      conversa,
      mensagem: 5,
      esquema: esquemaBruto,
      respostas: { sector: "Serviços", urgente: false, urgencia: 3, lojas: 1, nome: "Ana" },
    };
    expect(validarFormularioEnviado({ ...ok, conversa: "x" })).toEqual({ ok: false, erro: "invalido" });
    expect(validarFormularioEnviado({ ...ok, mensagem: 0 })).toEqual({ ok: false, erro: "invalido" });
    expect(validarFormularioEnviado({ ...ok, esquema: { campos: [] } })).toEqual({ ok: false, erro: "invalido" });
    expect(validarFormularioEnviado({ ...ok, respostas: { sector: "Serviços" } })).toEqual({
      ok: false,
      erro: "obrigatorio",
    });
    expect(validarFormularioEnviado(null)).toEqual({ ok: false, erro: "invalido" });
  });
});

describe("as medidas e a exportação", () => {
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

  it("agrupa a mesma pergunta de formulários diferentes e conta as opções", () => {
    const r = resumirPerguntas([
      l({}),
      l({ texto: "Serviços", opcoes: ["Serviços"] }),
      l({ formulario: "outro", rotulo: "QUAL É O SEU SECTOR", texto: "Comércio" }),
      l({ campo: "urgencia", rotulo: "Quanto?", tipo: "escala", texto: "4", numero: 4, opcoes: [] }),
      l({ campo: "urgencia", rotulo: "Quanto?", tipo: "escala", texto: "2", numero: 2, opcoes: [] }),
      l({ campo: "nome", rotulo: "Nome", tipo: "texto", texto: "Ana", opcoes: [], criado_em: "2026-10-21T11:00:00Z" }),
    ]);
    const sector = r.find((x) => x.tipo === "escolha");
    expect(sector).toMatchObject({ respostas: 3 });
    expect(sector?.opcoes).toEqual([
      { opcao: "Comércio", total: 2, percentagem: 67 },
      { opcao: "Serviços", total: 1, percentagem: 33 },
    ]);
    expect(r.find((x) => x.tipo === "escala")).toMatchObject({ respostas: 2, media: 3, minimo: 2, maximo: 4 });
    expect(r.find((x) => x.tipo === "texto")?.exemplos).toEqual(["Ana"]);
    expect(r[0]?.respostas).toBe(3);
  });

  it("o CSV protege aspas, vírgulas e fórmulas de folhas de cálculo", () => {
    const csv = respostasParaCsv([
      l({ texto: '=CMD("x"), "ola"', opcoes: [] }),
      l({ rotulo: "Com, vírgula", texto: "normal", numero: 3 }),
    ]);
    const linhas = csv.split("\r\n");
    expect(linhas[0]).toBe('"data","formulario","pergunta","tipo","resposta","numero","opcoes"');
    expect(linhas[1]).toContain(`"'=CMD(""x""), ""ola"""`);
    expect(linhas[2]).toContain('"Com, vírgula"');
    expect(linhas[2]).toContain('"3"');
    expect(linhas).toHaveLength(3);
  });
});
