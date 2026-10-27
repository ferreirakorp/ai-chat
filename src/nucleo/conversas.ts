// As conversas do assistente que o visitante autorizou guardar: o que o navegador pode enviar e como se valida. Módulo PURO (sem imports
// de runtime): serve à rota do servidor e aos testes.

import { validarRaciocinio, type Raciocinio } from "./pensar";

export const LIMITES_DA_CONVERSA = {
  /** Mensagens por envio (o navegador manda só as novas) e na conversa toda. */
  porEnvio: 30,
  total: 200,
  caracteresPorMensagem: 4000,
  fontes: 6,
} as const;

export type FonteGuardada = { titulo: string; url: string };

export type MensagemGuardada = {
  papel: "user" | "assistant";
  texto: string;
  fontes: FonteGuardada[];
  /** O raciocínio da resposta (só nas respostas do assistente que o tiveram). */
  raciocinio: Raciocinio | null;
  /** Quando foi enviada (milissegundos desde 1970), se o navegador a souber. */
  em: number | null;
};

export type RegistoDeConversa = { id: string; pagina: string; mensagens: MensagemGuardada[] };

export const ID_DE_CONVERSA = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Sem caracteres de controlo (excepto a mudança de linha e o tab) e sem espaços nas pontas. */
export const semControlo = (t: string): string => t.replace(/[^\P{Cc}\n\r\t]/gu, "").trim();

/** O caminho da página de onde vem um envio (só caminhos do próprio site); senão, a raiz. */
export function paginaValida(pagina: unknown): string {
  return typeof pagina === "string" && /^\/[A-Za-z0-9\-_/#?=&.%]*$/.test(pagina) ? pagina.slice(0, 120) : "/";
}

/** Lê as fontes de uma mensagem (só https; o título e o endereço cortados). */
export function lerFontesGuardadas(fontes: unknown): FonteGuardada[] {
  const lidas: FonteGuardada[] = [];
  if (!Array.isArray(fontes)) return lidas;
  for (const f of fontes.slice(0, LIMITES_DA_CONVERSA.fontes)) {
    const { titulo, url } = (f ?? {}) as { titulo?: unknown; url?: unknown };
    if (typeof titulo !== "string" || typeof url !== "string" || !/^https:\/\/[^\s<>"']+$/i.test(url)) continue;
    lidas.push({ titulo: semControlo(titulo).slice(0, 160), url: url.slice(0, 500) });
  }
  return lidas;
}

/**
 * Valida o que o navegador envia para guardar: `{ id, pagina?, mensagens: [{ papel, texto, fontes?, em? }] }`. Recusa o que não tem a
 * forma certa e corta o que é demais (fontes só https, o resto é texto).
 */
export function validarRegistoDeConversa(
  entrada: unknown,
): { ok: true; registo: RegistoDeConversa } | { ok: false; erro: "invalido" | "vazio" | "tamanho" } {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, erro: "invalido" };
  const { id, pagina, mensagens } = entrada as { id?: unknown; pagina?: unknown; mensagens?: unknown };
  if (typeof id !== "string" || !ID_DE_CONVERSA.test(id)) return { ok: false, erro: "invalido" };
  if (!Array.isArray(mensagens)) return { ok: false, erro: "invalido" };
  if (mensagens.length === 0) return { ok: false, erro: "vazio" };
  if (mensagens.length > LIMITES_DA_CONVERSA.porEnvio) return { ok: false, erro: "tamanho" };

  const lidas: MensagemGuardada[] = [];
  for (const m of mensagens) {
    if (typeof m !== "object" || m === null) return { ok: false, erro: "invalido" };
    const { papel, texto, fontes, em, raciocinio } = m as {
      papel?: unknown;
      texto?: unknown;
      fontes?: unknown;
      em?: unknown;
      raciocinio?: unknown;
    };
    if ((papel !== "user" && papel !== "assistant") || typeof texto !== "string")
      return { ok: false, erro: "invalido" };
    const limpo = semControlo(texto);
    if (!limpo) continue;
    if (limpo.length > LIMITES_DA_CONVERSA.caracteresPorMensagem) return { ok: false, erro: "tamanho" };
    lidas.push({
      papel,
      texto: limpo,
      fontes: lerFontesGuardadas(fontes),
      raciocinio: papel === "assistant" ? validarRaciocinio(raciocinio) : null,
      em: typeof em === "number" && Number.isFinite(em) ? em : null,
    });
  }
  if (lidas.length === 0) return { ok: false, erro: "vazio" };

  return { ok: true, registo: { id: id.toLowerCase(), pagina: paginaValida(pagina), mensagens: lidas } };
}

/** A hora em que uma mensagem foi enviada: a que o navegador diz, se for do último dia e não do futuro; senão, agora. */
export function horaDeEnvio(em: number | null, agora: number = Date.now()): Date {
  if (em === null || em > agora + 60_000 || em < agora - 24 * 60 * 60 * 1000) return new Date(agora);
  return new Date(em);
}
