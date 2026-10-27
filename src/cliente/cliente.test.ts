import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { textosPadrao } from "../nucleo/conteudo";
import { lerEsquema, type EsquemaDoFormulario } from "../nucleo/formulario";
import type { PassoDoRaciocinio } from "../nucleo/pensar";
import { AvaliacaoFeita, Avaliar } from "./Avaliar";
import { BalaoDaResposta, IconeDoBotaoAEscrever } from "./BalaoDoChat";
import { Carregar } from "./Carregar";
import { FormularioDoChat } from "./FormularioDoChat";
import { HistoricoDoChat, type ItemDoHistorico } from "./HistoricoDoChat";
import { MenuDoChat } from "./MenuDoChat";
import { PassosDoRaciocinio } from "./PassosDoRaciocinio";
import { Pensar } from "./Pensar";
import { Resposta } from "./Resposta";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const T = textosPadrao;

const fontesDaPesquisa = [
  {
    titulo: "Presidente de Angola",
    url: "https://pt.wikipedia.org/wiki/Presidente_de_Angola",
    resumo: "Chefe de Estado e do Governo.",
  },
  { titulo: "João Lourenço", url: "https://www.angop.ao/joao-lourenco", resumo: "Presidente desde 2017." },
];

const passos: PassoDoRaciocinio[] = [
  { chave: "perceber", titulo: "Perceber a pergunta", descricao: "Li a mensagem.", estado: "feito" },
  { chave: "escrever", titulo: "Escrever a resposta", descricao: "A escrever a resposta…", estado: "ativo" },
];

describe("Pensar", () => {
  it("ao vivo mostra «A pensar…» e as frases dos passos, sem o botão do dropdown", () => {
    const h = html(createElement(Pensar, { passos, feito: false, segundos: 0, textos: T }));
    expect(h).toContain("A pensar…");
    expect(h).toContain("Li a mensagem.");
    expect(h).toContain("A escrever a resposta…");
    // cada passo tem a sua bola (visto azul no que está feito, círculo a pontilhado no que falta) e entre elas passa um fio ao vivo
    expect(h).toContain('class="aia-cadeia-marca" data-estado="feito"');
    expect(h).toContain('class="aia-cadeia-marca" data-estado="ativo"');
    expect(h).toContain('class="aia-cadeia-linha" data-estado="ativo"');
    // ao vivo há o chevron para esconder as frases (abertas por omissão) e o ícone do passo está sempre à vista, aberto ou escondido
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('aria-label="A pensar… Esconder o raciocínio"');
    expect(h).toContain('data-aberto="sim"');
    expect(h).toContain("aia-pensa-icone");
    // o passo que está a activo é «escrever»: o ícone é o lápis
    expect(h).toContain('data-forma="lapis"');
  });

  it("o ícone muda com o que está a fazer: cérebro ao pensar, globo ao pesquisar, lápis ao escrever", () => {
    const com = (ativo: PassoDoRaciocinio["chave"]) =>
      html(
        createElement(Pensar, {
          passos: [{ chave: ativo, titulo: "x", descricao: "y", estado: "ativo" }],
          feito: false,
          segundos: 0,
          textos: T,
        }),
      );
    expect(com("perceber")).toContain('data-forma="cerebro"');
    expect(com("pesquisar")).toContain('data-forma="globo"');
    expect(com("escrever")).toContain('data-forma="lapis"');
  });

  it("acabado é «Pensou durante N s», fechado, com a cadeia de pensamento dentro (inerte até abrir)", () => {
    const h = html(createElement(Pensar, { passos, feito: true, segundos: 7, textos: T }));
    expect(h).toContain("Pensou");
    expect(h).toContain("durante 7 s");
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('data-aberto="nao"');
    expect(h).toContain("inert");
    expect(h).toContain("Perceber a pergunta");
  });
});

