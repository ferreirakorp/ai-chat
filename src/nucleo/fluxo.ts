// O fluxo de uma resposta do assistente: o servidor emite UMA linha JSON por evento (NDJSON) e o navegador lê-as. Este módulo PURO é o
// contrato entre os dois: os tipos dos eventos, e a leitura segura de uma linha (o navegador nunca confia no que recebe).

/** Um resultado de pesquisa na web: o que o chat mostra como fonte e o que a IA lê. `resumo` pode vir vazio. */
export type FontePesquisada = { titulo: string; url: string; resumo: string };

/** Porque é que a IA respondeu sem pesquisar: a equipa já tinha a resposta, não era preciso, o limite de pesquisas ou a decisão falhou. */
export type MotivoSemPesquisa = "equipa" | "nao" | "limite" | "falhou";

/** Um passo genérico do assistente (uma ferramenta ou acção do projecto): o título, o que fez e, se pesquisou, o termo e as fontes. */
export type PassoGenerico = {
  titulo: string;
  descricao?: string;
  consulta?: string;
  fontes?: FontePesquisada[];
  /** O ícone do «A pensar…» enquanto este passo está activo (por omissão o cérebro). */
  icone?: "cerebro" | "globo" | "lapis";
};

/**
 * Os eventos, pela ordem em que chegam:
 *   {semPesquisa}  OU  {pesquisa} + {fontes}   a decisão de pesquisar (e o que a pesquisa trouxe; a lista pode vir vazia)
 *   {orientacoes}                              quantas orientações da equipa a IA recebeu para esta pergunta
 *   {t} …                                      os pedaços do texto da resposta
 *   {fim}  OU  {erro}                          o fim (ou a falha: o chat passa às respostas prontas)
 */
export type EventoDoFluxo =
  | { t: string }
  | { fim: true }
  | { erro: string }
  | { pesquisa: string }
  | { fontes: FontePesquisada[] }
  | { semPesquisa: MotivoSemPesquisa }
  | { orientacoes: number }
  | { passo: PassoGenerico };

export const LIMITES_DO_FLUXO = { fontes: 6, titulo: 160, url: 500, resumo: 360, consulta: 120 } as const;

/** Sem caracteres de controlo, com os espaços normalizados e um tamanho máximo. */
export function textoLimpo(valor: unknown, maximo: number): string {
  if (typeof valor !== "string") return "";
  return valor
    .replace(/[^\P{Cc}\n\r\t]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo);
}

/** Só endereços https com um domínio (o que a web devolve nunca manda no que se abre). */
export function urlHttpsValido(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length > LIMITES_DO_FLUXO.url || valor.includes(" ")) return null;
  try {
    const u = new URL(valor);
    return u.protocol === "https:" && u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

/** Lê uma lista de fontes vinda de fora: descarta o que não tem título ou endereço https válido e corta o excesso. */
export function lerFontesPesquisadas(valor: unknown, maximo: number = LIMITES_DO_FLUXO.fontes): FontePesquisada[] {
  if (!Array.isArray(valor)) return [];
  const fontes: FontePesquisada[] = [];
  for (const f of valor) {
    if (fontes.length >= maximo) break;
    const { titulo, url, resumo } = (f ?? {}) as { titulo?: unknown; url?: unknown; resumo?: unknown };
    const href = urlHttpsValido(url);
    const t = textoLimpo(titulo, LIMITES_DO_FLUXO.titulo);
    if (!href || !t) continue;
    fontes.push({ titulo: t, url: href, resumo: textoLimpo(resumo, LIMITES_DO_FLUXO.resumo) });
  }
  return fontes;
}

const MOTIVOS: readonly string[] = ["equipa", "nao", "limite", "falhou"];

/** Lê UMA linha do fluxo do assistente. Devolve `null` para o que não for um evento conhecido e bem formado. */
export function lerEventoDoFluxo(linha: string): EventoDoFluxo | null {
  const texto = linha.trim();
  if (!texto) return null;
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null) return null;
  const e = o as Record<string, unknown>;
  if (typeof e.t === "string") return { t: e.t };
  if (e.fim) return { fim: true };
  if (e.erro) return { erro: textoLimpo(e.erro, 40) || "erro" };
  if (typeof e.passo === "object" && e.passo !== null) {
    const p = e.passo as Record<string, unknown>;
    const titulo = textoLimpo(p.titulo, 80);
    if (!titulo) return null;
    const descricao = textoLimpo(p.descricao, 280);
    const consulta = textoLimpo(p.consulta, LIMITES_DO_FLUXO.consulta);
    const fontes = lerFontesPesquisadas(p.fontes);
    const icone = p.icone === "globo" || p.icone === "lapis" || p.icone === "cerebro" ? p.icone : undefined;
    return {
      passo: {
        titulo,
        ...(descricao ? { descricao } : {}),
        ...(consulta ? { consulta } : {}),
        ...(fontes.length > 0 ? { fontes } : {}),
        ...(icone ? { icone } : {}),
      },
    };
  }
  if (typeof e.pesquisa === "string") return { pesquisa: textoLimpo(e.pesquisa, LIMITES_DO_FLUXO.consulta) };
  if (Array.isArray(e.fontes)) return { fontes: lerFontesPesquisadas(e.fontes) };
  if (typeof e.semPesquisa === "string" && MOTIVOS.includes(e.semPesquisa)) {
    return { semPesquisa: e.semPesquisa as MotivoSemPesquisa };
  }
  if (
    typeof e.orientacoes === "number" &&
    Number.isInteger(e.orientacoes) &&
    e.orientacoes >= 0 &&
    e.orientacoes <= 9
  ) {
    return { orientacoes: e.orientacoes };
  }
  return null;
}
