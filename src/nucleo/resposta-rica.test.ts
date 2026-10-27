import { describe, expect, it } from "vitest";
import {
  analisarLinha as lerLinha,
  contarCartoesNoTexto,
  analisarResposta as lerResposta,
  destinoSeguro as lerDestino,
  separarFrases,
  nomeDaPagina,
  textoSimples as lerTextoSimples,
  type OpcoesDaResposta,
} from "./resposta-rica";

// as páginas de um site de exemplo: o módulo não sabe quais são, é o projecto que as diz
const SITE: OpcoesDaResposta = {
  paginas: ["/", "/sobre", "/servicos", "/contactos", "/blog", "/privacidade", "/cookies", "/mapa-do-site"],
};
const destinoSeguro = (bruto: string) => lerDestino(bruto, SITE);
const analisarLinha = (linha: string) => lerLinha(linha, SITE);
const analisarResposta = (texto: string) => lerResposta(texto, SITE);
const textoSimples = (texto: string) => lerTextoSimples(texto, SITE);

describe("as páginas do site vêm do projecto", () => {
  it("sem páginas só a raiz é uma página do site", () => {
    expect(lerDestino("/")).toEqual({ href: "/", interna: true });
    expect(lerDestino("/contactos")).toBeNull();
    expect(lerDestino("/loja", { paginas: ["/", "/loja"] })).toEqual({ href: "/loja", interna: true });
  });

  it("as páginas soltas no texto só viram ligações se forem do projecto", () => {
    const loja = { paginas: ["/", "/loja"] };
    expect(lerLinha("Veja /loja e /sobre.", loja).filter((p) => p.t === "ligacao")).toEqual([
      { t: "ligacao", texto: "/loja", href: "/loja", interna: true },
    ]);
  });
});

describe("o formulário no meio da resposta", () => {
  const json = JSON.stringify({
    id: "perfil",
    titulo: "Conte-nos",
    campos: [{ id: "sector", tipo: "escolha", rotulo: "Qual é o seu sector?", opcoes: ["Comércio", "Serviços"] }],
  });

  it("vira um bloco no sítio onde a IA o pôs", () => {
    const blocos = analisarResposta(`Antes\n[[formulario]]\n${json}\n[[/formulario]]\nDepois`);
    expect(blocos.map((b) => b.t)).toEqual(["paragrafo", "formulario", "paragrafo"]);
    expect(blocos[1]).toMatchObject({ t: "formulario", esquema: { id: "perfil", titulo: "Conte-nos" } });
  });

  it("enquanto o fecho não chega não se mostra nada do formulário", () => {
    expect(analisarResposta(`Antes\n[[formulario]]\n{"id":"pe`).map((b) => b.t)).toEqual(["paragrafo"]);
  });

  it("um formulário inválido desaparece e o texto fica", () => {
    expect(analisarResposta("Antes\n[[formulario]]\n{isto não é json}\n[[/formulario]]").map((b) => b.t)).toEqual([
      "paragrafo",
    ]);
  });

  it("textoSimples ignora o formulário", () => {
    expect(textoSimples(`Olá\n[[formulario]]${json}[[/formulario]]`)).toBe("Olá");
  });
});

describe("destinoSeguro", () => {
  it("aceita páginas do site, https, telefones e e-mails", () => {
    expect(destinoSeguro("/contactos")).toEqual({ href: "/contactos", interna: true });
    expect(destinoSeguro("/servicos#etiquetas")).toEqual({ href: "/servicos#etiquetas", interna: true });
    expect(destinoSeguro("https://www.bna.ao/taxas")).toEqual({ href: "https://www.bna.ao/taxas", interna: false });
    expect(destinoSeguro("tel:+351 000 000 000")).toEqual({ href: "tel:+351000000000", interna: false });
    expect(destinoSeguro("mailto:geral@exemplo.pt")).toEqual({
      href: "mailto:geral@exemplo.pt",
      interna: false,
    });
  });

  it("recusa o que não é seguro ou não existe", () => {
    for (const mau of [
      "javascript:alert(1)",
      "data:text/html;base64,AAAA",
      "http://exemplo.com",
      "//exemplo.com",
      "/admin",
      "/precos",
      "/contactos/../admin",
      "https://localhost/x",
      "https://",
      "tel:abc",
      "mailto:sem-arroba",
      "",
    ]) {
      expect(destinoSeguro(mau), mau).toBeNull();
    }
  });
});