describe("MenuDoChat", () => {
  const props = {
    textos: T.menu,
    ocupado: false,
    aoFechar: () => undefined,
    aoNova: () => undefined,
    aoHistorico: () => undefined,
    aoApagarTudo: () => undefined,
  };

  it("aberto mostra nova conversa, histórico e apagar todo o histórico; fechado é inerte", () => {
    const aberto = html(createElement(MenuDoChat, { ...props, aberto: true }));
    expect(aberto).toContain('role="menu"');
    expect(aberto).toContain('data-aberto="sim"');
    expect(aberto).toContain("Nova conversa");
    expect(aberto).toContain("Histórico de conversas");
    expect(aberto).toContain("Apagar todo o histórico");
    expect(aberto.match(/role="menuitem"/g)?.length).toBe(3);
    const fechado = html(createElement(MenuDoChat, { ...props, aberto: false }));
    expect(fechado).toContain('data-aberto="nao"');
    expect(fechado).toContain("inert");
  });

  it("com a IA a responder não se começa outra conversa nem se apaga o histórico (mas vê-se o histórico)", () => {
    const h = html(createElement(MenuDoChat, { ...props, aberto: true, ocupado: true }));
    expect(h.match(/disabled=""/g)?.length).toBe(2);
  });
});

describe("HistoricoDoChat", () => {
  const itens: ItemDoHistorico[] = [
    { id: "a", titulo: "Investir em Luanda", atualizada: 1_700_000_000_000, mensagens: 4 },
    { id: "b", titulo: "Crédito para empresas", atualizada: 1_700_000_100_000, mensagens: 1 },
  ];
  const props = {
    textos: T.historico,
    aberto: true,
    itens,
    atual: "a",
    ocupado: false,
    aoVoltar: () => undefined,
    aoAbrir: () => undefined,
    aoRenomear: () => undefined,
    aoApagar: () => undefined,
  };

  it("lista os títulos com as mensagens, destaca a conversa aberta e deixa mudar o título e apagar", () => {
    const h = html(createElement(HistoricoDoChat, props));
    expect(h).toContain("Histórico");
    expect(h).toContain("Investir em Luanda");
    expect(h).toContain("4 mensagens");
    expect(h).toContain("1 mensagem");
    expect(h).not.toContain("1 mensagens");
    expect(h.match(/data-atual="sim"/g)?.length).toBe(1);
    expect(h.match(/aria-label="Mudar o título"/g)?.length).toBe(2);
    expect(h.match(/aria-label="Apagar esta conversa"/g)?.length).toBe(2);
    expect(h).toContain('aria-label="Voltar à conversa"');
  });

  it("sem conversas diz que ainda não há, e fechado é inerte", () => {
    const h = html(createElement(HistoricoDoChat, { ...props, itens: [] }));
    expect(h).toContain("Ainda não há conversas no histórico.");
    expect(h).not.toContain("aia-historico-lista");
    expect(html(createElement(HistoricoDoChat, { ...props, aberto: false }))).toContain('data-aberto="nao"');
  });

  it("com a IA a responder não se abre nem se apaga uma conversa", () => {
    const h = html(createElement(HistoricoDoChat, { ...props, ocupado: true }));
    expect(h.match(/disabled=""/g)?.length).toBe(4);
  });
});

describe("Carregar", () => {
  it("são os nove quadrados do site (3×3, em cascata), escondidos dos leitores de ecrã, com o texto para eles", () => {
    const h = html(createElement(Carregar, { rotulo: "A enviar…" }));
    expect(h.match(/<i /g)?.length).toBe(9);
    expect(h).toContain('role="status"');
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain("--aia-atraso:0.8s");
    expect(h).toContain("A enviar…");
  });

  it("os botões de enviar têm o texto de enviar a decorrer nos textos padrão", () => {
    expect(T.avaliar.aEnviar).toBe("A enviar…");
    expect(T.formulario.aEnviar).toBe("A enviar…");
  });
});

