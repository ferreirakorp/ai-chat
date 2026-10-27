import {
  dispensaPesquisa,
  instrucoesDePesquisa,
  lerDecisaoDePesquisa,
  lerLinhaDoFluxo,
  normalizarTexto,
  pedidoDeDecisao,
  pedidoDeTitulo,
  resultadosRelevantes,
  type MensagemDoChat,
} from "../nucleo/chat";
import type { EventoDoFluxo, FontePesquisada, MotivoSemPesquisa } from "../nucleo/fluxo";
import { limparTitulo } from "../nucleo/historico";
import { blocoDeOrientacoes, type Orientacao } from "../nucleo/orientacoes";
import { pesquisarNaWeb } from "./pesquisa-web";
import { descreverErro, ipv4Primeiro, repetirSeARedeFalhar } from "./rede";

ipv4Primeiro();

// A ligação à IA da Cloudflare (Workers AI, pela API REST) do assistente. O token só tem a permissão «Workers AI» (nada de DNS, túneis ou
// armazenamento): vem das variáveis CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_AI_TOKEN e NUNCA sai do servidor. Sem elas (ou com a IA desligada)
// o assistente responde só com as perguntas pré-feitas.

/** Por ordem: o modelo principal e, se falhar, um mais leve. Mudam-se em CHAT_MODELOS (separados por vírgulas). */
const MODELOS_PADRAO: readonly string[] = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct",
];

/** Tempo para a IA começar a responder (cabeçalhos e primeiro pedaço) e tempo máximo de uma resposta inteira. */
const ESPERA_PELO_PRIMEIRO_PEDACO_MS = 12_000;
const DURACAO_MAXIMA_MS = 45_000;
/** Tokens de uma resposta: com listas e negritos 320 cortava a resposta a meio de uma frase. */
const MAXIMO_DE_TOKENS_GERADOS = 480;
/** Tempo para o modelo leve decidir se a pergunta pede uma pesquisa na web. */
const ESPERA_DA_DECISAO_MS = 9_000;

export type ConfiguracaoDaIa = { conta: string; token: string; modelos: string[] };

type Env = Record<string, string | undefined>;

export function configuracaoDaIa(env: Env = process.env): ConfiguracaoDaIa | null {
  const conta = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const token = env.CLOUDFLARE_AI_TOKEN?.trim() ?? "";
  if (env.CHAT_IA === "desligada" || !/^[a-f0-9]{32}$/i.test(conta) || token.length < 20) return null;
  const pedidos = (env.CHAT_MODELOS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^@cf\/[\w.-]+\/[\w.-]+$/.test(m));
  return { conta, token, modelos: pedidos.length > 0 ? pedidos : [...MODELOS_PADRAO] };
}

export type MensagemParaIa = { role: "system" | "user" | "assistant"; content: string };

type FluxoDaIa = { corpo: ReadableStream<Uint8Array>; modelo: string; cancelar: () => void };

/**
 * Pede a resposta (em fluxo) ao primeiro modelo que a der; se um falhar (sem quota, sem rede, tempo esgotado) tenta o seguinte.
 * Devolve `null` quando nenhum responde — o assistente passa ao recuo (perguntas pré-feitas). Nunca regista o texto da conversa.
 */
