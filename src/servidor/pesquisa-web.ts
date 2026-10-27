import type { FontePesquisada } from "../nucleo/fluxo";
import { descreverErro, ipv4Primeiro, repetirSeARedeFalhar } from "./rede";

ipv4Primeiro();

// A pesquisa na web do assistente. O fornecedor depende do que estiver configurado: TAVILY_API_KEY (pesquisa geral, a melhor para uma IA),
// BRAVE_API_KEY (pesquisa geral) e, sem chave nenhuma, a Wikipédia (só enciclopédia, mas fontes a sério e sem custo). Só se chamam
// estes endereços fixos; o que a web devolve é tratado como DADOS (texto cortado, sem HTML, só endereços https) e nunca como ordens.

const ESPERA_MS = 6_000;
const MAXIMO_DE_RESULTADOS = 4;
const MAXIMO_DO_RESUMO = 360;

type Env = Record<string, string | undefined>;

/** Texto limpo de um resultado: sem etiquetas HTML, com os espaços normalizados e um tamanho máximo. */
export function limparResumo(bruto: unknown): string {
  if (typeof bruto !== "string") return "";
  return bruto
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAXIMO_DO_RESUMO);
}

/** Um resultado só serve se tiver título, resumo e um endereço https. */
export function resultadoValido(titulo: unknown, url: unknown, resumo: unknown): FontePesquisada | null {
  const t = limparResumo(titulo).slice(0, 140);
  const r = limparResumo(resumo);
  if (!t || !r || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return { titulo: t, url: u.href, resumo: r };
  } catch {
    return null;
  }
}

/** Um pedido JSON com uma repetição se a rede falhar; um estado de erro do fornecedor ou o fim da espera não se repetem. */
async function pedirJson(url: string, init: RequestInit): Promise<unknown> {
  const resposta = await repetirSeARedeFalhar(() => fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS) }));
  if (!resposta.ok) throw new Error(`estado ${resposta.status}`);
  return (await resposta.json()) as unknown;
}

async function tavily(consulta: string, chave: string): Promise<FontePesquisada[]> {
  const o = (await pedirJson("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      query: consulta,
      max_results: MAXIMO_DE_RESULTADOS,
      search_depth: "basic",
      include_answer: false,
    }),
  })) as { results?: Array<{ title?: unknown; url?: unknown; content?: unknown }> };
  return (o.results ?? []).flatMap((r) => resultadoValido(r.title, r.url, r.content) ?? []);
}

async function brave(consulta: string, chave: string): Promise<FontePesquisada[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(consulta)}&count=${MAXIMO_DE_RESULTADOS}`;
  const o = (await pedirJson(url, { headers: { Accept: "application/json", "X-Subscription-Token": chave } })) as {
    web?: { results?: Array<{ title?: unknown; url?: unknown; description?: unknown }> };
  };
  return (o.web?.results ?? []).flatMap((r) => resultadoValido(r.title, r.url, r.description) ?? []);
}

async function wikipedia(consulta: string, lingua: "pt" | "en"): Promise<FontePesquisada[]> {
  const url = `https://${lingua}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(consulta)}&limit=${MAXIMO_DE_RESULTADOS - 1}`;
  const o = (await pedirJson(url, {
    headers: { Accept: "application/json", "User-Agent": "AssistenteIA/1.0" },
  })) as {
    pages?: Array<{ key?: unknown; title?: unknown; excerpt?: unknown; description?: unknown }>;
  };
  return (o.pages ?? []).flatMap((p) => {
    if (typeof p.key !== "string") return [];
    const resumo = limparResumo(p.excerpt) || limparResumo(p.description);
    return resultadoValido(p.title, `https://${lingua}.wikipedia.org/wiki/${encodeURIComponent(p.key)}`, resumo) ?? [];
  });
}

/** Qual fornecedor está a ser usado (para o registo e os testes). */
export function fornecedorDePesquisa(env: Env = process.env): "tavily" | "brave" | "wikipedia" {
  if (env.TAVILY_API_KEY?.trim()) return "tavily";
  if (env.BRAVE_API_KEY?.trim()) return "brave";
  return "wikipedia";
}

/** Pesquisa na web e devolve até quatro resultados limpos; se o fornecedor falhar, devolve uma lista vazia (a IA responde sem eles). */
export async function pesquisarNaWeb(consulta: string, env: Env = process.env): Promise<FontePesquisada[]> {
  const fornecedor = fornecedorDePesquisa(env);
  try {
    let r: FontePesquisada[];
    if (fornecedor === "tavily") r = await tavily(consulta, env.TAVILY_API_KEY!.trim());
    else if (fornecedor === "brave") r = await brave(consulta, env.BRAVE_API_KEY!.trim());
    else {
      // português e inglês ao mesmo tempo (uma falha de rede numa não atrasa nem estraga a outra); o português tem preferência
      const [pt, en] = await Promise.allSettled([wikipedia(consulta, "pt"), wikipedia(consulta, "en")]);
      const lista = (e: PromiseSettledResult<FontePesquisada[]>) => (e.status === "fulfilled" ? e.value : []);
      r = lista(pt).length > 0 ? lista(pt) : lista(en);
      if (r.length === 0 && pt.status === "rejected" && en.status === "rejected") throw pt.reason;
    }
    return r.slice(0, MAXIMO_DE_RESULTADOS);
  } catch (erro) {
    console.warn(`[chat] a pesquisa (${fornecedor}) falhou: ${descreverErro(erro)}`);
    return [];
  }
}
