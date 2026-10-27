import { validarAvaliacao, validarRetirada } from "../nucleo/avaliacoes";
import { instrucoesDaIa, validarPedidoDeChat, validarPedidoDeTitulo } from "../nucleo/chat";
import { lerModo, type ModoDoAssistente, type PerfilDaEmpresa } from "../nucleo/conteudo";
import { ID_DE_CONVERSA, validarRegistoDeConversa } from "../nucleo/conversas";
import type { FontePesquisada } from "../nucleo/fluxo";
import { validarFormularioEnviado } from "../nucleo/formulario";
import { orientacoesParaMensagem, type Orientacao } from "../nucleo/orientacoes";
import { gerarTitulo, responderComIa, type ConfiguracaoDaIa, type MensagemParaIa } from "./fluxo-ia";
import { enderecoDoPedido, type LimitadorDeTaxa, type RegraDeTaxa } from "./limite";
import { veioDoMesmoSite } from "./origem";
import type { RepositorioDoAssistente } from "./repositorio";

// O servidor do assistente numa chamada: `criarAssistente(config)` devolve as rotas (`GET`, `POST`, `DELETE`, no formato standard
// Request → Response, que o Next, o Hono, o Remix… aceitam) e o repositório. As rotas respondem a:
//   POST   {base}             pergunta à IA (resposta em NDJSON)           POST/DELETE {base}/avaliacao
//   POST/DELETE {base}/conversa   guardar / apagar a conversa              POST        {base}/formulario
//   POST   {base}/titulo      um título para a conversa (histórico)         POST        {base}/estado   com quem se está a falar

/** O que o projecto diz ao assistente sobre si, a cada pergunta (pode vir de uma base de dados, de ficheiros…). */
export type ContextoDoAssistente = {
  perfil: PerfilDaEmpresa;
  /** A personalidade (o painel do projecto edita-a). */
  estilo: string;
  /** Os factos da empresa que a IA pode usar (texto). */
  conhecimento: string;
  /** As perguntas da equipa (uma pergunta igual a uma delas não vai à pesquisa). */
  perguntasDaEquipa: string[];
};

export type LimitesDoAssistente = {
  porIp: RegraDeTaxa;
  porIpPorDia: RegraDeTaxa;
  global: RegraDeTaxa;
  pesquisasPorIp: RegraDeTaxa;
  /** Guardar conversas, avaliações e formulários (por endereço). */
  escritas: RegraDeTaxa;
  /** Dar título às conversas do histórico (por endereço). */
  titulos: RegraDeTaxa;
  /** Perguntar com quem se está a falar (o chat pergunta de tempos a tempos enquanto está aberto). */
  leituras: RegraDeTaxa;
};

export const LIMITES_PADRAO: LimitesDoAssistente = {
  porIp: { limite: 24, janelaSegundos: 10 * 60 },
  porIpPorDia: { limite: 100, janelaSegundos: 24 * 60 * 60 },
  global: { limite: 400, janelaSegundos: 60 * 60 },
  pesquisasPorIp: { limite: 8, janelaSegundos: 10 * 60 },
  escritas: { limite: 80, janelaSegundos: 10 * 60 },
  titulos: { limite: 20, janelaSegundos: 10 * 60 },
  leituras: { limite: 90, janelaSegundos: 10 * 60 },
};