describe("analisarLinha", () => {
  it("lê negrito, código e ligações", () => {
    expect(analisarLinha("Veja **este termo**, o `ficheiro.ts` e [a equipa](/contactos).")).toEqual([
      { t: "texto", texto: "Veja " },
      { t: "negrito", texto: "este termo" },
      { t: "texto", texto: ", o " },
      { t: "codigo", texto: "ficheiro.ts" },
      { t: "texto", texto: " e " },
      { t: "ligacao", texto: "a equipa", href: "/contactos", interna: true },
      { t: "texto", texto: "." },
    ]);
  });

  it("torna clicáveis telefones, e-mails, páginas do site e endereços https soltos (sem a pontuação final)", () => {
    const pedacos = analisarLinha(
      "Ligue +351 000 000 000, escreva a geral@exemplo.pt, veja /sobre ou https://www.bna.ao/taxas.",
    );
    expect(pedacos.filter((p) => p.t === "ligacao")).toEqual([
      { t: "ligacao", texto: "+351 000 000 000", href: "tel:+351000000000", interna: false },
      {
        t: "ligacao",
        texto: "geral@exemplo.pt",
        href: "mailto:geral@exemplo.pt",
        interna: false,
      },
      { t: "ligacao", texto: "/sobre", href: "/sobre", interna: true },
      { t: "ligacao", texto: "https://www.bna.ao/taxas", href: "https://www.bna.ao/taxas", interna: false },
    ]);
    expect(pedacos[pedacos.length - 1]).toEqual({ t: "texto", texto: "." });
  });

  it("as citações [1] da pesquisa viram citações (e [1](/sobre) continua a ser uma ligação)", () => {
    expect(analisarLinha("Segundo a pesquisa [1] e [2].")).toEqual([
      { t: "texto", texto: "Segundo a pesquisa " },
      { t: "citacao", texto: "1", indice: 1 },
      { t: "texto", texto: " e " },
      { t: "citacao", texto: "2", indice: 2 },
      { t: "texto", texto: "." },
    ]);
    expect(analisarLinha("[1](/sobre)")).toEqual([{ t: "ligacao", texto: "1", href: "/sobre", interna: true }]);
  });

  it("um negrito seguido de uma citação é um facto da pesquisa (com ou sem espaço); um negrito sozinho continua negrito", () => {
    expect(analisarLinha("O presidente é **João Lourenço** [1], eleito em 2017.")).toEqual([
      { t: "texto", texto: "O presidente é " },
      { t: "fonte", texto: "João Lourenço", indice: 1 },
      { t: "texto", texto: ", eleito em 2017." },
    ]);
    expect(analisarLinha("**Luanda**[2] e **Benguela**")).toEqual([
      { t: "fonte", texto: "Luanda", indice: 2 },
      { t: "texto", texto: " e " },
      { t: "negrito", texto: "Benguela" },
    ]);
    // duas citações seguidas: a primeira junta-se ao negrito, a segunda fica como bola
    expect(analisarLinha("**Angola** [1][2]")).toEqual([
      { t: "fonte", texto: "Angola", indice: 1 },
      { t: "citacao", texto: "2", indice: 2 },
    ]);
    // texto no meio entre o negrito e a citação: não se juntam
    expect(analisarLinha("**Angola** fica em África [1]")).toEqual([
      { t: "negrito", texto: "Angola" },
      { t: "texto", texto: " fica em África " },
      { t: "citacao", texto: "1", indice: 1 },
    ]);
  });

  it("o texto simples não leva os números das citações", () => {
    expect(textoSimples("Segundo a pesquisa [1], **Luanda** [2] é a capital.")).toBe(
      "Segundo a pesquisa, Luanda é a capital.",
    );
  });

  it("uma ligação com destino que não é seguro fica só com o texto", () => {
    const pedacos = analisarLinha("[clique](javascript:alert(1))");
    expect(pedacos.some((p) => p.t === "ligacao")).toBe(false);
    expect(pedacos.map((p) => p.texto).join("")).toContain("clique");
  });

  it("um negrito ainda por fechar (a resposta está a chegar) fica a negrito até ao fim", () => {
    expect(analisarLinha("Isto é **muito impor")).toEqual([
      { t: "texto", texto: "Isto é " },
      { t: "negrito", texto: "muito impor" },
    ]);
  });
});