describe("PassosDoRaciocinio", () => {
  const feito = (chave: PassoDoRaciocinio["chave"], estado: PassoDoRaciocinio["estado"]): PassoDoRaciocinio => ({
    chave,
    titulo: chave,
    descricao: "",
    estado,
  });
  const comPesquisa: PassoDoRaciocinio[] = [
    feito("perceber", "feito"),
    {
      chave: "pesquisar",
      titulo: "Pesquisar na web",
      descricao: "Encontrei 2 fontes úteis.",
      estado: "feito",
      consulta: "presidente Angola",
      fontes: fontesDaPesquisa,
    },
    feito("escrever", "ativo"),
  ];

  it("cada passo tem a sua marca: feito é o círculo azul com visto, a fazer o anel, por fazer o anel vazio", () => {
    const h = html(createElement(PassosDoRaciocinio, { passos: [...comPesquisa, feito("orientar", "pendente")] }));
    expect(h.match(/class="aia-cadeia-marca" data-estado="feito"/g)?.length).toBe(2);
    expect(h.match(/class="aia-cadeia-marca" data-estado="ativo"/g)?.length).toBe(1);
    expect(h.match(/class="aia-cadeia-marca" data-estado="pendente"/g)?.length).toBe(1);
    expect(h.match(/aia-cadeia-visto/g)?.length).toBe(2); // só os feitos levam visto
  });

  it("o passo da pesquisa mostra o que se procurou e as fontes numeradas com título, resumo completo e endereço", () => {
    const h = html(
      createElement(PassosDoRaciocinio, {
        passos: comPesquisa,
        modeloDaPesquisa: "https://www.google.com/search?q={q}",
      }),
    );
    expect(h).toContain("Pesquisa");
    // o termo vai entre plicas e leva ao Google com a pesquisa feita; a lupa fica ao lado da palavra «Pesquisa»
    expect(h).toContain("&#x27;presidente Angola&#x27;");
    expect(h).toContain('href="https://www.google.com/search?q=presidente%20Angola"');
    expect(h.indexOf("aia-cadeia-lupa")).toBeLessThan(h.indexOf("<strong>Pesquisa</strong>"));
    // sem modelo de pesquisa do projecto o termo é só texto (nunca uma ligação escrita no módulo)
    const semModelo = html(createElement(PassosDoRaciocinio, { passos: comPesquisa }));
    expect(semModelo).toContain("&#x27;presidente Angola&#x27;");
    expect(semModelo).not.toContain("search?q=");
    expect(h).toContain('data-fonte="1"');
    expect(h).toContain('data-fonte="2"');
    expect(h).toContain("Chefe de Estado e do Governo.");
    expect(h).toContain("pt.wikipedia.org/wiki/Presidente_de_Angola");
    expect(h).toContain("angop.ao/joao-lourenco");
    expect(h).toContain('href="https://www.angop.ao/joao-lourenco"');
    expect(h).toContain('rel="noopener noreferrer nofollow"');
  });

  it("realça a fonte que a pessoa pediu para ver", () => {
    const h = html(createElement(PassosDoRaciocinio, { passos: comPesquisa, fonteEmFoco: 2 }));
    expect(h.match(/data-foco="sim"/g)?.length).toBe(1);
    expect(h.indexOf('data-foco="sim"')).toBeGreaterThan(h.indexOf('data-fonte="2"'));
  });
});

describe("Avaliar", () => {
  const props = { textos: T, aoEnviar: async () => true };

  it("sem avaliação pergunta se a resposta ajudou, com os botões Boa e Má", () => {
    const h = html(createElement(Avaliar, { ...props, avaliacao: undefined }));
    expect(h).toContain("Esta resposta ajudou?");
    expect(h).toContain("Boa");
    expect(h).toContain("Má");
  });

  it("uma avaliação que já lá estava (de antes) mostra só o que a pessoa disse: sem agradecimento, sem alterar nem retirar", () => {
    const h = html(
      createElement(Avaliar, { ...props, avaliacao: { sentido: "boa", nota: 4, motivos: [], comentario: "" } }),
    );
    expect(h).toContain("Avaliada: Muito boa");
    expect(h).not.toContain("Obrigado pela avaliação.");
    expect(h).not.toContain("Alterar");
    expect(h).not.toContain("aia-avalia-contagem");
  });

  it("durante os 5 s para mudar de ideia há só o lápis, com os segundos que faltam à frente; depois, nada", () => {
    const base = {
      textos: T,
      avaliacao: { sentido: "boa" as const, nota: 4 as const, motivos: [], comentario: "" },
      aoAlterar: () => undefined,
    };
    const aberta = html(createElement(AvaliacaoFeita, { ...base, restantes: 5, agradecimento: "visivel" }));
    expect(aberta).toContain('aria-label="Alterar"');
    expect(aberta).toContain("5s");
    expect(aberta.indexOf("5s")).toBeLessThan(aberta.indexOf('aria-label="Alterar"'));
    expect(aberta).not.toContain("Retirar");
    const a2 = html(createElement(AvaliacaoFeita, { ...base, restantes: 2, agradecimento: "fora" }));
    expect(a2).toContain("2s");
    const fechada = html(createElement(AvaliacaoFeita, { ...base, restantes: 0, agradecimento: "fora" }));
    expect(fechada).toContain("Avaliada: Muito boa");
    expect(fechada).not.toContain('aria-label="Alterar"');
    expect(fechada).not.toContain("aia-avalia-contagem");
  });

  it("o agradecimento aparece, sai a desvanecer (data-saindo) e depois deixa de existir", () => {
    const base = {
      textos: T,
      avaliacao: { sentido: "boa" as const, nota: 5 as const, motivos: [], comentario: "" },
      restantes: 0,
      aoAlterar: () => undefined,
    };
    const visivel = html(createElement(AvaliacaoFeita, { ...base, agradecimento: "visivel" }));
    expect(visivel).toContain("Obrigado pela avaliação.");
    expect(visivel).toContain('data-saindo="nao"');
    const saindo = html(createElement(AvaliacaoFeita, { ...base, agradecimento: "saindo" }));
    expect(saindo).toContain("Obrigado pela avaliação.");
    expect(saindo).toContain('data-saindo="sim"');
    const fora = html(createElement(AvaliacaoFeita, { ...base, agradecimento: "fora" }));
    expect(fora).not.toContain("Obrigado pela avaliação.");
    expect(fora).toContain("Avaliada: Excelente");
  });
});

