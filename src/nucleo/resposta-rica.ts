// O texto das respostas do assistente (da IA e das respostas prontas da equipa): um markdown pequeno e seguro — negrito, listas, `código`,
// ligações, um botão de acção, opções de um clique e um formulário —, lido para blocos que o chat desenha com elementos do React (nunca HTML solto). Módulo PURO.
import { separarFormulario, textoSemFormulario, type EsquemaDoFormulario } from "./formulario";

/** Um pedaço de texto dentro de uma linha. */
export type Inline =
  | { t: "texto"; texto: string }
  | { t: "negrito"; texto: string }
  | { t: "codigo"; texto: string }
  /** Uma citação de uma fonte da pesquisa na web: «[1]» (`indice` é o número da fonte, a partir de 1). */
  | { t: "citacao"; texto: string; indice: number }
  /** Um facto que veio da pesquisa: o negrito com a citação logo a seguir («**João Lourenço** [1]»). */
  | { t: "fonte"; texto: string; indice: number }
  | { t: "ligacao"; texto: string; href: string; interna: boolean };

export type Bloco =
  | { t: "paragrafo"; linhas: Inline[][] }
  | { t: "lista"; ordenada: boolean; itens: Inline[][] }
  | { t: "botao"; rotulo: string; href: string; interna: boolean }
  /** As opções para continuar a conversa com UM clique (cada uma é uma mensagem que o visitante envia): no máximo duas, em bullets. */
  | { t: "perguntas"; opcoes: string[] }
  | { t: "formulario"; esquema: EsquemaDoFormulario }
  /** O sítio do texto onde o projecto desenha um dos cartões da resposta (a IA escreve «[[cartao]]» numa linha; o primeiro é o primeiro cartão). */
  | { t: "cartao" };

export type Destino = { href: string; interna: boolean };

/**
 * O que um projecto diz à leitura: as páginas do seu site para onde uma resposta pode levar (com uma âncora opcional). Uma entrada
 * que acaba em «/*» abre todo o ramo («/ofertas/*» deixa ligar a «/ofertas/quarto-deluxe»).
 */
export type OpcoesDaResposta = { paginas: readonly string[] };

const ehRamo = (pagina: string): boolean => pagina.endsWith("/*");
/** O caminho é uma das páginas do projecto, ou está dentro de um ramo («/ofertas/*»)? */
function paginaPermitida(caminho: string, paginas: readonly string[]): boolean {
  return paginas.some((p) =>
    ehRamo(p) ? caminho.startsWith(p.slice(0, -1)) && caminho.length > p.length - 1 : p === caminho,
  );
}

const SO_A_RAIZ: OpcoesDaResposta = { paginas: ["/"] };

/**
 * Só se segue o que é seguro: uma página do site (das `paginas` do projecto), um endereço https, um telefone ou um e-mail. Tudo o
 * resto (javascript:, data:, http simples, páginas que não existem) é recusado — a IA pode enganar-se e o texto de uma pesquisa na
 * web nunca manda no que se abre.
 */