async function abrirFluxoDaIa(
  config: ConfiguracaoDaIa,
  mensagens: readonly MensagemParaIa[],
  sinalDoPedido?: AbortSignal,
): Promise<FluxoDaIa | null> {
  for (const modelo of config.modelos) {
    if (sinalDoPedido?.aborted) return null;
    const controlo = new AbortController();
    const aoCancelarPedido = () => controlo.abort();
    sinalDoPedido?.addEventListener("abort", aoCancelarPedido, { once: true });
    const relogio = setTimeout(() => controlo.abort(), ESPERA_PELO_PRIMEIRO_PEDACO_MS);
    try {
      const resposta = await repetirSeARedeFalhar(
        () =>
          fetch(`https://api.cloudflare.com/client/v4/accounts/${config.conta}/ai/run/${modelo}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: mensagens,
              stream: true,
              max_tokens: MAXIMO_DE_TOKENS_GERADOS,
              temperature: 0.7,
            }),
            signal: controlo.signal,
          }),
        controlo.signal,
      );
      if (resposta.ok && resposta.body) {
        clearTimeout(relogio);
        return {
          corpo: resposta.body,
          modelo,
          cancelar: () => {
            sinalDoPedido?.removeEventListener("abort", aoCancelarPedido);
            controlo.abort();
          },
        };
      }
      console.warn(`[assistente] a IA (${modelo}) respondeu com o estado ${resposta.status}`);
      void resposta.body?.cancel().catch(() => {});
    } catch (erro) {
      console.warn(`[assistente] a IA (${modelo}) não respondeu: ${descreverErro(erro)}`);
    }
    clearTimeout(relogio);
    sinalDoPedido?.removeEventListener("abort", aoCancelarPedido);
  }
  return null;
}

const codificador = new TextEncoder();
const linhaJson = (o: EventoDoFluxo): Uint8Array => codificador.encode(`${JSON.stringify(o)}\n`);

/**
 * Do fluxo SSE da Cloudflare para o fluxo do assistente: uma linha JSON por pedaço — `{"t":"texto"}` — e no fim `{"fim":true}`
 * (ou `{"erro":"…"}` se a IA calar-se, cortar a meio ou demorar demais). O navegador só precisa de ler linhas.
 */
export function fluxoDoAssistente(corpo: ReadableStream<Uint8Array>, cancelar: () => void): ReadableStream<Uint8Array> {
  const leitor = corpo.getReader();
  const descodificador = new TextDecoder();
  let resto = "";
  let pedacos = 0;
  let acabou = false;
  const inicio = Date.now();

  const terminar = (controlo: ReadableStreamDefaultController<Uint8Array>, fim: EventoDoFluxo) => {
    if (acabou) return;
    acabou = true;
    controlo.enqueue(linhaJson(fim));
    controlo.close();
    cancelar();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controlo) {
      if (acabou) return;
      try {
        while (true) {
          if (Date.now() - inicio > DURACAO_MAXIMA_MS) {
            terminar(controlo, { erro: "tempo" });
            return;
          }
          const { done, value } = await leitor.read();
          if (done) {
            terminar(controlo, pedacos > 0 ? { fim: true } : { erro: "vazio" });
            return;
          }
          resto += descodificador.decode(value, { stream: true });
          const linhas = resto.split("\n");
          resto = linhas.pop() ?? "";
          let enviou = false;
          for (const linha of linhas) {
            const pedaco = lerLinhaDoFluxo(linha);
            if (!pedaco) continue;
            if ("fim" in pedaco) {
              terminar(controlo, pedacos > 0 ? { fim: true } : { erro: "vazio" });
              return;
            }
            pedacos += 1;
            enviou = true;
            controlo.enqueue(linhaJson({ t: pedaco.texto }));
          }
          if (enviou) return;
        }
      } catch {
        terminar(controlo, { erro: "cortado" });
      }
    },
    cancel() {
      acabou = true;
      cancelar();
    },
  });
}

// ─── A resposta completa: decidir se há pesquisa, pesquisar, aplicar as orientações, responder ──────────────────────────

/** O modelo leve que decide se uma pergunta precisa de pesquisa na web (barato e rápido). Muda-se em CHAT_MODELO_LEVE. */
function modeloLeve(env: Env = process.env): string {
  const pedido = env.CHAT_MODELO_LEVE?.trim() ?? "";
  return /^@cf\/[\w.-]+\/[\w.-]+$/.test(pedido) ? pedido : "@cf/meta/llama-3.1-8b-instruct";
}

type Decisao = { consulta: string } | { semPesquisa: Extract<MotivoSemPesquisa, "nao" | "falhou"> };

/** Pergunta ao modelo leve se a mensagem precisa de uma pesquisa na web. Uma falha conta como «não» (mas fica registada como «falhou»). */
async function decidirPesquisa(
  config: ConfiguracaoDaIa,
  ultimaMensagem: string,
  descricao: string,
  sinal?: AbortSignal,
): Promise<Decisao> {
  try {
    // o tempo da decisão (e do pedido da pessoa) é um só, mesmo havendo uma repetição por falha de rede
    const limite = sinal
      ? AbortSignal.any([sinal, AbortSignal.timeout(ESPERA_DA_DECISAO_MS)])
      : AbortSignal.timeout(ESPERA_DA_DECISAO_MS);
    const resposta = await repetirSeARedeFalhar(
      () =>
        fetch(`https://api.cloudflare.com/client/v4/accounts/${config.conta}/ai/run/${modeloLeve()}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: pedidoDeDecisao(ultimaMensagem, descricao) }],
            max_tokens: 60,
            temperature: 0,
          }),
          signal: limite,
        }),
      limite,
    );
    if (!resposta.ok) {
      console.warn(`[assistente] a decisão de pesquisar falhou com o estado ${resposta.status}`);
      return { semPesquisa: "falhou" };
    }
    const o = (await resposta.json()) as {
      result?: { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
    };
    const texto = o.result?.response ?? o.result?.choices?.[0]?.message?.content;
    return lerDecisaoDePesquisa(texto) ?? { semPesquisa: "nao" };
  } catch (erro) {
    console.warn(`[assistente] a decisão de pesquisar não chegou: ${descreverErro(erro)}`);
    return { semPesquisa: "falhou" };
  }
}