describe("FormularioDoChat", () => {
  const esquema = lerEsquema({
    id: "perfil",
    titulo: "Conte-nos",
    campos: [
      { id: "sector", tipo: "escolha", rotulo: "Qual é o seu sector?", opcoes: ["Comércio", "Serviços"] },
      { id: "urg", tipo: "escala", rotulo: "Quão urgente?", min: 1, max: 5 },
      { id: "sn", tipo: "sim-nao", rotulo: "Tem loja física?", obrigatorio: false },
      { id: "nome", tipo: "texto", rotulo: "O seu nome", ajuda: "Primeiro e último" },
      { id: "mail", tipo: "email", rotulo: "O seu e-mail", obrigatorio: false },
    ],
  }) as EsquemaDoFormulario;
  const aoEnviar = async () => true;

  it("desenha cada campo pelo seu tipo, com as opções e a escala", () => {
    const h = html(createElement(FormularioDoChat, { esquema, respondido: undefined, textos: T, aoEnviar }));
    expect(h).toContain("Conte-nos");
    expect(h).toContain("Comércio");
    expect(h).toContain('role="radiogroup"');
    expect(h.match(/role="radio"/g)?.length).toBe(2 + 5 + 2);
    expect(h).toContain("(opcional)");
    expect(h).toContain('type="email"');
    expect(h).toContain('placeholder="Primeiro e último"');
    expect(h).toContain("Enviar respostas");
    expect(h).toContain("A equipa vê estas respostas.");
  });

  it("depois de enviado mostra só o resumo, sem campos nem botão", () => {
    const h = html(
      createElement(FormularioDoChat, {
        esquema,
        respondido: [
          {
            campo: "sector",
            rotulo: "Qual é o seu sector?",
            tipo: "escolha",
            texto: "Comércio",
            numero: null,
            opcoes: ["Comércio"],
          },
        ],
        textos: T,
        aoEnviar,
      }),
    );
    expect(h).toContain("Respostas enviadas");
    expect(h).toContain("Comércio");
    expect(h).not.toContain("<input");
    expect(h).not.toContain("Enviar respostas");
  });
});

