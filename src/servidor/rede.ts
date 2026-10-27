import { setDefaultResultOrder } from "node:dns";

/**
 * O DNS deste servidor falha (EAI_AGAIN) quando o IPv6 vem primeiro: um `fetch` a um serviço externo (a Cloudflare AI, a pesquisa na web)
 * dá «fetch failed». Pede-se IPv4 primeiro; é seguro chamar muitas vezes. (Em produção o compose também leva
 * NODE_OPTIONS=--dns-result-order=ipv4first; isto garante o mesmo no dev e em qualquer ambiente.)
 */
export function ipv4Primeiro(): void {
  setDefaultResultOrder("ipv4first");
}

/** Uma falha de rede do `fetch` (DNS, ligação cortada): é um TypeError «fetch failed». Um estado HTTP de erro ou um tempo esgotado não são. */
export function foiFalhaDeRede(erro: unknown): boolean {
  return erro instanceof TypeError;
}

/**
 * Corre o pedido e, se a rede falhar (este servidor perde pacotes de vez em quando), repete-o uma vez. Qualquer outro erro, e o pedido
 * já cancelado, sobem de imediato.
 */
export async function repetirSeARedeFalhar<T>(pedir: () => Promise<T>, sinal?: AbortSignal): Promise<T> {
  try {
    return await pedir();
  } catch (erro) {
    if (!foiFalhaDeRede(erro) || sinal?.aborted) throw erro;
    return pedir();
  }
}

/** Como se escreve um erro nos registos, sem texto da conversa: «TypeError (EAI_AGAIN)», «TimeoutError»… */
export function descreverErro(erro: unknown): string {
  if (!(erro instanceof Error)) return "erro";
  const causa = (erro as { cause?: { code?: unknown } }).cause?.code;
  return typeof causa === "string" ? `${erro.name} (${causa})` : erro.name;
}