/**
 * Pede ao modelo leve um título curto para a conversa (o histórico da pessoa). Devolve «null» se não houver IA, falhar, demorar ou
 * não vier nada que se aproveite: o navegador fica com o título feito das palavras da conversa.
 */
export async function gerarTitulo(
  config: ConfiguracaoDaIa,
  mensagens: readonly MensagemDoChat[],
  sinal?: AbortSignal,
): Promise<string | null> {
  try {
    const limite = sinal
      ? AbortSignal.any([sinal, AbortSignal.timeout(ESPERA_DA_DECISAO_MS)])
      : AbortSignal.timeout(ESPERA_DA_DECISAO_MS);
    const resposta = await repetirSeARedeFalhar(
      () =>
        fetch(`https://api.cloudflare.com/client/v4/accounts/${config.conta}/ai/run/${modeloLeve()}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: pedidoDeTitulo(mensagens) }],
            max_tokens: 32,
            temperature: 0.2,
          }),
          signal: limite,
        }),
      limite,
    );
    if (!resposta.ok) {
      console.warn(`[assistente] o título da conversa falhou com o estado ${resposta.status}`);
      return null;
    }
    const o = (await resposta.json()) as {
      result?: { response?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
    };
    const texto = o.result?.response ?? o.result?.choices?.[0]?.message?.content;
    return limparTitulo(texto) || null;
  } catch (erro) {
    console.warn(`[assistente] o título da conversa não chegou: ${descreverErro(erro)}`);
    return null;
  }
}

export type OpcoesDoFluxo = {
  config: ConfiguracaoDaIa;
  /** A conversa (sem as instruções): as mensagens da pessoa e do assistente. */
  mensagens: readonly MensagemParaIa[];
  /** As instruções da IA; recebem, quando houve, o bloco da pesquisa e o das orientações da equipa. */
  sistema: (extra: { pesquisa?: string; orientacoes?: string }) => string;
  ultimaMensagem: string;
  /** O que a empresa é, numa frase (ajuda o modelo leve a decidir se pesquisa). */
  descricaoDaEmpresa: string;
  /** As perguntas da equipa (uma pergunta igual a uma delas não vai à pesquisa). */
  perguntasDaEquipa: readonly string[];
  /** As orientações da equipa que servem a esta pergunta (já escolhidas): seguem para as instruções da IA. */
  orientacoes?: readonly Orientacao[];
  /** Gasta uma pesquisa do limite do visitante; `false` = já não pode pesquisar (a IA responde sem). */
  permitirPesquisa: () => Promise<boolean>;
  /** A pesquisa na web (por omissão a do módulo: Tavily, Brave ou Wikipédia). Serve para testar. */
  pesquisar?: (consulta: string) => Promise<FontePesquisada[]>;
  sinal?: AbortSignal;
};

/**
 * O fluxo de uma resposta, em linhas JSON (os eventos de nucleo/fluxo.ts): primeiro a decisão de pesquisar (`semPesquisa`, ou `pesquisa`
 * e `fontes`), depois `orientacoes` (se a equipa deixou alguma para esta pergunta), os pedaços de texto `{"t":"…"}` e o fim (ou um
 * erro, e o chat usa as respostas prontas). A decisão, a pesquisa e a resposta correm aqui, por isso o navegador só lê linhas.
 */
export function responderComIa(o: OpcoesDoFluxo): ReadableStream<Uint8Array> {
  const cancelamento = new AbortController();
  o.sinal?.addEventListener("abort", () => cancelamento.abort(), { once: true });
  let interno: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const pesquisar = o.pesquisar ?? ((consulta: string) => pesquisarNaWeb(consulta));
  return new ReadableStream<Uint8Array>({
    async start(controlo) {
      const emitir = (e: EventoDoFluxo) => controlo.enqueue(linhaJson(e));
      try {
        let pesquisa: string | undefined;
        const normal = normalizarTexto(o.ultimaMensagem);
        if (dispensaPesquisa(o.ultimaMensagem, o.perguntasDaEquipa)) {
          emitir({ semPesquisa: o.perguntasDaEquipa.some((p) => normalizarTexto(p) === normal) ? "equipa" : "nao" });
        } else {
          const decisao = await decidirPesquisa(o.config, o.ultimaMensagem, o.descricaoDaEmpresa, cancelamento.signal);
          if (!("consulta" in decisao)) {
            emitir({ semPesquisa: decisao.semPesquisa });
          } else if (!(await o.permitirPesquisa())) {
            emitir({ semPesquisa: "limite" });
          } else {
            emitir({ pesquisa: decisao.consulta });
            const encontrados = await pesquisar(decisao.consulta);
            const resultados = resultadosRelevantes(decisao.consulta, encontrados);
            console.info(
              `[assistente] pesquisa na web: ${resultados.length} resultado(s) úteis de ${encontrados.length}`,
            );
            emitir({ fontes: resultados });
            if (resultados.length > 0) pesquisa = instrucoesDePesquisa(resultados);
          }
        }
        const orientacoes = o.orientacoes ?? [];
        if (orientacoes.length > 0) emitir({ orientacoes: orientacoes.length });
        const fluxo = await abrirFluxoDaIa(
          o.config,
          [
            {
              role: "system",
              content: o.sistema({
                ...(pesquisa ? { pesquisa } : {}),
                ...(orientacoes.length > 0 ? { orientacoes: blocoDeOrientacoes(orientacoes) } : {}),
              }),
            },
            ...o.mensagens,
          ],
          cancelamento.signal,
        );
        if (!fluxo) {
          emitir({ erro: "indisponivel" });
          controlo.close();
          return;
        }
        const leitor = fluxoDoAssistente(fluxo.corpo, fluxo.cancelar).getReader();
        interno = leitor;
        while (true) {
          const { done, value } = await leitor.read();
          if (done) break;
          controlo.enqueue(value);
        }
        controlo.close();
      } catch {
        try {
          emitir({ erro: "interno" });
          controlo.close();
        } catch {
          // o navegador já saiu
        }
      }
    },
    cancel() {
      cancelamento.abort();
      void interno?.cancel().catch(() => {});
    },
  });
}