describe("Resposta", () => {
  const base = {
    modeloDaFonte: "Ver a fonte {n} no raciocínio: {titulo}",
    opcoes: { paginas: ["/", "/contactos"] },
    Ligacao: "a" as const,
    aoSeguir: () => undefined,
    formulario: () => createElement("div", { "data-form": "sim" }),
    fontes: undefined,
  };

  it("negrito, lista, botão 3D e ligação segura; HTML e destinos perigosos ficam só texto", () => {
    const h = html(
      createElement(Resposta, {
        ...base,
        texto:
          "Temos **duas áreas**:\n- Uma\n- Duas\n<b>x</b> [mau](javascript:alert(1)) /contactos\n[[botao: Falar com a equipa | /contactos]]",
      }),
    );
    expect(h).toContain("<strong>duas áreas</strong>");
    expect(h).toContain("<ul");
    expect(h).toContain('class="aia-botao-3d"');
    expect(h).toContain('href="/contactos"');
    expect(h).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(h).not.toContain("javascript:");
  });

  it("põe o formulário que a IA pediu no sítio onde ela o escreveu", () => {
    const json = JSON.stringify({ campos: [{ id: "a", tipo: "texto", rotulo: "Nome" }] });
    const h = html(createElement(Resposta, { ...base, texto: `Antes\n[[formulario]]${json}[[/formulario]]\nDepois` }));
    expect(h).toContain('data-form="sim"');
    expect(h.indexOf("Antes")).toBeLessThan(h.indexOf("data-form"));
    expect(h.indexOf("data-form")).toBeLessThan(h.indexOf("Depois"));
  });

  it("pode esconder os botões de uma resposta (um botão repetido), sem mexer no resto do texto", () => {
    const texto = "Podemos ajudar.\n[[botao: Falar com a equipa | /contactos]]";
    const com = html(createElement(Resposta, { ...base, texto }));
    expect(com).toContain('class="aia-botao-3d"');
    const sem = html(createElement(Resposta, { ...base, texto, semBotoes: true }));
    expect(sem).not.toContain("aia-botao-3d");
    expect(sem).toContain("Podemos ajudar.");
  });

  describe("fontes da pesquisa", () => {
    const fontes = [
      { titulo: "Presidente de Angola", url: "https://pt.wikipedia.org/wiki/Presidente_de_Angola" },
      { titulo: "João Lourenço", url: "https://www.angop.ao/joao-lourenco" },
    ];
    const texto = "O presidente é **João Lourenço** [2], eleito em 2017 [1].";

    it("não há lista de fontes por baixo da resposta: as fontes são bolas numeradas dentro do texto", () => {
      const h = html(createElement(Resposta, { ...base, texto, fontes, aoVerFonte: () => undefined }));
      expect(h).not.toContain("aia-fontes");
      expect(h).not.toContain("pt.wikipedia.org");
      expect(h.match(/class="aia-fonte-bola"/g)?.length).toBe(2);
      expect(h).toContain("aia-fonte-texto");
      expect(h).toContain("<strong>João Lourenço</strong>");
      expect(h.indexOf("João Lourenço")).toBeLessThan(h.indexOf("eleito em 2017"));
    });

    it("com o raciocínio disponível a bola é um botão que o abre (e a do texto tracejado não duplica a paragem do teclado)", () => {
      const h = html(createElement(Resposta, { ...base, texto, fontes, aoVerFonte: () => undefined }));
      expect(h).toContain('title="Ver a fonte 2 no raciocínio: João Lourenço"');
      expect(h).toContain("<button");
      expect(h).not.toContain("<a ");
      expect(h).toContain('tabindex="-1"');
    });

    it("sem raciocínio a bola leva à página da própria fonte, noutro separador", () => {
      const h = html(createElement(Resposta, { ...base, texto, fontes }));
      expect(h).toContain('href="https://www.angop.ao/joao-lourenco"');
      expect(h).toContain('target="_blank"');
      expect(h).toContain('rel="noopener noreferrer nofollow"');
    });

    it("um número que não tem fonte não se mostra, e o facto fica só a negrito", () => {
      const h = html(
        createElement(Resposta, {
          ...base,
          texto: "Foi em **1975** [5] e depois [9].",
          fontes,
          aoVerFonte: () => undefined,
        }),
      );
      expect(h).toContain("<strong>1975</strong>");
      expect(h).not.toContain("aia-fonte-bola");
      expect(h).not.toContain("aia-fonte-texto");
      const semFontes = html(createElement(Resposta, { ...base, texto: "Foi **1975** [1]." }));
      expect(semFontes).not.toContain("aia-fonte-bola");
    });
  });
});

describe("o chat fechado", () => {
  it("com o chat fechado o botão azul só leva o lápis animado (quando o assistente escreve a resposta final); nada pisca", () => {
    const h = html(createElement(IconeDoBotaoAEscrever));
    expect(h).toContain("aia-botao-forma");
    expect(h).toContain("<svg");
    expect(h).not.toContain("data-forma");
  });

  const resposta = (quem: string, ativo = true) =>
    html(
      createElement(BalaoDaResposta, {
        quem,
        texto: "Somos uma empresa de Luanda. Ajudamos investidores.",
        textos: T,
        ativo,
        id: 7,
        aoAcabar: () => undefined,
      }),
    );

  it("«I.A.» a negrito e «Resposta:» à frente do texto, que vem logo inteiro (nada escrito aos poucos); quem responde é um token", () => {
    expect(resposta("I.A.")).toContain(
      '<strong class="aia-previa-quem">I.A.</strong> Resposta: Somos uma empresa de Luanda.',
    );
    expect(resposta("Indira")).toContain('<strong class="aia-previa-quem">Indira</strong> Resposta:');
  });
});