describe("analisarResposta", () => {
  it("separa parágrafos, listas, títulos e o botão de acção", () => {
    const blocos = analisarResposta(
      [
        "Olá! **Bem-vindo**.",
        "Segunda linha do mesmo parágrafo.",
        "",
        "Oferecemos:",
        "- Private Investment Advisory",
        "- Gestão **Patrimonial**",
        "",
        "## Próximo passo",
        "1. Fale connosco",
        "2) Marque uma conversa",
        "",
        "Qual é o seu sector?",
        "[[botao: Falar com a equipa | /contactos]]",
      ].join("\n"),
    );
    // cada frase (até ao ponto final) é o seu parágrafo: «Olá!», «**Bem-vindo**.» e «Segunda linha…» são três; «Oferecemos:» é o quarto
    expect(blocos.map((b) => b.t)).toEqual([
      "paragrafo",
      "paragrafo",
      "paragrafo",
      "paragrafo",
      "lista",
      "paragrafo",
      "lista",
      "paragrafo",
      "botao",
    ]);
    expect((blocos[0] as { linhas: unknown[] }).linhas).toHaveLength(1);
    expect(blocos[4]).toMatchObject({ t: "lista", ordenada: false });
    expect((blocos[4] as { itens: unknown[] }).itens).toHaveLength(2);
    expect(blocos[5]).toEqual({ t: "paragrafo", linhas: [[{ t: "negrito", texto: "Próximo passo" }]] });
    expect(blocos[6]).toMatchObject({ t: "lista", ordenada: true });
    expect(blocos[8]).toEqual({ t: "botao", rotulo: "Falar com a equipa", href: "/contactos", interna: true });
  });

  it("um botão com destino inseguro desaparece e um botão ainda por fechar não se mostra", () => {
    expect(analisarResposta("[[botao: Clique | javascript:alert(1)]]")).toEqual([]);
    expect(analisarResposta("Antes\n[[botao: Falar com a eq")).toEqual([
      { t: "paragrafo", linhas: [[{ t: "texto", texto: "Antes" }]] },
    ]);
  });

  it("não deixa HTML passar: fica texto", () => {
    const blocos = analisarResposta("<script>alert(1)</script> e <b>negrito</b>");
    expect(blocos).toHaveLength(1);
    expect(textoSimples("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });

  it("o nome de uma página do site lê-se sem a barra, o # e os traços", () => {
    expect(nomeDaPagina("/contactos")).toBe("contactos");
    expect(nomeDaPagina("/mapa-do-site#topo")).toBe("mapa do site");
    expect(nomeDaPagina("a nossa equipa")).toBe("a nossa equipa");
    expect(nomeDaPagina("/")).toBe("/");
    // no texto simples (leitores de ecrã, a prévia do balão) também se lê o nome
    expect(textoSimples("Escreva-nos pela página /contactos.")).toBe("Escreva-nos pela página contactos.");
  });

  it("as linhas «[[pergunta: …]]» juntam-se num bloco de opções (no máximo duas), mesmo coladas ao texto, e não vão para o texto simples", () => {
    const blocos = analisarResposta(
      "Ajudamos a crescer. [[pergunta: Quero crescer o meu negócio]]\n[[pergunta: Como funciona o acompanhamento?]]\n[[pergunta: Esta fica de fora]]",
    );
    expect(blocos.map((b) => b.t)).toEqual(["paragrafo", "perguntas"]);
    expect(blocos[1]).toEqual({
      t: "perguntas",
      // uma opção é uma pergunta: ganha o «?» que lhe falta
      opcoes: ["Quero crescer o meu negócio?", "Como funciona o acompanhamento?"],
    });
    expect(textoSimples("Ajudamos a crescer. [[pergunta: Quero crescer]]")).toBe("Ajudamos a crescer.");
    // ainda a chegar: não se vê o código à vista
    expect(analisarResposta("Olá. [[perg").map((b) => b.t)).toEqual(["paragrafo"]);
    expect(analisarResposta("Olá.\n[[pergunta: Quero cresc").map((b) => b.t)).toEqual(["paragrafo"]);
  });

  it("textoSimples tira a formatação", () => {
    expect(textoSimples("**Olá**! Veja:\n- um\n- dois\n[[botao: Ir | /sobre]]")).toBe("Olá! Veja: um; dois Ir");
  });
});

describe("uma frase por parágrafo", () => {
  it("parte o texto corrido em cada ponto final (e ! e ?) seguido de maiúscula", () => {
    expect(
      separarFrases("Somos uma empresa de Luanda. Ajudamos empresas! Qual é o seu sector? Fale connosco."),
    ).toEqual(["Somos uma empresa de Luanda.", "Ajudamos empresas!", "Qual é o seu sector?", "Fale connosco."]);
  });

  it("não parte abreviaturas, iniciais, siglas com pontos, números nem o que está em minúscula a seguir", () => {
    expect(separarFrases("Fale com o Sr. Silva. Ele ajuda.")).toEqual(["Fale com o Sr. Silva.", "Ele ajuda."]);
    expect(separarFrases("A Acme Bicicletas, Lda. Todos os direitos reservados.")).toEqual([
      "A Acme Bicicletas, Lda. Todos os direitos reservados.",
    ]);
    expect(separarFrases("O presidente é J. Lourenço desde 2017.")).toEqual(["O presidente é J. Lourenço desde 2017."]);
    expect(separarFrases("A taxa é de 3.5 por cento e vale em Luanda.")).toEqual([
      "A taxa é de 3.5 por cento e vale em Luanda.",
    ]);
    expect(separarFrases("Foi em 2008. Depois cresceu.")).toEqual(["Foi em 2008.", "Depois cresceu."]);
    expect(separarFrases("Veja o site e.g. a página inicial.")).toEqual(["Veja o site e.g. a página inicial."]);
  });

  it("não parte dentro de um negrito, de um código ou do texto de uma ligação", () => {
    expect(separarFrases("**Ponto um. Ponto dois** e mais. Fim.")).toEqual([
      "**Ponto um. Ponto dois** e mais.",
      "Fim.",
    ]);
    expect(separarFrases("Use `a. B` hoje. Pronto.")).toEqual(["Use `a. B` hoje.", "Pronto."]);
    expect(separarFrases("Veja [a equipa. Aqui](/contactos). Obrigado.")).toEqual([
      "Veja [a equipa. Aqui](/contactos).",
      "Obrigado.",
    ]);
  });

  it("a resposta fica com um parágrafo por frase, e as listas e os botões não se mexem", () => {
    const blocos = lerResposta(
      "Temos duas áreas. Qual prefere?\n- Uma. Boa.\n- Duas.\n[[botao: Contactos | /contactos]]",
      SITE,
    );
    expect(blocos.map((b) => b.t)).toEqual(["paragrafo", "paragrafo", "lista", "botao"]);
    const lista = blocos[2];
    expect(lista?.t === "lista" && lista.itens).toHaveLength(2);
  });

  it("uma frase ainda a chegar (sem ponto) fica no último parágrafo", () => {
    const blocos = lerResposta("Somos de Luanda. Ajudamos empr", SITE);
    expect(blocos).toHaveLength(2);
    expect(textoSimples("Somos de Luanda. Ajudamos empr")).toBe("Somos de Luanda. Ajudamos empr");
  });
});

describe("o botão nunca fica à vista como código", () => {
  it("um botão a seguir a uma frase, no mesmo parágrafo, vira botão", () => {
    const blocos = lerResposta("Qual é o seu sector? [[botao: Falar com a equipa | /contactos]]", SITE);
    expect(blocos.map((b) => b.t)).toEqual(["paragrafo", "botao"]);
    expect(textoSimples("Qual é o seu sector? [[botao: Falar com a equipa | /contactos]]")).toBe(
      "Qual é o seu sector? Falar com a equipa",
    );
  });

  it("um botão com pontuação à volta, num item de lista ou entre frases, também", () => {
    expect(lerResposta("Fale connosco. [[botao: Contactos | /contactos]].", SITE).map((b) => b.t)).toEqual([
      "paragrafo",
      "botao",
      "paragrafo",
    ]);
    const dentro = lerResposta("- Um [[botao: Contactos | /contactos]]\n- Dois", SITE);
    expect(textoSimples("- Um [[botao: Contactos | /contactos]]\n- Dois")).not.toContain("[[");
    expect(dentro.some((b) => b.t === "botao")).toBe(true);
  });

  it("um botão com destino que não é seguro desaparece (não fica o código à vista) e um por fechar não se mostra", () => {
    expect(lerResposta("Olá [[botao: Mau | javascript:alert(1)]] fim", SITE).some((b) => b.t === "botao")).toBe(false);
    expect(textoSimples("Olá [[botao: Mau | javascript:alert(1)]] fim")).not.toContain("[[");
    const aChegar = lerResposta("Qual é o seu sector? [[botao: Falar com", SITE);
    expect(aChegar.map((b) => b.t)).toEqual(["paragrafo"]);
    expect(textoSimples("Qual é o seu sector? [[botao: Falar com")).toBe("Qual é o seu sector?");
  });
});

describe("as páginas em ramo e os cartões no meio do texto", () => {
  const opcoes = { paginas: ["/", "/quartos", "/ofertas/*"] };
  it("«/ofertas/*» abre todo o ramo (mas não a própria raiz do ramo nem outras páginas)", () => {
    expect(lerDestino("/ofertas/quarto-deluxe", opcoes)).toEqual({ href: "/ofertas/quarto-deluxe", interna: true });
    expect(lerDestino("/ofertas/quarto-deluxe?noites=2", opcoes)?.interna).toBe(true);
    expect(lerDestino("/ofertas/", opcoes)).toBeNull();
    expect(lerDestino("/outra", opcoes)).toBeNull();
    expect(lerDestino("/quartos", opcoes)?.interna).toBe(true);
  });
  it("uma linha «[[cartao]]» vira um bloco no sítio onde está; conta-se; não é texto", () => {
    const texto = "Veja o quarto:\n[[cartao]]\nGosta?\n[[cartao]]";
    const blocos = lerResposta(texto, opcoes);
    expect(blocos.map((b) => b.t)).toEqual(["paragrafo", "cartao", "paragrafo", "cartao"]);
    expect(contarCartoesNoTexto(texto, opcoes)).toBe(2);
    expect(lerTextoSimples(texto, opcoes)).toBe("Veja o quarto: Gosta?");
    // no meio de uma linha também ganha a sua linha
    expect(contarCartoesNoTexto("Aqui [[cartao]] fica", opcoes)).toBe(1);
    // ainda a chegar: não se mostra
    expect(contarCartoesNoTexto("Aqui [[cart", opcoes)).toBe(0);
  });
});

describe("marcas que o chat não conhece", () => {
  it("uma linha só de «[[marca]]» desconhecida não aparece na resposta (nem como texto simples)", () => {
    const texto =
      "A reserva está pronta.\n[[prosseguir: Entrar e pagar]]\n[[voltar: Voltar]]\n[[pergunta: Ver fotografias]]";
    const blocos = lerResposta(texto, { paginas: ["/"] });
    expect(blocos.map((b) => b.t)).toEqual(["paragrafo", "perguntas"]);
    expect(lerTextoSimples(texto, { paginas: ["/"] })).toBe("A reserva está pronta.");
    // no meio de uma linha, a marca ganha a sua linha e some também
    expect(lerTextoSimples("Pronto [[prosseguir: Pagar]] ok", { paginas: ["/"] })).not.toContain("[[");
  });
});