export function destinoSeguro(bruto: string, opcoes: OpcoesDaResposta = SO_A_RAIZ): Destino | null {
  const href = bruto.trim();
  if (href.startsWith("/")) {
    const [caminho] = href.split(/[#?]/);
    const resto = href.slice((caminho ?? "").length);
    const ok = paginaPermitida(caminho ?? "", opcoes.paginas) && /^([#?][A-Za-z0-9\-_=&.%/]*)?$/.test(resto);
    return ok ? { href, interna: true } : null;
  }
  if (/^https:\/\/[^\s<>"'`]+$/i.test(href)) {
    try {
      const url = new URL(href);
      return url.hostname.includes(".") ? { href: url.href, interna: false } : null;
    } catch {
      return null;
    }
  }
  if (/^tel:\+?\d[\d\s-]{6,20}$/i.test(href)) return { href: href.replace(/\s/g, ""), interna: false };
  if (/^mailto:[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i.test(href)) return { href, interna: false };
  return null;
}

/** O nome legível de uma página do site: «/contactos» → «contactos»; «/mapa-do-site#x» → «mapa do site». Um texto que não é um caminho fica como está. */
export function nomeDaPagina(texto: string): string {
  const limpo = texto.trim();
  if (!limpo.startsWith("/")) return limpo;
  const caminho = limpo.split(/[#?]/)[0] ?? "";
  const nome = caminho.replace(/^\/+|\/+$/g, "").replace(/[-_/]+/g, " ");
  return nome || limpo;
}

const escaparParaRegex = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MARCAS_POR_PAGINAS = new Map<string, RegExp>();

/**
 * negrito, `código`, [texto](endereço), em texto solto telefones, e-mails, páginas do site (as do projecto) e endereços https, e as
 * citações [1] da pesquisa. A expressão depende das páginas do projecto, por isso gera-se uma vez para cada lista de páginas.
 */
function marcasDe(paginas: readonly string[]): RegExp {
  const chave = paginas.join("|");
  const guardada = MARCAS_POR_PAGINAS.get(chave);
  if (guardada) return guardada;
  const nomes = paginas
    .filter((p) => p.length > 1 && p.startsWith("/") && !ehRamo(p))
    .map((p) => escaparParaRegex(p.slice(1)))
    .sort((a, b) => b.length - a.length);
  const paginasDoSite = nomes.length > 0 ? `|(?<![\\w/])\\/(?:${nomes.join("|")})(?:#[\\w-]+)?` : "";
  const marcas = new RegExp(
    `\\*\\*(.+?)(?:\\*\\*|$)|\`([^\`]+)\`?|\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)|(\\+\\d{1,3}[\\d\\s]{8,14}\\d|[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+${paginasDoSite}|https:\\/\\/[^\\s<>()\\]]+)|\\[(\\d{1,2})\\](?!\\()`,
    "g",
  );
  MARCAS_POR_PAGINAS.set(chave, marcas);
  return marcas;
}

/** Tira a pontuação que fica colada ao fim de um endereço escrito no meio de uma frase. */
function semPontuacaoFinal(texto: string): { texto: string; resto: string } {
  const m = /[.,;:!?]+$/.exec(texto);
  return m ? { texto: texto.slice(0, m.index), resto: m[0] } : { texto, resto: "" };
}

/**
 * Uma linha de texto em pedaços. Um `**` sem fecho (a resposta ainda está a chegar) fica a negrito até ao fim da linha, para não
 * se ver o asterisco solto a meio de uma frase.
 */
export function analisarLinha(linha: string, opcoes: OpcoesDaResposta = SO_A_RAIZ): Inline[] {
  const pedacos: Inline[] = [];
  let ultimo = 0;
  const juntar = (texto: string) => {
    if (texto) pedacos.push({ t: "texto", texto });
  };
  for (const m of linha.matchAll(marcasDe(opcoes.paginas))) {
    const inicio = m.index ?? 0;
    juntar(linha.slice(ultimo, inicio));
    ultimo = inicio + m[0].length;
    if (m[1] !== undefined) {
      pedacos.push({ t: "negrito", texto: m[1] });
    } else if (m[2] !== undefined) {
      pedacos.push({ t: "codigo", texto: m[2] });
    } else if (m[3] !== undefined && m[4] !== undefined) {
      const destino = destinoSeguro(m[4], opcoes);
      if (destino) pedacos.push({ t: "ligacao", texto: m[3], ...destino });
      else juntar(m[3]);
    } else if (m[5] !== undefined) {
      const achado = m[5].startsWith("https://") ? semPontuacaoFinal(m[5]) : { texto: m[5], resto: "" };
      const destino = achado.texto.startsWith("+")
        ? destinoSeguro(`tel:${achado.texto}`, opcoes)
        : achado.texto.includes("@")
          ? destinoSeguro(`mailto:${achado.texto}`, opcoes)
          : destinoSeguro(achado.texto, opcoes);
      if (destino) pedacos.push({ t: "ligacao", texto: achado.texto, ...destino });
      else juntar(achado.texto);
      juntar(achado.resto);
    } else if (m[6] !== undefined) {
      pedacos.push({ t: "citacao", texto: m[6], indice: Number(m[6]) });
    }
  }
  juntar(linha.slice(ultimo));
  return juntarFontes(pedacos);
}

/** Um negrito seguido (com ou sem um espaço) de uma citação é um facto da pesquisa: junta os dois num só pedaço. */
function juntarFontes(pedacos: Inline[]): Inline[] {
  const juntos: Inline[] = [];
  for (let i = 0; i < pedacos.length; i++) {
    const p = pedacos[i] as Inline;
    if (p.t === "negrito") {
      const seguinte = pedacos[i + 1];
      const espaco = seguinte?.t === "texto" && /^\s+$/.test(seguinte.texto) ? 1 : 0;
      const citacao = pedacos[i + 1 + espaco];
      if (citacao?.t === "citacao") {
        juntos.push({ t: "fonte", texto: p.texto, indice: citacao.indice });
        i += 1 + espaco;
        continue;
      }
    }
    juntos.push(p);
  }
  return juntos;
}

// Abreviaturas que levam ponto sem acabarem a frase («Sr. Silva», «Lda. Foi fundada…»).
const ABREVIATURAS: ReadonlySet<string> = new Set([
  "sr",
  "sra",
  "srs",
  "dr",
  "dra",
  "eng",
  "exmo",
  "exma",
  "prof",
  "profa",
  "art",
  "pag",
  "etc",
  "ex",
  "vs",
  "lda",
  "tel",
  "av",
  "cx",
  "ltd",
  "inc",
  "st",
  "incl",
  "cf",
  "ref",
  "min",
  "max",
  "aprox",
  "dep",
  "fig",
]);

/**
 * Parte um texto corrido numa frase por parágrafo: depois de um ponto final (ou de um ! ou ?) seguido de espaço e de uma maiúscula.
 * Não parte abreviaturas («Sr. Silva», «S.A. Todos os direitos»), iniciais («J. Lourenço»), o que está dentro de um negrito, de um
 * `código` ou do texto de uma ligação, nem os números («3.5»).
 */
export function separarFrases(texto: string): string[] {
  const frases: string[] = [];
  let inicio = 0;
  for (const m of texto.matchAll(/([.!?…]+)([)"”»*\]]*)\s+(?=[A-ZÀ-ÝÁÉÍÓÚ"“«[*(])/gu)) {
    const indice = m.index ?? 0;
    const pontuacao = m[1] ?? "";
    if (pontuacao === ".") {
      const palavra = /(\S+)$/.exec(texto.slice(0, indice))?.[1] ?? "";
      const limpa = palavra.toLowerCase().replace(/[^a-zà-ÿ.]/g, "");
      // «S.A.», «a.C.», «J.» (inicial) ou uma abreviatura: não é o fim da frase
      if (limpa.includes(".") || (limpa.length === 1 && /[a-zà-ÿ]/.test(limpa)) || ABREVIATURAS.has(limpa)) continue;
    }
    const antes = texto.slice(inicio, indice);
    const abertos = (antes.match(/\*\*/g)?.length ?? 0) % 2 === 1 || (antes.match(/`/g)?.length ?? 0) % 2 === 1;
    const ligacao = (antes.match(/\[/g)?.length ?? 0) > (antes.match(/\]/g)?.length ?? 0);
    if (abertos || ligacao) continue;
    frases.push(texto.slice(inicio, indice + pontuacao.length + (m[2] ?? "").length).trim());
    inicio = indice + m[0].length;
  }
  const resto = texto.slice(inicio).trim();
  if (resto) frases.push(resto);
  return frases;
}

const LINHA_DE_PERGUNTA = /^\s*\[\[\s*pergunta\s*[:|]\s*(.+?)\s*\]\]\s*$/i;
/** Quantas opções de um clique uma resposta mostra, e o tamanho máximo de cada uma. */
const MAXIMO_DE_OPCOES = 2;
const MAXIMO_DA_OPCAO = 90;
/** Uma opção de um clique é uma pergunta: acaba sempre em «?» («Quero saber mais» → «Quero saber mais?»). */
function comInterrogacao(texto: string): string {
  const limpo = texto.trim();
  if (/[?？]$/.test(limpo)) return limpo;
  return `${limpo.replace(/[.!…:;,\s]+$/, "")}?`;
}
const LINHA_DE_CARTAO = /^\s*\[\[\s*cart[aã]o\s*\]\]\s*$/i;
const LINHA_DE_BOTAO = /^\s*\[\[\s*bot[aã]o\s*[:|]\s*(.+?)\s*\|\s*(\S+?)\s*\]\]\s*$/i;
const ITEM_DE_LISTA = /^\s*(?:([-*•])|(\d{1,2})[.)])\s+(.*\S)\s*$/;
const TITULO = /^\s*#{1,6}\s+(.*\S)\s*$/;

/**
 * O texto de uma resposta em blocos: parágrafos (linhas separadas por quebra), listas (com «- », «* », «• » ou «1. »), títulos (que
 * viram uma linha a negrito) e botões — uma linha só com «[[botao: Rótulo | destino]]». Uma linha de botão ainda por fechar (a resposta
 * está a chegar) não se mostra; um botão com destino que não seja seguro também não. Um formulário (`[[formulario]]` + JSON +
 * `[[/formulario]]`) vira um bloco `formulario` no sítio onde a IA o pôs; enquanto está a chegar não se mostra.
 */
export function analisarResposta(texto: string, opcoes: OpcoesDaResposta = SO_A_RAIZ): Bloco[] {
  const separado = separarFormulario(texto);
  // com um formulário (válido, a chegar ou inválido) o texto parte-se à volta dele; um inválido desaparece em vez de ficar o código à vista
  if (separado.esquema || separado.emCurso || separado.antes !== texto) {
    return [
      ...analisarResposta(separado.antes, opcoes),
      ...(separado.esquema ? [{ t: "formulario" as const, esquema: separado.esquema }] : []),
      ...analisarResposta(separado.depois, opcoes),
    ];
  }
  // um botão pode vir no meio de uma linha, depois de uma frase ou num item: passa a ter a sua linha. E um que ainda está a chegar
  // («[[botao: Fal») não se mostra
  texto = texto
    .replace(/\s*(\[\[\s*(?:[a-zà-ÿ]+)\s*[:|][^\]\n]*\]\])\s*/gi, "\n$1\n")
    .replace(/\s*(\[\[\s*(?:bot[aã]o|pergunta)\s*[:|][^\]\n]*\]\]|\[\[\s*cart[aã]o\s*\]\])\s*/gi, "\n$1\n")
    .replace(/\s*\[\[[^\]\n]*$/, "");
  const blocos: Bloco[] = [];
  let lista: { ordenada: boolean; itens: Inline[][] } | null = null;
  const fechar = () => {
    if (lista?.itens.length) blocos.push({ t: "lista", ...lista });
    lista = null;
  };

  for (const linha of texto.replace(/\r/g, "").split("\n")) {
    if (!linha.trim()) {
      fechar();
      continue;
    }
    const pergunta = LINHA_DE_PERGUNTA.exec(linha);
    if (pergunta) {
      fechar();
      const bruta = (pergunta[1] ?? "").trim().slice(0, MAXIMO_DA_OPCAO);
      const opcao = bruta ? comInterrogacao(bruta) : "";
      const anterior = blocos[blocos.length - 1];
      if (opcao && anterior?.t === "perguntas") {
        if (anterior.opcoes.length < MAXIMO_DE_OPCOES) anterior.opcoes.push(opcao);
      } else if (opcao) {
        blocos.push({ t: "perguntas", opcoes: [opcao] });
      }
      continue;
    }
    if (LINHA_DE_CARTAO.test(linha)) {
      fechar();
      blocos.push({ t: "cartao" });
      continue;
    }
    const botao = LINHA_DE_BOTAO.exec(linha);
    if (botao) {
      fechar();
      const destino = destinoSeguro(botao[2] ?? "", opcoes);
      if (destino) blocos.push({ t: "botao", rotulo: (botao[1] ?? "").trim(), ...destino });
      continue;
    }
    if (linha.trimStart().startsWith("[[") && !linha.includes("]]")) continue;
    // uma marca que o chat não conhece («[[prosseguir: Entrar e pagar]]») não é texto da resposta
    if (/^\s*\[\[[^\]]*\]\]\s*$/.test(linha)) continue;

    const titulo = TITULO.exec(linha);
    if (titulo) {
      fechar();
      blocos.push({ t: "paragrafo", linhas: [[{ t: "negrito", texto: (titulo[1] ?? "").replace(/\*\*/g, "") }]] });
      continue;
    }

    const item = ITEM_DE_LISTA.exec(linha);
    if (item) {
      const ordenada = item[2] !== undefined;
      if (lista && lista.ordenada !== ordenada) fechar();
      lista ??= { ordenada, itens: [] };
      lista.itens.push(analisarLinha(item[3] ?? "", opcoes));
      continue;
    }

    if (lista) {
      blocos.push({ t: "lista", ...lista });
      lista = null;
    }
    // cada frase (até ao ponto final) é o seu parágrafo: uma resposta toda seguida, sem respiração, lê-se mal
    for (const frase of separarFrases(linha.trim())) {
      fechar();
      blocos.push({ t: "paragrafo", linhas: [analisarLinha(frase, opcoes)] });
    }
  }
  fechar();
  return blocos;
}

/** Os blocos de uma resposta, cada um em texto simples (sem a formatação nem o formulário): é o que o balão do chat fechado divide. */
export function paragrafosSimples(texto: string, opcoes: OpcoesDaResposta = SO_A_RAIZ): string[] {
  return analisarResposta(textoSemFormulario(texto), opcoes)
    .map((b) => {
      const inline = (i: Inline[]) => {
        const texto = i
          .filter((p) => p.t !== "citacao")
          .map((p) => (p.t === "ligacao" && p.interna ? nomeDaPagina(p.texto) : p.texto))
          .join("");
        // sem os números das citações não ficam espaços a mais nem um espaço antes da pontuação
        return i.some((p) => p.t === "citacao") ? texto.replace(/ +([,.;:!?])/g, "$1").replace(/ {2,}/g, " ") : texto;
      };
      if (b.t === "paragrafo") return b.linhas.map(inline).join(" ");
      if (b.t === "lista") return b.itens.map(inline).join("; ");
      if (b.t === "botao") return b.rotulo;
      // as opções de um clique não são texto da resposta (nem do balão): são o que a pessoa pode enviar a seguir
      if (b.t === "perguntas" || b.t === "cartao") return "";
      return b.esquema.titulo;
    })
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/** Quantos cartões do projecto a IA pôs no meio do texto («[[cartao]]»): os que sobram desenham-se por baixo. */
export function contarCartoesNoTexto(texto: string, opcoes: OpcoesDaResposta = SO_A_RAIZ): number {
  return analisarResposta(textoSemFormulario(texto), opcoes).filter((b) => b.t === "cartao").length;
}

/** O texto de uma resposta sem a formatação nem o formulário (para leitores de ecrã, medir o tamanho e afins). */
export function textoSimples(texto: string, opcoes: OpcoesDaResposta = SO_A_RAIZ): string {
  return paragrafosSimples(texto, opcoes).join(" ");
}
