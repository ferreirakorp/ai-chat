// O que o balão do chat fechado mostra de uma resposta ACABADA: o princípio dela, em duas linhas (o balão corta-as e esbate o fim da
// segunda). Módulo PURO.

/** O balão não fica: aparece com a resposta acabada e sai ao fim de 2,5 s (a bolinha é que fica a avisar). */
export const TEMPO_DA_PREVIA_MS = 2_500;
/** Chega com folga para duas linhas do balão: o que passar o próprio balão corta. */
export const CARACTERES_DA_PREVIA = 160;

/** O princípio da resposta: os parágrafos juntos, com os espaços arrumados, cortado numa palavra inteira (sem reticências: o balão esbate o fim). */
export function textoDaPrevia(paragrafos: readonly string[], maximo: number = CARACTERES_DA_PREVIA): string {
  const texto = paragrafos
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p !== "")
    .join(" ");
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo + 1);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > maximo * 0.6 ? corte.slice(0, espaco) : corte.slice(0, maximo)).replace(/[\s.,;:!?-]+$/, "");
}
