// O histórico de conversas que fica NESTE aparelho (localStorage; nada disto vai para o servidor): uma entrada por conversa, com um
// título que a IA dá (ou, sem IA, as palavras de que a conversa tratou) e que a pessoa pode mudar. Módulo PURO: as regras e as
// operações sobre a lista; quem lê e escreve no localStorage é o componente.
import { normalizarTexto } from "./chat";
import { ID_DE_CONVERSA } from "./conversas";

/** De onde veio o título: das palavras da conversa (o recurso), da IA, ou escrito pela pessoa (esse nunca é trocado). */
type OrigemDoTitulo = "palavras" | "ia" | "pessoa";

export type EntradaDoHistorico = {
  /** O identificador da conversa (o mesmo do chat). */
  id: string;
  titulo: string;
  origem: OrigemDoTitulo;
  /** Quando a conversa mexeu pela última vez (ms desde 1970). */
  atualizada: number;
  /** A conversa em si, tal como o componente a guarda (o componente valida-a ao abrir). */
  estado: unknown;
};

export const LIMITES_DO_HISTORICO = {
  /** Quantas conversas ficam (as mais recentes). */
  conversas: 12,
  titulo: 80,
  /** O tamanho máximo de tudo o que se guarda (em caracteres do JSON): abaixo do limite do localStorage (~5 MB). */
  caracteres: 900_000,
  /** Quantas mensagens e que tamanho seguem para a IA dar o título. */
  mensagensParaTitulo: 6,
  caracteresParaTitulo: 300,
  /** Quantas palavras tem o título feito das palavras da conversa. */
  palavrasDoTitulo: 5,
} as const;

const ORIGENS: readonly string[] = ["palavras", "ia", "pessoa"];

// Palavras que não dizem de que trata uma conversa (além das de `chat.ts`, que são as das perguntas): saudações, pedidos, verbos de ajuda.
const SEM_VALOR: ReadonlySet<string> = new Set([
  "ola",
  "boa",
  "bom",
  "dia",
  "tarde",
  "noite",
  "como",
  "para",
  "com",
  "uma",
  "uns",
  "umas",
  "que",
  "qual",
  "quais",
  "quem",
  "quando",
  "onde",
  "porque",
  "por",
  "mais",
  "muito",
  "sobre",
  "isso",
  "esta",
  "este",
  "esse",
  "essa",
  "tem",
  "tens",
  "voce",
  "voces",
  "nos",
  "dos",
  "das",
  "nas",
  "nao",
  "sim",
  "queria",
  "gostaria",
  "saber",
  "podem",
  "pode",
  "posso",
  "fazer",
  "ajudar",
  "ajuda",
  "preciso",
  "quero",
  "obrigado",
  "obrigada",
  "tudo",
  "bem",
  "the",
  "and",
  "you",
  "for",
  "are",
  "can",
  "what",
  "how",
  "with",
]);