export type ConfiguracaoDoAssistente = {
  /** A IA (de `configuracaoDaIa(process.env)`); `null` = sem IA: o chat responde só com as perguntas prontas. */
  ia: ConfiguracaoDaIa | null;
  repositorio: RepositorioDoAssistente;
  limite: LimitadorDeTaxa;
  contexto: (caminho: string) => Promise<ContextoDoAssistente>;
  /** O caminho das rotas (por omissão `/api/assistente`). */
  caminhoBase?: string;
  limites?: Partial<LimitesDoAssistente>;
  /** O pedido vem do mesmo site? (por omissão compara `Origin` com `Host`). */
  origemPermitida?: (req: Request) => boolean;
  /** A pesquisa na web (por omissão: Tavily, Brave ou Wikipédia, conforme as chaves). Serve para testar. */
  pesquisar?: (consulta: string) => Promise<FontePesquisada[]>;
  /** Quanto tempo as orientações activas ficam em cache (por omissão 20 s). */
  cacheDasOrientacoesMs?: number;
  /**
   * Com quem a pessoa está a falar agora: `ia`, `humano` (alguém da equipa tomou a conversa) ou `offline` (responde-se só com as
   * perguntas prontas). Por omissão: `ia` se há IA configurada, `offline` se não. O chat pergunta de tempos a tempos.
   * Pode devolver só o modo ou `{ modo, nome }`: com `humano`, o `nome` de quem responde aparece no balão do chat fechado
   * («Indira Resposta: …») em vez de «I.A.».
   */
  estado?: () => EstadoDoAssistente | Promise<EstadoDoAssistente>;
};

type EstadoDoAssistente = ModoDoAssistente | { modo: ModoDoAssistente; nome?: string };

export type Assistente = {
  rotas: {
    GET: (req: Request) => Promise<Response>;
    POST: (req: Request) => Promise<Response>;
    DELETE: (req: Request) => Promise<Response>;
  };
  repositorio: RepositorioDoAssistente;
  /** Esquece as orientações em cache (depois de a equipa as mudar no painel, para valerem já). */
  esquecerOrientacoes: () => void;
};

const TAMANHO_DO_PEDIDO = 12 * 1024;
const TAMANHO_DA_ESCRITA = 96 * 1024;