describe("as ligações dentro do texto da resposta", () => {
  const ver = (texto: string) =>
    html(
      createElement(Resposta, {
        texto,
        fontes: undefined,
        modeloDaFonte: "Ver a fonte {n} no raciocínio: {titulo}",
        opcoes: { paginas: ["/", "/contactos", "/sobre"] },
        Ligacao: "a" as const,
        aoSeguir: () => undefined,
        formulario: () => createElement("div"),
      }),
    );

  it("uma página do site é um clicável com preenchimento (aia-ligacao-pagina) e o NOME da página, não o caminho", () => {
    const h = ver("Escreva-nos pela página /contactos ou veja [quem somos](/sobre).");
    expect(h).toContain('class="aia-ligacao-pagina"');
    expect(h).toContain(">contactos</a>");
    expect(h).toContain(">quem somos</a>");
    expect(h).not.toContain(">/contactos<");
  });

  it("um número de telefone leva o ícone do telefone no fim, dentro da própria ligação", () => {
    const h = ver("Ligue para +351 000 000 000 quando quiser.");
    expect(h).toContain('href="tel:+351000000000"');
    expect(h).toContain('data-tipo="telefone"');
    expect(h.indexOf("+351 000 000 000")).toBeLessThan(h.indexOf("aia-ligacao-icone"));
    expect(h.indexOf("aia-ligacao-icone")).toBeLessThan(h.indexOf("</a>"));
  });

  it("o ícone muda com o que a ligação abre: globo (web), vídeo, e-mail, mapa; uma página do site não leva ícone", () => {
    const web = ver("Veja [a fonte](https://exemplo.pt/artigo).");
    expect(web).toContain('target="_blank"');
    expect(web).toContain('data-tipo="web"');
    expect(web).toContain("aia-ligacao-icone");
    expect(web).not.toContain("aia-ligacao-pagina");
    expect(ver("Veja [o vídeo](https://www.youtube.com/watch?v=abc).")).toContain('data-tipo="video"');
    expect(ver("Escreva para [o e-mail](mailto:geral@exemplo.pt).")).toContain('data-tipo="email"');
    expect(ver("Fica [aqui](https://www.google.com/maps/place/Luanda).")).toContain('data-tipo="mapa"');
    const pagina = ver("Veja a página /contactos.");
    expect(pagina).toContain("aia-ligacao-pagina");
    expect(pagina).not.toContain("aia-ligacao-icone");
  });

  it("o ícone vai colado à última palavra do texto da ligação (nunca sozinho numa linha)", () => {
    const h = ver("Veja [a nossa apresentação completa](https://exemplo.pt/apresentacao.pdf).");
    expect(h).toContain('data-tipo="documento"');
    expect(h).toContain('a nossa apresentação <span class="aia-ligacao-fim">completa<svg');
  });
});

describe("as opções de um clique no fim da resposta", () => {
  const ver = (texto: string, aoEscolher?: (t: string) => void) =>
    html(
      createElement(Resposta, {
        texto,
        fontes: undefined,
        modeloDaFonte: "Ver a fonte {n} no raciocínio: {titulo}",
        opcoes: { paginas: ["/"] },
        Ligacao: "a" as const,
        aoSeguir: () => undefined,
        formulario: () => createElement("div"),
        aoEscolher,
      }),
    );
  const texto = "Ajudamos a crescer.\n[[pergunta: Quero crescer o meu negócio]]\n[[pergunta: Como funciona?]]";

  it("são bullets com a pergunta como botão clicável, uma por opção, e o código não se vê", () => {
    const h = ver(texto, () => undefined);
    expect(h).toContain('<ul class="aia-opcoes">');
    expect(h.match(/class="aia-opcao-rapida"/g)?.length).toBe(2);
    expect(h).toContain(">Quero crescer o meu negócio?</button>");
    expect(h).not.toContain("[[pergunta");
    expect(h).not.toContain("disabled");
  });

  it("sem quem as envie (uma resposta antiga, ou o assistente a responder) ficam desactivadas", () => {
    expect(ver(texto)).toContain("disabled");
  });
});