/** Sem caracteres de controlo e com os espaços normalizados. */
const compactar = (t: string): string =>
  t
    .replace(/[^\P{Cc}\n\r\t]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Limpa um título (o que a IA devolve ou o que a pessoa escreve): uma só linha, sem aspas, asteriscos, cardinais nem ponto final,
 * com no máximo 80 letras (cortado numa palavra inteira). Devolve «» se não sobra nada.
 */
export function limparTitulo(bruto: unknown): string {
  if (typeof bruto !== "string") return "";
  let t = compactar(bruto.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "");
  t = t.replace(/^(t[ií]tulo|title)\s*[:\-–]\s*/i, "");
  t = t.replace(/^[\s"'“”‘’«»*_#>\-–•]+/, "").replace(/[\s"'“”‘’«»*_#.:;,!…]+$/, "");
  if (t.length > LIMITES_DO_HISTORICO.titulo) {
    const corte = t.slice(0, LIMITES_DO_HISTORICO.titulo + 1);
    const ultimoEspaco = corte.lastIndexOf(" ");
    t = (ultimoEspaco > 20 ? corte.slice(0, ultimoEspaco) : corte.slice(0, LIMITES_DO_HISTORICO.titulo)).trim();
  }
  return t;
}

/**
 * O título feito das palavras de que a pessoa falou (o recurso quando a IA não dá um): as primeiras palavras com valor das suas
 * mensagens, na ordem em que as escreveu, sem repetir. Sem nenhuma, devolve `vazio`.
 */
export function tituloPelasPalavras(textosDaPessoa: readonly string[], vazio: string): string {
  const vistas = new Set<string>();
  const palavras: string[] = [];
  for (const texto of textosDaPessoa) {
    for (const palavra of compactar(texto).split(/[^\p{L}\p{N}]+/u)) {
      if (palavras.length >= LIMITES_DO_HISTORICO.palavrasDoTitulo) break;
      const chave = normalizarTexto(palavra);
      if (chave.length < 3 || SEM_VALOR.has(chave) || vistas.has(chave)) continue;
      vistas.add(chave);
      palavras.push(palavra);
    }
  }
  if (palavras.length === 0) return vazio;
  const t = palavras.join(" ");
  return limparTitulo(t.charAt(0).toUpperCase() + t.slice(1)) || vazio;
}

/** As mensagens que seguem para a IA dar o título: as primeiras (o assunto aparece cedo), curtas. */
export function mensagensParaTitulo(
  mensagens: ReadonlyArray<{ de: "bot" | "eu"; texto: string }>,
): Array<{ papel: "user" | "assistant"; texto: string }> {
  const saida: Array<{ papel: "user" | "assistant"; texto: string }> = [];
  for (const m of mensagens) {
    if (saida.length >= LIMITES_DO_HISTORICO.mensagensParaTitulo) break;
    const texto = compactar(m.texto).slice(0, LIMITES_DO_HISTORICO.caracteresParaTitulo);
    if (!texto) continue;
    // a conversa tem de começar por uma mensagem da pessoa (as de abertura do assistente não dizem nada do assunto)
    if (saida.length === 0 && m.de !== "eu") continue;
    saida.push({ papel: m.de === "eu" ? "user" : "assistant", texto });
  }
  return saida;
}

/** Lê o histórico guardado (JSON já lido): tira o que está mal formado, repetido ou a mais; as mais recentes primeiro. */
export function lerHistorico(bruto: unknown): EntradaDoHistorico[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const lidas: EntradaDoHistorico[] = [];
  for (const item of bruto) {
    if (typeof item !== "object" || item === null) continue;
    const { id, titulo, origem, atualizada, estado } = item as Record<string, unknown>;
    if (typeof id !== "string" || !ID_DE_CONVERSA.test(id)) continue;
    const chave = id.toLowerCase();
    if (vistos.has(chave)) continue;
    if (typeof estado !== "object" || estado === null || Array.isArray(estado)) continue;
    const tituloLido = limparTitulo(titulo);
    if (!tituloLido) continue;
    vistos.add(chave);
    lidas.push({
      id: chave,
      titulo: tituloLido,
      origem: typeof origem === "string" && ORIGENS.includes(origem) ? (origem as OrigemDoTitulo) : "palavras",
      atualizada: typeof atualizada === "number" && Number.isFinite(atualizada) ? atualizada : 0,
      estado,
    });
  }
  return limitar(lidas);
}

/** Ordena (a mais recente primeiro) e corta: no máximo 12 conversas e o tamanho total dentro do limite (cai a mais antiga). */
function limitar(lista: EntradaDoHistorico[]): EntradaDoHistorico[] {
  const ordenada = [...lista].sort((a, b) => b.atualizada - a.atualizada).slice(0, LIMITES_DO_HISTORICO.conversas);
  while (ordenada.length > 1 && JSON.stringify(ordenada).length > LIMITES_DO_HISTORICO.caracteres) ordenada.pop();
  return ordenada;
}

/** Acrescenta a conversa ou substitui a que tem o mesmo identificador. */
export function guardarEntrada(
  lista: readonly EntradaDoHistorico[],
  entrada: EntradaDoHistorico,
): EntradaDoHistorico[] {
  return limitar([...lista.filter((e) => e.id !== entrada.id), entrada]);
}

/** O título que a pessoa escreveu: fica para sempre (a IA nunca o troca). Um título vazio não muda nada. */
export function renomearEntrada(
  lista: readonly EntradaDoHistorico[],
  id: string,
  titulo: string,
): EntradaDoHistorico[] {
  const limpo = limparTitulo(titulo);
  if (!limpo) return [...lista];
  return lista.map((e) => (e.id === id ? { ...e, titulo: limpo, origem: "pessoa" } : e));
}

/** O título que a IA deu: só entra se a pessoa ainda não o mudou à mão. */
export function titularPelaIa(lista: readonly EntradaDoHistorico[], id: string, titulo: string): EntradaDoHistorico[] {
  const limpo = limparTitulo(titulo);
  if (!limpo) return [...lista];
  return lista.map((e) => (e.id === id && e.origem !== "pessoa" ? { ...e, titulo: limpo, origem: "ia" } : e));
}

export function removerEntrada(lista: readonly EntradaDoHistorico[], id: string): EntradaDoHistorico[] {
  return lista.filter((e) => e.id !== id);
}