function responder(corpo: Record<string, unknown>, estado = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status: estado,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

async function lerCorpo(
  req: Request,
  maximo: number,
): Promise<{ ok: true; corpo: unknown } | { ok: false; estado: number; erro: string }> {
  if (!(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return { ok: false, estado: 415, erro: "formato" };
  }
  if (Number(req.headers.get("content-length") || "0") > maximo) return { ok: false, estado: 413, erro: "tamanho" };
  let texto: string;
  try {
    texto = await req.text();
  } catch {
    return { ok: false, estado: 400, erro: "invalido" };
  }
  if (texto.length > maximo) return { ok: false, estado: 413, erro: "tamanho" };
  try {
    return { ok: true, corpo: JSON.parse(texto) as unknown };
  } catch {
    return { ok: false, estado: 400, erro: "invalido" };
  }
}

export function criarAssistente(config: ConfiguracaoDoAssistente): Assistente {
  const base = (config.caminhoBase ?? "/api/assistente").replace(/\/+$/, "");
  const limites: LimitesDoAssistente = { ...LIMITES_PADRAO, ...config.limites };
  const mesmaOrigem = config.origemPermitida ?? veioDoMesmoSite;
  const repositorio = config.repositorio;
  const ttl = config.cacheDasOrientacoesMs ?? 20_000;
  let cache: { ate: number; lista: Orientacao[] } | null = null;

  async function orientacoesAtivas(): Promise<Orientacao[]> {
    const agora = Date.now();
    if (cache && cache.ate > agora) return cache.lista;
    try {
      const lista = await repositorio.orientacoesAtivas();
      cache = { ate: agora + ttl, lista };
      return lista;
    } catch {
      console.warn("[assistente] não foi possível ler as orientações da equipa");
      return cache?.lista ?? [];
    }
  }

  /** Gasta o pedido nas regras (chave completa + regra); devolve a resposta de recusa, ou `null` se pode seguir. */
  async function limitar(regras: Array<[string, RegraDeTaxa]>): Promise<Response | null> {
    try {
      for (const [chave, regra] of regras) {
        const r = await config.limite(chave, regra);
        if (!r.permitido)
          return responder({ ok: false, erro: "limite" }, 429, { "Retry-After": String(r.repetirEmSegundos) });
      }
    } catch {
      console.error("[assistente] não foi possível verificar o limite de pedidos");
      return responder({ ok: false, erro: "indisponivel" }, 503);
    }
    return null;
  }

  async function perguntar(req: Request): Promise<Response> {
    const corpo = await lerCorpo(req, TAMANHO_DO_PEDIDO);
    if (!corpo.ok) return responder({ ok: false, erro: corpo.erro }, corpo.estado);
    const pedido = validarPedidoDeChat(corpo.corpo);
    if (!pedido.ok) return responder({ ok: false, erro: pedido.erro }, 400);
    // sem IA configurada não se gasta nada nem se conta o limite: o navegador passa logo às perguntas pré-feitas
    if (!config.ia) return responder({ ok: false, erro: "indisponivel" }, 503);

    const ip = enderecoDoPedido(req.headers);
    const recusa = await limitar([
      [`assistente:ip:${ip}`, limites.porIp],
      [`assistente:dia:${ip}`, limites.porIpPorDia],
      ["assistente:global", limites.global],
    ]);
    if (recusa) return recusa;

    let contexto;
    try {
      contexto = await config.contexto(pedido.caminho);
    } catch {
      console.error("[assistente] não foi possível carregar o contexto do assistente");
      return responder({ ok: false, erro: "indisponivel" }, 503);
    }

    const mensagens: MensagemParaIa[] = pedido.mensagens.map((m): MensagemParaIa => ({
      role: m.papel,
      content: m.texto,
    }));
    const ultimaMensagem = pedido.mensagens[pedido.mensagens.length - 1]!.texto;
    const orientacoes = orientacoesParaMensagem(ultimaMensagem, await orientacoesAtivas());

    return new Response(
      responderComIa({
        config: config.ia,
        mensagens,
        sistema: (extra) =>
          instrucoesDaIa({
            perfil: contexto.perfil,
            estilo: contexto.estilo,
            conhecimento: contexto.conhecimento,
            caminho: pedido.caminho,
            ...extra,
          }),
        ultimaMensagem,
        descricaoDaEmpresa: contexto.perfil.descricao,
        perguntasDaEquipa: contexto.perguntasDaEquipa,
        orientacoes,
        permitirPesquisa: async () => {
          try {
            return (await config.limite(`assistente:pesquisa:${ip}`, limites.pesquisasPorIp)).permitido;
          } catch {
            return false;
          }
        },
        ...(config.pesquisar ? { pesquisar: config.pesquisar } : {}),
        sinal: req.signal,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      },
    );
  }

  /** As escritas do visitante (guardar a conversa, avaliar, preencher um formulário): mesmo site, JSON, tamanho e taxa. */
  async function escrever(
    req: Request,
    tipo: string,
    tratar: (corpo: unknown, metodo: string) => Promise<Response>,
  ): Promise<Response> {
    const recusa = await limitar([[`assistente:${tipo}:${enderecoDoPedido(req.headers)}`, limites.escritas]]);
    if (recusa) return recusa;
    const corpo = await lerCorpo(req, TAMANHO_DA_ESCRITA);
    if (!corpo.ok) return responder({ ok: false, erro: corpo.erro }, corpo.estado);
    try {
      return await tratar(corpo.corpo, req.method);
    } catch {
      console.error(`[assistente] não foi possível tratar o pedido «${tipo}»`);
      return responder({ ok: false, erro: "interno" }, 500);
    }
  }

  const conversa = (req: Request) =>
    escrever(req, "conversa", async (corpo, metodo) => {
      if (metodo === "DELETE") {
        const id = (corpo as { id?: unknown } | null)?.id;
        if (typeof id !== "string" || !ID_DE_CONVERSA.test(id)) return responder({ ok: false, erro: "invalido" }, 400);
        await repositorio.apagarConversa(id.toLowerCase());
        return responder({ ok: true });
      }
      const validado = validarRegistoDeConversa(corpo);
      if (!validado.ok) return responder({ ok: false, erro: validado.erro }, 400);
      const r = await repositorio.guardarMensagens(validado.registo);
      return r === "cheia" ? responder({ ok: false, erro: "cheia" }, 409) : responder({ ok: true });
    });

  const avaliacao = (req: Request) =>
    escrever(req, "avaliacao", async (corpo, metodo) => {
      if (metodo === "DELETE") {
        const retirada = validarRetirada(corpo);
        if (!retirada) return responder({ ok: false, erro: "invalido" }, 400);
        await repositorio.retirarAvaliacao(retirada.conversa, retirada.mensagem);
        return responder({ ok: true });
      }
      const validada = validarAvaliacao(corpo);
      if (!validada.ok) return responder({ ok: false, erro: validada.erro }, 400);
      await repositorio.guardarAvaliacao(validada.avaliacao);
      return responder({ ok: true });
    });

  const formulario = (req: Request) =>
    escrever(req, "formulario", async (corpo) => {
      const validado = validarFormularioEnviado(corpo);
      if (!validado.ok) return responder({ ok: false, erro: validado.erro }, 400);
      await repositorio.guardarFormulario(validado.formulario);
      return responder({ ok: true });
    });

  /** Dá um título curto à conversa (para o histórico do navegador). Sem IA ou se falhar, o navegador usa as palavras da conversa. */
  async function titulo(req: Request): Promise<Response> {
    if (!config.ia) return responder({ ok: false, erro: "indisponivel" }, 503);
    const recusa = await limitar([[`assistente:titulo:${enderecoDoPedido(req.headers)}`, limites.titulos]]);
    if (recusa) return recusa;
    const corpo = await lerCorpo(req, TAMANHO_DO_PEDIDO);
    if (!corpo.ok) return responder({ ok: false, erro: corpo.erro }, corpo.estado);
    const pedido = validarPedidoDeTitulo(corpo.corpo);
    if (!pedido.ok) return responder({ ok: false, erro: pedido.erro }, 400);
    const gerado = await gerarTitulo(config.ia, pedido.mensagens, req.signal);
    return gerado ? responder({ ok: true, titulo: gerado }) : responder({ ok: false, erro: "indisponivel" }, 503);
  }

  /** Com quem se está a falar: o que o projecto diz ou, por omissão, `ia` (se há IA) ou `offline`. */
  async function estado(req: Request): Promise<Response> {
    const recusa = await limitar([[`assistente:estado:${enderecoDoPedido(req.headers)}`, limites.leituras]]);
    if (recusa) return recusa;
    let modo: ModoDoAssistente = config.ia ? "ia" : "offline";
    let nome = "";
    if (config.estado) {
      try {
        const lido = await config.estado();
        modo = lerModo(typeof lido === "object" && lido !== null ? lido.modo : lido) ?? modo;
        if (typeof lido === "object" && lido !== null && modo === "humano" && typeof lido.nome === "string") {
          nome = lido.nome.trim().slice(0, 60);
        }
      } catch {
        console.warn("[assistente] não foi possível ler o estado do assistente");
      }
    }
    return responder(nome ? { ok: true, modo, nome } : { ok: true, modo });
  }

  async function despachar(
    req: Request,
    metodos: readonly string[],
    tratar: (req: Request) => Promise<Response>,
  ): Promise<Response> {
    if (!metodos.includes(req.method))
      return responder({ ok: false, erro: "metodo" }, 405, { Allow: metodos.join(", ") });
    if (!mesmaOrigem(req)) return responder({ ok: false, erro: "origem" }, 403);
    return tratar(req);
  }

  async function encaminhar(req: Request): Promise<Response> {
    let caminho: string;
    try {
      caminho = new URL(req.url).pathname.replace(/\/+$/, "");
    } catch {
      return responder({ ok: false, erro: "invalido" }, 400);
    }
    if (caminho === base) return despachar(req, ["POST"], perguntar);
    if (caminho === `${base}/conversa`) return despachar(req, ["POST", "DELETE"], conversa);
    if (caminho === `${base}/avaliacao`) return despachar(req, ["POST", "DELETE"], avaliacao);
    if (caminho === `${base}/formulario`) return despachar(req, ["POST"], formulario);
    if (caminho === `${base}/titulo`) return despachar(req, ["POST"], titulo);
    if (caminho === `${base}/estado`) return despachar(req, ["POST"], estado);
    return responder({ ok: false, erro: "nao-encontrado" }, 404);
  }

  return {
    rotas: { GET: encaminhar, POST: encaminhar, DELETE: encaminhar },
    repositorio,
    esquecerOrientacoes: () => {
      cache = null;
    },
  };
}
