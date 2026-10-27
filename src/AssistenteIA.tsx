"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type ElementType,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { MOTIVOS_DE_MA, type MotivoDeMa, type Nota } from "./nucleo/avaliacoes";
import {
  botaoRepetido,
  escolherPergunta,
  LIMITES_DO_CHAT,
  perguntasPorFazer,
  temBotaoNaResposta,
  type MensagemDoChat,
} from "./nucleo/chat";
import {
  juntarTextos,
  lerModo,
  textosPadrao,
  type ConteudoDoAssistente,
  type ModoDoAssistente,
  type TextosParciais,
} from "./nucleo/conteudo";
import { dataDeEnvio } from "./nucleo/data";
import {
  respostasEmTexto,
  TIPOS_DE_CAMPO,
  type EsquemaDoFormulario,
  type RespostaLimpa,
  type ValorBruto,
} from "./nucleo/formulario";
import {
  aplicarEventoAoRaciocinio,
  concluirRaciocinio,
  formaDoRaciocinio,
  raciocinioInicial,
  validarRaciocinio,
  type PassoDoRaciocinio,
  type Raciocinio,
} from "./nucleo/pensar";
import {
  guardarEntrada,
  lerHistorico,
  mensagensParaTitulo,
  removerEntrada,
  renomearEntrada,
  titularPelaIa,
  tituloPelasPalavras,
  type EntradaDoHistorico,
} from "./nucleo/historico";
import { textoDaPrevia } from "./nucleo/previa";
import { contarCartoesNoTexto, paragrafosSimples, textoSimples } from "./nucleo/resposta-rica";
import { Avaliar, type AvaliacaoLocal } from "./cliente/Avaliar";
import { FormularioDoChat } from "./cliente/FormularioDoChat";
import { HistoricoDoChat, type ItemDoHistorico } from "./cliente/HistoricoDoChat";
import { Carregar } from "./cliente/Carregar";
import { ContextoDoCarregar } from "./cliente/contexto";
import type { AnexosDoAssistente, ItemDoMenuExtra } from "./cliente/extensoes";
import { transporteNdjson, type MensagemRemota, type TransporteDoAssistente } from "./cliente/transporte";
import { MensagemEmFila } from "./cliente/MensagemEmFila";
import {
  IconeCima,
  IconeClipe,
  IconeConversa,
  IconeFechar,
  IconeInfo,
  IconeLixo,
  IconeSetaDiagonal,
} from "./cliente/icones";
import { MenuDoChat } from "./cliente/MenuDoChat";
import { Pensar } from "./cliente/Pensar";
import { Resposta, type FonteDaResposta } from "./cliente/Resposta";
import { BalaoDaResposta, IconeDoBotaoAEscrever } from "./cliente/BalaoDoChat";
import { ATRASO_PADRAO_MS, useForaDaHero } from "./cliente/useDepoisDaHero";
import "./estilos/assistente.css";

type Fonte = FonteDaResposta;
type Mensagem = {
  id: number;
  de: "bot" | "eu";
  texto: string;
  em: number;
  fontes?: Fonte[];
  /** O raciocínio da resposta (só nas respostas a perguntas da pessoa) e o que ela disse da resposta. */
  raciocinio?: Raciocinio;
  avaliacao?: AvaliacaoLocal;
  /** As respostas ao formulário que a IA pôs nesta mensagem, depois de enviadas. */
  formulario?: { respostas: RespostaLimpa[] };
  /** Os cartões do projecto que a resposta traz (objectos, fotografias, reservas…): o módulo guarda-os, o projecto desenha-os. */
  cartoes?: unknown[];
  /** O anexo que a pessoa enviou com esta mensagem (o projecto desenha a prévia). */
  anexo?: unknown;
};

/** O que se guarda na sessão (sessionStorage): a conversa continua se a página recarregar e acaba quando o separador fecha. */
type Guardado = {
  mensagens: Mensagem[];
  /** Quantos convites (balões que chamam a atenção) já se mostraram. Não são mensagens: não entram na conversa. */
  convites: number;
  /** A bolinha amarela: há um convite por ver. */
  ponto: boolean;
  abertura: boolean;
  feitas: number[];
  /** Até quando a IA fica de lado (depois de falhar) e se responde só com as perguntas prontas. */
  recuoAte: number;
  /** A pessoa fechou o convite: o assistente deixa de chamar a atenção. */
  silencio: boolean;
  seq: number;
  /** O identificador desta conversa (para a equipa a guardar, se a pessoa autorizar). */
  conversa: string;
  /** A autorização para guardar a conversa: ainda por perguntar, dada ou recusada. */
  guardar: "pergunta" | "sim" | "nao";
  /** Quantas mensagens já foram enviadas à equipa. */
  enviadas: number;
};

/** Um identificador novo para a conversa (aleatório; só o navegador da pessoa o conhece). */
function novoId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const vazio = (): Guardado => ({
  mensagens: [],
  convites: 0,
  ponto: false,
  abertura: false,
  feitas: [],
  recuoAte: 0,
  silencio: false,
  seq: 0,
  conversa: "",
  guardar: "pergunta",
  enviadas: 0,
});

/** Quanto tempo depois de a página estar pronta (e depois do convite anterior) o assistente chama a atenção, e quanto o convite fica à vista. */
const ESPERA_DOS_CONVITES_MS = [5_000, 30_000, 70_000] as const;
const CONVITE_A_VISTA_MS = 10_000;
const MAXIMO_GUARDADAS = 40;
/** Depois de uma falha da IA responde-se só com as perguntas prontas durante este tempo (e 5 minutos se for o limite de mensagens). */
const RECUO_MS = 90_000;
const RECUO_DO_LIMITE_MS = 5 * 60_000;
const ESPERA_MAXIMA_DA_IA_MS = 70_000;
/** O verificador de respostas: de quanto em quanto tempo vê se a última mensagem é uma pergunta sem resposta; e quanto tempo uma resposta pode estar «presa». */
const VERIFICACAO_DAS_RESPOSTAS_MS = 4_000;
const RESPOSTA_PRESA_MS = ESPERA_MAXIMA_DA_IA_MS + 20_000;
/** De quanto em quanto tempo o chat aberto pergunta ao servidor com quem se está a falar. */
const ESPERA_DO_ESTADO_MS = 45_000;
/** Quanto se puxa a conversa, no máximo, para ver a hora (em píxeis): para a esquerda mostra a hora do que a pessoa escreveu; para a direita, a fotografia e a hora do assistente. */
const RESERVA_ESQUERDA = 56;
const RESERVA_DIREITA = 52;

function lerAvaliacaoLocal(v: unknown): AvaliacaoLocal | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const { sentido, nota, motivos, comentario } = v as Record<string, unknown>;
  if (
    (sentido !== "boa" && sentido !== "ma") ||
    typeof nota !== "number" ||
    !Number.isInteger(nota) ||
    nota < 1 ||
    nota > 5
  ) {
    return undefined;
  }
  return {
    sentido,
    nota: nota as Nota,
    motivos: Array.isArray(motivos)
      ? motivos.filter(
          (m): m is MotivoDeMa => typeof m === "string" && (MOTIVOS_DE_MA as readonly string[]).includes(m),
        )
      : [],
    comentario: typeof comentario === "string" ? comentario.slice(0, 500) : "",
  };
}

function lerFormularioLocal(v: unknown): { respostas: RespostaLimpa[] } | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const bruto = (v as { respostas?: unknown }).respostas;
  if (!Array.isArray(bruto)) return undefined;
  const respostas: RespostaLimpa[] = [];
  for (const r of bruto.slice(0, 12)) {
    const { campo, rotulo, tipo, texto, numero, opcoes } = (r ?? {}) as Record<string, unknown>;
    if (typeof campo !== "string" || typeof rotulo !== "string" || typeof texto !== "string") continue;
    if (typeof tipo !== "string" || !(TIPOS_DE_CAMPO as readonly string[]).includes(tipo)) continue;
    respostas.push({
      campo,
      rotulo: rotulo.slice(0, 160),
      tipo: tipo as RespostaLimpa["tipo"],
      texto: texto.slice(0, 300),
      numero: typeof numero === "number" && Number.isFinite(numero) ? numero : null,
      opcoes: Array.isArray(opcoes) ? opcoes.filter((o): o is string => typeof o === "string").slice(0, 8) : [],
    });
  }
  return respostas.length > 0 ? { respostas } : undefined;
}

/** Valida uma conversa guardada (a da sessão ou uma do histórico): o que vem do armazenamento nunca se confia. */
function validarGuardado(j: Partial<Guardado> | null | undefined): Guardado {
  try {
    if (typeof j !== "object" || j === null) return vazio();
    if (!Array.isArray(j.mensagens) || !Array.isArray(j.feitas)) return vazio();
    const mensagens = j.mensagens
      .filter(
        (m): m is Mensagem =>
          !!m && typeof m.id === "number" && (m.de === "bot" || m.de === "eu") && typeof m.texto === "string",
      )
      .map((m): Mensagem => {
        const raciocinio = validarRaciocinio(m.raciocinio);
        const avaliacao = lerAvaliacaoLocal(m.avaliacao);
        const formulario = lerFormularioLocal(m.formulario);
        const cartoes = Array.isArray(m.cartoes)
          ? m.cartoes.filter((c) => typeof c === "object" && c !== null).slice(0, 8)
          : [];
        const anexo = typeof m.anexo === "object" && m.anexo !== null ? m.anexo : undefined;
        return {
          id: m.id,
          de: m.de,
          texto: m.texto,
          em: typeof m.em === "number" ? m.em : Date.now(),
          ...(Array.isArray(m.fontes) ? { fontes: m.fontes } : {}),
          ...(raciocinio ? { raciocinio } : {}),
          ...(avaliacao ? { avaliacao } : {}),
          ...(formulario ? { formulario } : {}),
          ...(cartoes.length > 0 ? { cartoes } : {}),
          ...(anexo ? { anexo } : {}),
        };
      })
      .slice(-MAXIMO_GUARDADAS);
    return {
      mensagens,
      convites: Math.max(0, Number(j.convites) || 0),
      ponto: j.ponto === true,
      abertura: j.abertura === true,
      feitas: j.feitas.filter((n): n is number => typeof n === "number"),
      recuoAte: Number(j.recuoAte) || 0,
      silencio: j.silencio === true,
      seq: Math.max(0, Number(j.seq) || 0, ...mensagens.map((m) => m.id)),
      conversa: typeof j.conversa === "string" ? j.conversa : "",
      guardar: j.guardar === "sim" || j.guardar === "nao" ? j.guardar : "pergunta",
      enviadas: Math.max(0, Math.min(Number(j.enviadas) || 0, mensagens.length)),
    };
  } catch {
    return vazio();
  }
}

function lerGuardado(chave: string): Guardado {
  try {
    const bruto = sessionStorage.getItem(chave);
    return bruto ? validarGuardado(JSON.parse(bruto) as Partial<Guardado>) : vazio();
  } catch {
    return vazio();
  }
}

const esperar = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const segundosDesde = (inicio: number): number => Math.max(0, Math.round((Date.now() - inicio) / 1000));

/** O avatar do assistente: o que o projecto pôs (uma fotografia) ou, sem isso, o cinzento 3D com a silhueta (como quem não tem foto de perfil). */
function Avatar({ avatar }: { avatar: ReactNode }): ReactElement {
  if (avatar) return <span className="aia-avatar">{avatar}</span>;
  return (
    <span className="aia-avatar aia-avatar-3d" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="aia-silhueta">
        <circle cx="22" cy="17" r="7.5" />
        <path d="M6 44c0-10 7-15.5 16-15.5S38 34 38 44Z" />
      </svg>
    </span>
  );
}

export type PropsDoAssistenteIA = {
  /** O conteúdo: textos da interface, perguntas e respostas prontas, convites… (`ConteudoDoAssistente`). */
  dados: ConteudoDoAssistente;
  /** Muda (ou traduz) os textos do raciocínio, da avaliação e dos formulários; os que faltam ficam em português. */
  textos?: TextosParciais;
  /** O caminho das rotas do servidor (por omissão `/api/assistente`). */
  endpoint?: string;
  /** As páginas do site para onde uma resposta pode ligar (por omissão só a raiz). */
  paginas?: readonly string[];
  /** A fotografia do assistente (um elemento, por exemplo `<img>`); sem ela, a silhueta cinzenta 3D. */
  avatar?: ReactNode;
  /** O componente das ligações para páginas do site (por omissão `a`; no Next, `next/link`). */
  Ligacao?: ElementType;
  /** O elemento da hero: o chat só aparece depois de a pessoa a passar. Sem ele, depois de descer 40 % do ecrã; com `false`, está sempre à vista. */
  seletorDaHero?: string | false;
  /** Quanto o botão espera depois de a hero ficar para trás (por omissão 300 ms). */
  atrasoMs?: number;
  /** A chave da conversa no navegador (sessionStorage); mude-a se o projecto tiver mais de um assistente. */
  chaveDeSessao?: string;
  /** Como se pergunta à IA (por omissão um POST em `endpoint` com a resposta em NDJSON; ver `cliente/transporte.ts`). */
  transporte?: TransporteDoAssistente;
  /** Desenha um cartão do projecto que a resposta traz (`mensagem` é o número da mensagem). Sem isto, os cartões não se mostram. */
  cartao?: (cartao: unknown, mensagem: number) => ReactNode;
  /** O loading do projecto, no lugar dos nove quadrados do módulo. */
  Carregar?: ComponentType<{ rotulo: string }>;
  /** O botão de enviar do projecto (um `<button type="submit">`), no lugar do redondo do módulo; `desativado` quando não há nada escrito. */
  BotaoDeEnviar?: ComponentType<{ rotulo: string; desativado: boolean }>;
  /** Anexar ficheiros de qualquer formato (o botão do clipe, largar em cima do chat, colar). */
  anexos?: AnexosDoAssistente;
  /** Itens do projecto no menu do cabeçalho (por exemplo, ligar à recepção). */
  itensDoMenu?: readonly ItemDoMenuExtra[];
  /** Para onde leva o termo pesquisado, com `{q}` no lugar dele (por exemplo um motor de pesquisa). Sem isto, o termo não é uma ligação. */
  modeloDaPesquisa?: string;
  /** O projecto já guarda as conversas por conta própria: o chat não pergunta «Posso guardar esta conversa?». */
  semAutorizacao?: boolean;
};

/**
 * O assistente do site, numa chamada: `<AssistenteIA dados={conteudo} />`. Um chat em baixo, à direita, em todas as páginas. Fala com a IA
 * (rotas de servidor/criar.ts) — um assistente persuasivo que toma a iniciativa, faz perguntas, pesquisa na web e mostra as fontes — e, se a
 * IA não estiver disponível, responde com as perguntas e respostas prontas da equipa. Mostra o raciocínio («A pensar…» e, depois, «Pensou
 * durante N s» com a cadeia de pensamento), deixa avaliar cada resposta, desenha os formulários que a IA pedir e só guarda a conversa se a
 * pessoa autorizar de forma expressa. Com o chat fechado, uma bolinha amarela e um balão chamam a atenção — não são mensagens da conversa.
 *
 * A conversa vive em `gRef` (a fonte de verdade, para as funções assíncronas nunca lerem estado velho) e espelha-se em `g` para
 * desenhar; guarda-se na sessão.
 */
export function AssistenteIA({
  dados,
  textos: textosDoProjecto,
  endpoint = "/api/assistente",
  paginas = ["/"],
  avatar,
  Ligacao = "a",
  seletorDaHero,
  atrasoMs = ATRASO_PADRAO_MS,
  chaveDeSessao = "aia-v1",
  transporte: transporteDoProjecto,
  cartao,
  Carregar: CarregarDoProjecto,
  anexos,
  itensDoMenu = [],
  modeloDaPesquisa,
  semAutorizacao = false,
  BotaoDeEnviar,
}: PropsDoAssistenteIA): ReactElement | null {
  const textos = useMemo(() => juntarTextos(textosPadrao, textosDoProjecto), [textosDoProjecto]);
  const opcoesDaResposta = useMemo(() => ({ paginas }), [paginas]);
  const base = endpoint.replace(/\/+$/, "");
  const transporte = useMemo(() => transporteDoProjecto ?? transporteNdjson(base), [transporteDoProjecto, base]);

  const [carregado, setCarregado] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [g, setG] = useState<Guardado>(vazio);
  const [escrevendo, setEscrevendo] = useState(false);
  /** O raciocínio da resposta que está a chegar (os passos até agora): é o «A pensar…». */
  const [pensando, setPensando] = useState<{ passos: PassoDoRaciocinio[]; inicio: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [entrada, setEntrada] = useState("");
  const [convite, setConvite] = useState(false);
  /** O botão «i»: com ele ligado, a data e a hora de todas as mensagens ficam sempre à vista (sem puxar a conversa). */
  const [datasVisiveis, setDatasVisiveis] = useState(false);
  /** Até que mensagem a pessoa já viu com o chat aberto (o que vem depois, com o chat fechado, aparece em resumo no balão) e qual dispensou. */
  const [vistaAte, setVistaAte] = useState(0);
  const [previaDispensada, setPreviaDispensada] = useState(0);
  const [nota, setNota] = useState("");
  /** Um ficheiro a ser enviado (o projecto envia-o): o nome e quanto já foi. */
  const [envio, setEnvio] = useState<{ nome: string; progresso: number } | null>(null);
  const [aLargar, setALargar] = useState(false);
  const ficheiroRef = useRef<HTMLInputElement>(null);
  /** O menu (hambúrguer) do cabeçalho e o que o chat mostra: a conversa ou o histórico. */
  const [menuAberto, setMenuAberto] = useState(false);
  const [vista, setVista] = useState<"conversa" | "historico">("conversa");
  /** O histórico de conversas deste aparelho (localStorage). */
  const [conversasGuardadas, setConversasGuardadas] = useState<EntradaDoHistorico[]>([]);
  /** Com quem se está a falar: o que o servidor diz e, por cima, a IA ter falhado (recuo para as perguntas prontas). */
  const [modoDoServidor, setModoDoServidor] = useState<ModoDoAssistente>("ia");
  /** O nome de quem da equipa responde (só com o modo `humano`): aparece no balão do chat fechado em vez de «I.A.». */
  const [nomeDeQuemResponde, setNomeDeQuemResponde] = useState("");
  const [iaCaiu, setIaCaiu] = useState(false);
  /** A fonte que a pessoa pediu para ver (clicou na bola dela no texto): o raciocínio dessa mensagem abre-se nela. */
  const [fonteVista, setFonteVista] = useState<{ mensagem: number; n: number } | null>(null);

  const gRef = useRef<Guardado>(vazio());
  /**
   * As mensagens que a pessoa escreveu enquanto o assistente ainda trabalhava noutra (a pensar, a pesquisar, a escrever): ficam em FILA,
   * por baixo da resposta e com o loading, até ele a acabar. Então entram na conversa (é aí que ele as vê) e respondem-se de seguida,
   * todas de uma vez; o loading só desaparece nesse momento.
   */
  const [fila, setFila] = useState<{ id: number; texto: string }[]>([]);
  const filaRef = useRef<{ id: number; texto: string }[]>([]);
  /** As mensagens que acabaram de sair da fila: o loading delas sai a animar (e só depois desaparece). */
  const [saindoDaFila, setSaindoDaFila] = useState<number[]>([]);
  const seqDaFila = useRef(0);
  const mudarFila = (f: (atual: { id: number; texto: string }[]) => { id: number; texto: string }[]) => {
    filaRef.current = f(filaRef.current);
    setFila(filaRef.current);
  };
  const raciocinioEmCurso = useRef<{ passos: PassoDoRaciocinio[]; inicio: number } | null>(null);
  const vivo = useRef(true);
  const raiz = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const faixa = useRef<HTMLDivElement>(null);
  const arrastoFaixa = useRef<{ x: number; rolagem: number; arrastou: boolean } | null>(null);
  const arrastoLista = useRef<{ x: number; y: number; modo: "" | "h" | "v" } | null>(null);
  const abriuAntes = useRef(false);
  const cancelarPedido = useRef<AbortController | null>(null);
  /** O verificador de respostas: há uma resposta a caminho (e desde quando) e quantas vezes já se tentou responder a cada pergunta. */
  const respondendo = useRef(false);
  const inicioDaResposta = useRef(0);
  const tentativasDeResposta = useRef(new Map<number, number>());
  const responderRef = useRef<(texto: string, indice: number | undefined, soProntas?: boolean) => Promise<void>>(
    async () => {},
  );
  const historicoRef = useRef<EntradaDoHistorico[]>([]);
  const titulosPedidos = useRef(new Set<string>());
  const botaoDoMenu = useRef<HTMLButtonElement>(null);

  const atualizar = useCallback((fn: (anterior: Guardado) => Guardado) => {
    gRef.current = fn(gRef.current);
    setG(gRef.current);
  }, []);

  const acrescentar = useCallback(
    (
      de: Mensagem["de"],
      texto: string,
      fontes?: Fonte[],
      raciocinio?: Raciocinio,
      extra?: Pick<Mensagem, "cartoes" | "anexo">,
    ): number => {
      const id = gRef.current.seq + 1;
      atualizar((a) => ({
        ...a,
        seq: id,
        mensagens: [
          ...a.mensagens,
          {
            id,
            de,
            texto,
            em: Date.now(),
            ...(fontes?.length ? { fontes } : {}),
            ...(raciocinio ? { raciocinio } : {}),
            ...(extra?.cartoes?.length ? { cartoes: extra.cartoes } : {}),
            ...(extra?.anexo ? { anexo: extra.anexo } : {}),
          },
        ].slice(-MAXIMO_GUARDADAS),
      }));
      return id;
    },
    [atualizar],
  );

  const mudarTexto = useCallback(
    (id: number, texto: string) =>
      atualizar((a) => ({ ...a, mensagens: a.mensagens.map((m) => (m.id === id ? { ...m, texto } : m)) })),
    [atualizar],
  );

  const mudarMensagem = useCallback(
    (id: number, mudanca: (m: Mensagem) => Mensagem) =>
      atualizar((a) => ({ ...a, mensagens: a.mensagens.map((m) => (m.id === id ? mudanca(m) : m)) })),
    [atualizar],
  );

  /** Muda o histórico deste aparelho e guarda-o (localStorage; se não houver, só dura enquanto a página não recarregar). */
  const mudarHistorico = useCallback(
    (fn: (lista: EntradaDoHistorico[]) => EntradaDoHistorico[]) => {
      historicoRef.current = fn(historicoRef.current);
      setConversasGuardadas(historicoRef.current);
      try {
        localStorage.setItem(`${chaveDeSessao}-historico`, JSON.stringify(historicoRef.current));
      } catch {
        // localStorage indisponível ou cheio: o histórico só dura enquanto a página não recarregar
      }
    },
    [chaveDeSessao],
  );

  /** Apaga no servidor a cópia de uma conversa que a pessoa tinha autorizado guardar. */
  const apagarNoServidor = useCallback(
    async (id: string) => {
      try {
        await fetch(`${base}/conversa`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } catch {
        // sem rede: a conversa antiga não volta a receber mensagens (o identificador mudou ou a conversa foi apagada daqui)
      }
    },
    [base],
  );

  // a conversa guardada na sessão (só no navegador: no servidor não se desenha nada)
  useEffect(() => {
    vivo.current = true;
    const guardado = lerGuardado(chaveDeSessao);
    if (!guardado.conversa) guardado.conversa = novoId();
    gRef.current = guardado;
    setG(guardado);
    try {
      const bruto = localStorage.getItem(`${chaveDeSessao}-historico`);
      historicoRef.current = bruto ? lerHistorico(JSON.parse(bruto)) : [];
    } catch {
      historicoRef.current = [];
    }
    setConversasGuardadas(historicoRef.current);
    setVistaAte(guardado.mensagens[guardado.mensagens.length - 1]?.id ?? 0);
    setCarregado(true);
    return () => {
      vivo.current = false;
      cancelarPedido.current?.abort();
    };
  }, [chaveDeSessao]);

  useEffect(() => {
    if (!carregado) return;
    try {
      sessionStorage.setItem(chaveDeSessao, JSON.stringify(g));
    } catch {
      // sessionStorage indisponível: a conversa só dura enquanto a página não recarregar
    }
  }, [g, carregado, chaveDeSessao]);

  // o botão só aparece quando a pessoa NÃO está na hero (a primeira vista do site é só a hero): a primeira vez espera o atraso e, daí em
  // diante, sai a animar sempre que ela volta à hero e regressa quando sai dela. O chat aberto não se fecha (a conversa é dela).
  const foraDaHero = useForaDaHero(seletorDaHero);
  useEffect(() => {
    if (!foraDaHero) return;
    const relogio = window.setTimeout(() => setPronto(true), atrasoMs);
    return () => window.clearTimeout(relogio);
  }, [foraDaHero, atrasoMs]);
  const visivel = pronto && foraDaHero;

  // chamar a atenção: com o chat fechado e a conversa por começar, a bolinha amarela e o balão aparecem (até três vezes). NÃO é uma
  // mensagem: nada vai para a conversa, que só começa quando a pessoa abre o chat.
  const conversou = g.mensagens.some((m) => m.de === "eu");
  useEffect(() => {
    if (!visivel || !carregado || aberto || g.silencio || conversou) return;
    if (g.convites >= dados.convites.length) return;
    let relogio = 0;
    const mostrar = () => {
      if (document.visibilityState !== "visible") {
        relogio = window.setTimeout(mostrar, 3_000);
        return;
      }
      atualizar((a) => ({ ...a, ponto: true, convites: a.convites + 1 }));
      setConvite(true);
    };
    relogio = window.setTimeout(mostrar, ESPERA_DOS_CONVITES_MS[g.convites] ?? 70_000);
    return () => window.clearTimeout(relogio);
  }, [visivel, carregado, aberto, g.silencio, conversou, g.convites, dados.convites, atualizar]);

  // o balão fica à vista um bocado e depois só fica a bolinha
  useEffect(() => {
    if (!convite) return;
    const relogio = window.setTimeout(() => setConvite(false), CONVITE_A_VISTA_MS);
    return () => window.clearTimeout(relogio);
  }, [convite, g.convites]);

  // com quem se está a falar, ao vivo: o servidor diz (a IA, uma pessoa da equipa ou ninguém) e pergunta-se de tempos a tempos enquanto
  // o chat está aberto; se a IA falhar (recuo), diz-se logo «offline» até ela voltar
  useEffect(() => {
    if (!aberto) return;
    let activo = true;
    const consultar = async () => {
      try {
        const resposta = await fetch(`${base}/estado`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!activo) return;
        if (resposta.status === 503) return setModoDoServidor("offline");
        if (!resposta.ok) return;
        const lido = (await resposta.json()) as { modo?: unknown; nome?: unknown };
        const modo = lerModo(lido.modo);
        if (activo && modo) {
          setModoDoServidor(modo);
          setNomeDeQuemResponde(typeof lido.nome === "string" ? lido.nome : "");
        }
      } catch {
        // sem rede: fica o que estava
      }
    };
    void consultar();
    const relogio = window.setInterval(() => void consultar(), ESPERA_DO_ESTADO_MS);
    return () => {
      activo = false;
      window.clearInterval(relogio);
    };
  }, [aberto, base]);

  useEffect(() => {
    const falta = g.recuoAte - Date.now();
    if (falta <= 0) {
      setIaCaiu(false);
      return;
    }
    setIaCaiu(true);
    const relogio = window.setTimeout(() => setIaCaiu(false), falta);
    return () => window.clearTimeout(relogio);
  }, [g.recuoAte]);

  // o histórico: a conversa em curso guarda-se neste aparelho (só depois de a pessoa escrever; com a IA a escrever espera-se que acabe)
  useEffect(() => {
    if (!carregado || !g.mensagens.some((m) => m.de === "eu")) return;
    const espera = window.setTimeout(
      () => {
        const a = gRef.current;
        const ultima = a.mensagens[a.mensagens.length - 1];
        if (!ultima) return;
        mudarHistorico((lista) => {
          const existente = lista.find((e) => e.id === a.conversa);
          return guardarEntrada(lista, {
            id: a.conversa,
            titulo:
              existente?.titulo ??
              tituloPelasPalavras(
                a.mensagens.filter((m) => m.de === "eu").map((m) => m.texto),
                textos.historico.semTitulo,
              ),
            origem: existente?.origem ?? "palavras",
            atualizada: ultima.em,
            estado: a,
          });
        });
      },
      ocupado ? 1500 : 400,
    );
    return () => window.clearTimeout(espera);
  }, [g, ocupado, carregado, mudarHistorico, textos.historico.semTitulo]);

  // o título da conversa: depois da primeira resposta da IA pede-se-lhe um título curto; sem IA (ou se falhar) fica o das palavras
  useEffect(() => {
    if (!carregado || ocupado) return;
    const entrada = conversasGuardadas.find((e) => e.id === g.conversa);
    if (!entrada || entrada.origem !== "palavras" || titulosPedidos.current.has(entrada.id)) return;
    const ultima = g.mensagens[g.mensagens.length - 1];
    const daIa =
      ultima?.de === "bot" &&
      !!ultima.texto &&
      !!ultima.raciocinio &&
      !ultima.raciocinio.passos.some((p) => p.chave === "prontas");
    if (!daIa) return;
    titulosPedidos.current.add(entrada.id);
    void (async () => {
      try {
        const resposta = await fetch(`${base}/titulo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensagens: mensagensParaTitulo(g.mensagens) }),
        });
        if (!resposta.ok || !vivo.current) return;
        const titulo = ((await resposta.json()) as { titulo?: unknown }).titulo;
        if (typeof titulo === "string" && vivo.current) mudarHistorico((l) => titularPelaIa(l, entrada.id, titulo));
      } catch {
        // sem rede ou sem IA: fica o título feito das palavras
      }
    })();
  }, [conversasGuardadas, g, ocupado, carregado, base, mudarHistorico]);
  // uma nota curta (por exemplo «a conversa foi apagada») desaparece sozinha
  useEffect(() => {
    if (!nota) return;
    const relogio = window.setTimeout(() => setNota(""), 6_000);
    return () => window.clearTimeout(relogio);
  }, [nota]);

  // no telemóvel o chat ocupa o ecrã todo e a página por baixo não rola. É como o Modo IA do Google: o meta viewport diz
  // `interactive-widget=resizes-content` (o teclado encolhe a área da página) e o painel está colado ao topo e ao fundo dela, por isso a
  // escrita fica encostada ao teclado, sem espaço de mais por baixo, e a conversa NÃO se mexe (não rola; só perde o que fica por baixo da
  // escrita, que a esbate). Nenhuma conta: só, nos navegadores que não encolhem a área (o iPhone), o painel passa a ser a parte visível
  // (`visualViewport`). Ao escrever uma avaliação, tudo o que não é dela (perguntas prontas e escrita) esconde-se. Com `?aia-debug=1` na
  // morada, escreve-se no painel o que o navegador diz (para perceber um telemóvel que se porte de modo estranho).
  useEffect(() => {
    if (!aberto) {
      // rede de segurança: com o chat fechado a página nunca fica bloqueada por ele (o que o chat bloqueou leva uma marca)
      const r = document.documentElement;
      if (r.dataset.aiaBloqueio === "sim") {
        r.style.overflow = "";
        delete r.dataset.aiaBloqueio;
      }
      return;
    }
    const pequeno = window.matchMedia("(max-width: 39.99rem)");
    const el = painel.current;
    const vv = window.visualViewport;
    const raiz = document.documentElement;
    // O estado de origem do scroll. Um «hidden» que já lá esteja é um bloqueio que ficou preso (nunca o estado de origem): guardá-lo
    // devolvia-o ao fechar e a página deixava de rolar e de responder ao toque.
    const antes = raiz.dataset.aiaBloqueio === "sim" || raiz.style.overflow === "hidden" ? "" : raiz.style.overflow;
    // depois de fechar, nenhum ajuste atrasado (o foco a sair de uma caixa, o teclado a descer) volta a bloquear a página
    let vivo = true;
    let aAjustar = 0;
    // um site que não diga como o teclado se porta fica com o do Google (o projecto devia dizê-lo no próprio meta, de origem)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const metaAntes = meta?.getAttribute("content") ?? null;
    if (meta && metaAntes && pequeno.matches && !metaAntes.includes("interactive-widget")) {
      meta.setAttribute("content", `${metaAntes}, interactive-widget=resizes-content`);
    }
    const depurar = new URLSearchParams(window.location.search).has("aia-debug");
    let marca: HTMLElement | null = null;
    if (depurar && el) {
      marca = document.createElement("pre");
      marca.style.cssText =
        "position:absolute;left:4px;bottom:4px;z-index:99;margin:0;padding:2px 4px;font:10px/1.3 monospace;color:#fff;background:#c00;pointer-events:none;white-space:pre";
      el.appendChild(marca);
    }
    const limpar = () => {
      el?.style.removeProperty("top");
      el?.style.removeProperty("height");
      if (el) {
        el.dataset.teclado = "nao";
        el.dataset.escrita = "nao";
      }
    };
    const soltar = () => {
      raiz.style.overflow = antes;
      delete raiz.dataset.aiaBloqueio;
    };
    const ajustar = () => {
      if (!el || !vivo) return;
      if (!pequeno.matches || !vv) {
        limpar();
        soltar();
        return;
      }
      raiz.style.overflow = "hidden";
      raiz.dataset.aiaBloqueio = "sim";
      // a pessoa está a escrever numa caixa do chat: a das mensagens, a avaliação ou um formulário
      const ativo = document.activeElement;
      const campo =
        ativo && el.contains(ativo) && (ativo.tagName === "INPUT" || ativo.tagName === "TEXTAREA") ? ativo : null;
      const aEscrever = campo !== null;
      el.dataset.escrita = campo ? (campo.closest(".aia-avalia-cartao") ? "avaliacao" : "mensagem") : "nao";
      // o painel segue a parte visível enquanto o teclado está aberto (e enquanto fecha, até a janela voltar ao tamanho inteiro)
      const inteira = Math.abs(vv.height - window.innerHeight) < 2 && vv.offsetTop < 1;
      if ((aEscrever || !inteira) && vv.scale < 1.01) {
        el.style.top = `${Math.round(vv.offsetTop)}px`;
        el.style.height = `${Math.round(vv.height)}px`;
        el.dataset.teclado = "sim";
      } else {
        el.style.removeProperty("top");
        el.style.removeProperty("height");
        el.dataset.teclado = "nao";
      }
      // a caixa da avaliação nunca fica escondida: mora na conversa (que rola) e leva-se para a vista
      if (campo?.closest(".aia-lista") && el.dataset.teclado === "sim") campo.scrollIntoView({ block: "nearest" });
      if (marca) {
        const r = el.getBoundingClientRect();
        marca.textContent = `inner ${window.innerHeight} vv ${Math.round(vv.height)}/${Math.round(vv.offsetTop)} x${vv.scale}\npainel ${Math.round(r.top)}-${Math.round(r.bottom)} ${el.dataset.teclado}/${el.dataset.escrita}`;
      }
    };
    ajustar();
    vv?.addEventListener("resize", ajustar);
    vv?.addEventListener("scroll", ajustar);
    pequeno.addEventListener("change", ajustar);
    // ao sair de uma caixa o foco ainda não mudou: espera-se um instante
    const aoSairDeUmaCaixa = () => {
      window.clearTimeout(aAjustar);
      aAjustar = window.setTimeout(ajustar, 0);
    };
    el?.addEventListener("focusin", ajustar);
    el?.addEventListener("focusout", aoSairDeUmaCaixa);
    return () => {
      vivo = false;
      window.clearTimeout(aAjustar);
      vv?.removeEventListener("resize", ajustar);
      vv?.removeEventListener("scroll", ajustar);
      pequeno.removeEventListener("change", ajustar);
      el?.removeEventListener("focusin", ajustar);
      el?.removeEventListener("focusout", aoSairDeUmaCaixa);
      marca?.remove();
      if (meta && metaAntes !== null) meta.setAttribute("content", metaAntes);
      limpar();
      soltar();
    };
  }, [aberto]);
  // a conversa desce sozinha: suave quando chega uma mensagem, colada ao fundo enquanto a resposta vai crescendo
  const ultimo = g.mensagens[g.mensagens.length - 1];
  const passosAoVivo = pensando?.passos.length ?? 0;
  useEffect(() => {
    const el = lista.current;
    if (!el || !aberto) return;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduzido ? "auto" : "smooth" });
  }, [g.mensagens.length, fila.length, escrevendo, passosAoVivo, ocupado, aberto, g.guardar, g.conversa]);
  useEffect(() => {
    const el = lista.current;
    if (el && aberto) el.scrollTop = el.scrollHeight;
  }, [ultimo?.texto, aberto]);
  // quando o espaço de baixo cresce (as perguntas prontas aparecem depois da resposta, a escrita da avaliação esconde-se…) a conversa
  // encolhe: se estava colada ao fim continua colada, e «Esta resposta ajudou?» (ou a avaliação feita) não fica meio coberta pela base.
  // Com o teclado aberto nada se mexe (a conversa fica onde está). E enquanto o assistente trabalha (a pensar, a pesquisar, a escrever) a
  // conversa ACOMPANHA-O: desce sozinha com cada passo do pensamento, para a pessoa não ter de rolar a todo o momento — a não ser que ela
  // própria tenha rolado para cima (então deixa-se em paz).
  useEffect(() => {
    const el = lista.current;
    if (!el || !aberto || typeof ResizeObserver === "undefined") return;
    let noFim = true;
    const medir = () => {
      noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    const colar = () => {
      if (noFim && painel.current?.dataset.teclado !== "sim") el.scrollTop = el.scrollHeight;
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(colar);
    observador.observe(el);
    const acompanhar = ocupado
      ? window.setInterval(() => {
          if (noFim) el.scrollTop = el.scrollHeight;
        }, 100)
      : 0;
    return () => {
      el.removeEventListener("scroll", medir);
      observador.disconnect();
      window.clearInterval(acompanhar);
    };
  }, [aberto, ocupado]);
  // quando a pergunta da autorização aparece (e o espaço de baixo encolhe a conversa) a conversa volta a descer até ao fim
  const aPerguntar =
    aberto && g.abertura && !ocupado && !escrevendo && ultimo?.de === "bot" && g.guardar === "pergunta" && conversou;
  useEffect(() => {
    if (!aPerguntar) return;
    const relogio = window.setTimeout(() => {
      const el = lista.current;
      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 350);
    return () => window.clearTimeout(relogio);
  }, [aPerguntar]);

  useEffect(() => {
    if (aberto && !ocupado && ultimo) setVistaAte(ultimo.id);
  }, [aberto, ocupado, ultimo]);

  // clicar fora do chat fecha-o (no telemóvel o chat é o ecrã todo: não há «fora»)
  useEffect(() => {
    if (!aberto) return;
    const aoPremir = (e: globalThis.PointerEvent) => {
      if (window.matchMedia("(max-width: 39.99rem)").matches) return;
      const alvo = e.target as Node | null;
      if (!alvo || raiz.current?.contains(alvo)) return;
      setAberto(false);
      setMenuAberto(false);
      setVista("conversa");
    };
    document.addEventListener("pointerdown", aoPremir);
    return () => document.removeEventListener("pointerdown", aoPremir);
  }, [aberto]);

  // ao fechar o painel o foco volta ao botão (que só reaparece depois de o painel fechar)
  useEffect(() => {
    if (aberto) {
      abriuAntes.current = true;
    } else if (abriuAntes.current) {
      abriuAntes.current = false;
      botao.current?.focus();
    }
  }, [aberto]);

  // A roda do rato sobre o chat nunca rola a página por baixo: dentro de uma zona que rola, o `overscroll-behavior: contain` do CSS trata do fim
  // da zona; fora delas (o cabeçalho, a escrita, as margens) a roda não faz nada.
  useEffect(() => {
    const el = painel.current;
    if (!aberto || !el) return;
    const aoRolar = (e: WheelEvent) => {
      // ctrl + roda é o zoom do navegador
      if (e.ctrlKey) return;
      for (let n = e.target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        const estilo = getComputedStyle(n);
        const rolaNaVertical = /(auto|scroll)/.test(estilo.overflowY) && n.scrollHeight > n.clientHeight;
        const rolaDeLado = /(auto|scroll)/.test(estilo.overflowX) && n.scrollWidth > n.clientWidth;
        if (rolaNaVertical || (rolaDeLado && Math.abs(e.deltaX) > Math.abs(e.deltaY))) return;
      }
      e.preventDefault();
    };
    el.addEventListener("wheel", aoRolar, { passive: false });
    return () => el.removeEventListener("wheel", aoRolar);
  }, [aberto]);

  const escreverAbertura = useCallback(async () => {
    for (const texto of dados.abertura) {
      setEscrevendo(true);
      await esperar(900);
      if (!vivo.current) return;
      setEscrevendo(false);
      acrescentar("bot", texto);
      await esperar(350);
      if (!vivo.current) return;
    }
  }, [dados.abertura, acrescentar]);

  const abrir = () => {
    setAberto(true);
    setConvite(false);
    atualizar((a) => ({ ...a, ponto: false }));
    if (!gRef.current.abertura) {
      atualizar((a) => ({ ...a, abertura: true }));
      const remota = gRef.current.mensagens.length === 0 ? transporte.carregar?.() : undefined;
      if (remota) {
        // o servidor pode já ter a conversa (quem recarrega, ou volta de outro separador): continua onde estava; senão, as boas-vindas
        void remota
          .then((lidas: MensagemRemota[]) => {
            if (!vivo.current || gRef.current.mensagens.length > 0) return;
            if (lidas.length === 0) return void escreverAbertura();
            for (const r of lidas.slice(-MAXIMO_GUARDADAS)) {
              acrescentar(
                r.de,
                r.texto,
                r.fontes?.map(({ titulo, url }) => ({ titulo, url })),
                r.raciocinio,
                {
                  ...(r.cartoes?.length ? { cartoes: r.cartoes } : {}),
                  ...(r.anexo ? { anexo: r.anexo } : {}),
                },
              );
            }
          })
          .catch(() => void escreverAbertura());
      } else {
        void escreverAbertura();
      }
    }
    if (window.matchMedia("(pointer: fine)").matches) window.setTimeout(() => campo.current?.focus(), 320);
  };

  const fechar = () => {
    setAberto(false);
    setMenuAberto(false);
    setVista("conversa");
  };

  const fecharConvite = () => {
    setConvite(false);
    atualizar((a) => ({ ...a, silencio: true }));
  };

  // ─── guardar a conversa para a equipa (só com a autorização expressa da pessoa) ───────────────────────────────────────────

  /** Envia à equipa as mensagens que ainda não foram. Falhar não estraga nada: da próxima vez tenta outra vez. */
  const enviarParaEquipa = useCallback(async () => {
    const a = gRef.current;
    if (semAutorizacao || a.guardar !== "sim" || a.enviadas >= a.mensagens.length) return;
    const novas = a.mensagens.slice(a.enviadas);
    const total = a.mensagens.length;
    try {
      const resposta = await fetch(`${base}/conversa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: a.conversa,
          pagina: window.location.pathname,
          mensagens: novas.map((m) => ({
            papel: m.de === "eu" ? "user" : "assistant",
            texto: m.texto,
            em: m.em,
            ...(m.fontes ? { fontes: m.fontes } : {}),
            ...(m.raciocinio ? { raciocinio: m.raciocinio } : {}),
          })),
        }),
      });
      if (resposta.ok) atualizar((x) => ({ ...x, enviadas: Math.max(x.enviadas, total) }));
    } catch {
      // sem rede: fica para a próxima
    }
  }, [atualizar, base, semAutorizacao]);

  const decidirGuardar = (autoriza: boolean) => {
    atualizar((a) => ({ ...a, guardar: autoriza ? "sim" : "nao" }));
    if (autoriza) void enviarParaEquipa();
  };

  const pararEApagar = async () => {
    const id = gRef.current.conversa;
    const novo = novoId();
    atualizar((a) => ({ ...a, guardar: "nao", enviadas: 0, conversa: novo }));
    // o identificador mudou: a entrada do histórico (com o título, mesmo o que a pessoa escreveu) passa para o novo
    mudarHistorico((l) => l.map((e) => (e.id === id ? { ...e, id: novo } : e)));
    await apagarNoServidor(id);
    if (vivo.current) setNota(dados.conversa.apagada);
  };

  // ─── o menu do chat e o histórico de conversas (neste aparelho) ─────────────────────────────────────────────────────────────

  /** Põe o chat numa conversa nova e vazia (o que já se disse fica no histórico) e o assistente volta a dar as boas-vindas. */
  const comecarConversaNova = () => {
    void transporte.nova?.().catch(() => undefined);
    mudarFila(() => []);
    atualizar((a) => ({ ...vazio(), convites: a.convites, silencio: true, conversa: novoId(), abertura: true }));
    setNota("");
    void escreverAbertura();
  };

  const novaConversa = () => {
    comecarConversaNova();
    setVista("conversa");
    setMenuAberto(false);
  };

  const abrirDoHistorico = (id: string) => {
    const entrada = historicoRef.current.find((e) => e.id === id);
    if (!entrada || ocupado) return;
    const lida = validarGuardado(entrada.estado as Partial<Guardado>);
    atualizar((a) => ({
      ...a,
      mensagens: lida.mensagens,
      seq: lida.seq,
      feitas: lida.feitas,
      conversa: entrada.id,
      guardar: lida.guardar,
      enviadas: lida.enviadas,
      abertura: true,
    }));
    setNota("");
    setVista("conversa");
    setMenuAberto(false);
  };

  const renomearConversa = (id: string, titulo: string) => mudarHistorico((l) => renomearEntrada(l, id, titulo));

  const apagarConversaDoHistorico = (id: string) => {
    const eraEsta = gRef.current.conversa === id;
    const noServidor =
      (historicoRef.current.find((e) => e.id === id)?.estado as Partial<Guardado> | undefined)?.guardar === "sim" ||
      (eraEsta && gRef.current.guardar === "sim");
    mudarHistorico((l) => removerEntrada(l, id));
    if (eraEsta) comecarConversaNova();
    if (noServidor) void apagarNoServidor(id);
  };

  const apagarTodoOHistorico = () => {
    const ids = new Set<string>();
    for (const e of historicoRef.current) {
      if ((e.estado as Partial<Guardado>).guardar === "sim") ids.add(e.id);
    }
    if (gRef.current.guardar === "sim") ids.add(gRef.current.conversa);
    mudarHistorico(() => []);
    comecarConversaNova();
    setVista("conversa");
    setMenuAberto(false);
    setNota(textos.historico.apagado);
    for (const id of ids) void apagarNoServidor(id);
  };

  // ─── avaliar uma resposta e preencher um formulário (actos expressos da pessoa: o que se envia é o que ela viu) ───────────

  /** A pergunta da pessoa a que uma resposta respondeu (a mensagem dela mais próxima, antes da resposta). */
  const perguntaDaResposta = (m: Mensagem): string => {
    const todas = gRef.current.mensagens;
    for (let i = todas.findIndex((x) => x.id === m.id) - 1; i >= 0; i--) {
      if (todas[i]?.de === "eu") return todas[i]!.texto;
    }
    return "";
  };

  const avaliar = async (m: Mensagem, a: AvaliacaoLocal): Promise<boolean> => {
    const pergunta = perguntaDaResposta(m);
    if (!pergunta) return false;
    try {
      const r = await fetch(`${base}/avaliacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversa: gRef.current.conversa,
          mensagem: m.id,
          sentido: a.sentido,
          nota: a.nota,
          motivos: a.motivos,
          comentario: a.comentario,
          pergunta: pergunta.slice(0, 1500),
          resposta: m.texto.slice(0, 4000),
          raciocinio: m.raciocinio ?? null,
          fontes: m.fontes ?? [],
          pagina: window.location.pathname,
        }),
      });
      if (!r.ok) return false;
      mudarMensagem(m.id, (x) => ({ ...x, avaliacao: a }));
      return true;
    } catch {
      return false;
    }
  };

  const enviarFormulario = async (
    m: Mensagem,
    esquema: EsquemaDoFormulario,
    valores: Record<string, ValorBruto>,
    respostas: RespostaLimpa[],
  ): Promise<boolean> => {
    try {
      const r = await fetch(`${base}/formulario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversa: gRef.current.conversa,
          mensagem: m.id,
          esquema,
          respostas: valores,
          pagina: window.location.pathname,
        }),
      });
      if (!r.ok) return false;
    } catch {
      return false;
    }
    mudarMensagem(m.id, (x) => ({ ...x, formulario: { respostas } }));
    // as respostas seguem para a conversa (a IA lê-as e continua a partir delas)
    void enviar(respostasEmTexto(respostas));
    return true;
  };

  // ─── perguntar à IA ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Pede a resposta à IA e vai escrevendo-a à medida que chega. «recuo» = a IA não respondeu; «limite» = demasiadas mensagens. */
  const perguntarAIa = useCallback(
    async (historico: MensagemDoChat[], anexo?: unknown): Promise<"ok" | "recuo" | "limite"> => {
      const controlo = new AbortController();
      cancelarPedido.current = controlo;
      const relogio = window.setTimeout(() => controlo.abort(), ESPERA_MAXIMA_DA_IA_MS);
      const inicio = raciocinioEmCurso.current?.inicio ?? Date.now();
      let passos = raciocinioEmCurso.current?.passos ?? raciocinioInicial(textos, window.location.pathname);
      const mudarPassos = (novos: PassoDoRaciocinio[]) => {
        passos = novos;
        raciocinioEmCurso.current = { passos: novos, inicio };
        if (vivo.current) setPensando({ passos: novos, inicio });
      };
      let id = 0;
      let texto = "";
      let fontes: Fonte[] = [];
      let cartoes: unknown[] = [];
      let falhou = false;
      try {
        for await (const evento of transporte.perguntar({
          historico,
          caminho: window.location.pathname,
          conversa: gRef.current.conversa,
          sinal: controlo.signal,
          ...(anexo ? { anexo } : {}),
        })) {
          if ("t" in evento) {
            texto += evento.t;
            if (!vivo.current) return "ok";
            if (!id) {
              // a resposta começou: o raciocínio fecha e passa a «Pensou durante N s» em cima da resposta
              const feito = concluirRaciocinio(aplicarEventoAoRaciocinio(passos, evento, textos), textos);
              setEscrevendo(false);
              setPensando(null);
              raciocinioEmCurso.current = null;
              id = acrescentar("bot", "", fontes, { passos: feito, segundos: segundosDesde(inicio) }, { cartoes });
            }
            mudarTexto(id, texto);
          } else if ("fim" in evento) {
            break;
          } else if ("erro" in evento) {
            if (evento.erro === "limite") return "limite";
            falhou = true;
            break;
          } else if ("cartoes" in evento) {
            cartoes = [...cartoes, ...evento.cartoes];
            if (id) mudarMensagem(id, (m) => ({ ...m, cartoes }));
          } else {
            if ("fontes" in evento) fontes = evento.fontes.map(({ titulo, url }) => ({ titulo, url }));
            mudarPassos(aplicarEventoAoRaciocinio(passos, evento, textos));
          }
        }
      } catch {
        falhou = true;
      } finally {
        window.clearTimeout(relogio);
      }
      // uma resposta cortada a meio só fica se já disser alguma coisa (ou se traz cartões)
      if (!id || (falhou && cartoes.length === 0 && textoSimples(texto, opcoesDaResposta).length < 30)) {
        if (id) atualizar((a) => ({ ...a, mensagens: a.mensagens.filter((m) => m.id !== id) }));
        return "recuo";
      }
      return "ok";
    },
    [acrescentar, atualizar, mudarMensagem, mudarTexto, opcoesDaResposta, textos, transporte],
  );

  /** A resposta pronta da equipa: a pergunta escolhida, a que mais se parece com o que a pessoa escreveu, ou a resposta geral. */
  const responderComProntas = useCallback(
    async (texto: string, indice: number | undefined) => {
      const i = indice ?? escolherPergunta(texto, dados.perguntas);
      const pronta = i >= 0 ? dados.perguntas[i] : undefined;
      const resposta = pronta ? pronta.resposta : dados.recuo.generico;
      await esperar(Math.min(1_400, 600 + resposta.length * 4));
      if (!vivo.current) return;
      const curso = raciocinioEmCurso.current;
      const raciocinio = curso
        ? { passos: concluirRaciocinio(curso.passos, textos, { prontas: true }), segundos: segundosDesde(curso.inicio) }
        : undefined;
      setPensando(null);
      raciocinioEmCurso.current = null;
      acrescentar("bot", resposta, undefined, raciocinio);
      if (i >= 0) atualizar((a) => (a.feitas.includes(i) ? a : { ...a, feitas: [...a.feitas, i] }));
    },
    [dados.perguntas, dados.recuo.generico, acrescentar, atualizar, textos],
  );

  /**
   * Responde à última mensagem da pessoa: a IA e, se ela falhar, não estiver ou chegar ao limite, as perguntas prontas da equipa (o JSON de
   * recuo). Nunca deixa uma pergunta sem resposta: se no fim a última mensagem ainda é a da pessoa, responde com as perguntas prontas.
   * `soProntas` salta a IA (o verificador usa-o depois de uma tentativa que não deu resposta).
   */
  const responder = async (texto: string, indice: number | undefined, soProntas = false) => {
    respondendo.current = true;
    inicioDaResposta.current = Date.now();
    setOcupado(true);
    // o «A pensar…» começa já, com o primeiro passo (perceber a pergunta)
    const inicio = Date.now();
    const passos = raciocinioInicial(textos, window.location.pathname);
    raciocinioEmCurso.current = { passos, inicio };
    setPensando({ passos, inicio });
    try {
      let resultado: "ok" | "recuo" | "limite" = "recuo";
      if (!soProntas && Date.now() >= gRef.current.recuoAte) {
        const historico = gRef.current.mensagens.slice(-LIMITES_DO_CHAT.mensagens).map((m): MensagemDoChat => ({
          papel: m.de === "eu" ? "user" : "assistant",
          texto: textoSimples(m.texto, opcoesDaResposta) || m.texto,
        }));
        const ultimoDaPessoa = [...gRef.current.mensagens].reverse().find((m) => m.de === "eu");
        resultado = await perguntarAIa(historico, ultimoDaPessoa?.anexo);
      }
      if (!vivo.current) return;
      if (resultado === "limite") {
        atualizar((a) => ({ ...a, recuoAte: Date.now() + RECUO_DO_LIMITE_MS }));
        setPensando(null);
        raciocinioEmCurso.current = null;
        acrescentar("bot", dados.recuo.limite);
      } else if (resultado === "recuo") {
        if (!soProntas && Date.now() >= gRef.current.recuoAte) {
          atualizar((a) => ({ ...a, recuoAte: Date.now() + RECUO_MS }));
        }
        await responderComProntas(texto, indice);
      }
      // a garantia: se, apesar de tudo, a última mensagem ainda é a da pessoa, responde-se com as perguntas prontas
      const ultima = gRef.current.mensagens[gRef.current.mensagens.length - 1];
      if (vivo.current && ultima?.de === "eu") await responderComProntas(texto, indice);
    } finally {
      respondendo.current = false;
      if (vivo.current) {
        setEscrevendo(false);
        setPensando(null);
        raciocinioEmCurso.current = null;
        setOcupado(false);
        void enviarParaEquipa();
        if (window.matchMedia("(pointer: fine)").matches) campo.current?.focus();
        // as mensagens escritas entretanto entram agora na conversa (a IA vê-as) e respondem-se de seguida, todas de uma vez
        const seguintes = filaRef.current;
        if (seguintes.length > 0) {
          mudarFila(() => []);
          const ids = seguintes.map((s) => acrescentar("eu", s.texto));
          setSaindoDaFila(ids);
          window.setTimeout(() => setSaindoDaFila([]), 700);
          void responder(seguintes[seguintes.length - 1]?.texto ?? "", undefined);
        }
      }
    }
  };

  const enviar = async (bruto: string, indice?: number, anexo?: unknown) => {
    const texto = bruto.trim().slice(0, LIMITES_DO_CHAT.caracteresPorMensagem);
    if (!texto && !anexo) return;
    if (!anexo && (ocupado || respondendo.current)) {
      // o assistente ainda está a trabalhar: a mensagem espera na fila (aparece já, com o loading) e responde-se quando ele acabar
      setEntrada("");
      seqDaFila.current += 1;
      mudarFila((atual) => [...atual, { id: seqDaFila.current, texto }]);
      return;
    }
    if (ocupado || respondendo.current) return;
    setEntrada("");
    // marca já que há uma resposta a caminho, para o verificador de respostas não a duplicar
    respondendo.current = true;
    setOcupado(true);
    acrescentar("eu", texto, undefined, undefined, anexo ? { anexo } : undefined);
    if (indice !== undefined) {
      atualizar((a) => (a.feitas.includes(indice) ? a : { ...a, feitas: [...a.feitas, indice] }));
    }
    await responder(texto, indice);
  };

  // ─── anexar ficheiros (o projecto envia-os: ver `anexos`) ────────────────────────────────────────────────────────────────

  const escolherFicheiro = async (f: File | undefined) => {
    if (!f || !anexos || ocupado || respondendo.current) return;
    setNota("");
    setEnvio({ nome: f.name, progresso: 0 });
    const resultado = await anexos.enviar(f, (fracao) => {
      if (vivo.current) setEnvio({ nome: f.name, progresso: fracao });
    });
    if (!vivo.current) return;
    setEnvio(null);
    if ("erro" in resultado) {
      setNota(anexos.rotulos.erro(resultado.erro));
      return;
    }
    await enviar(entrada, undefined, resultado.anexo);
  };

  const aoLargarFicheiro = (e: DragEvent) => {
    e.preventDefault();
    setALargar(false);
    void escolherFicheiro(e.dataTransfer.files?.[0]);
  };

  // ─── o verificador de respostas: uma pergunta nunca fica sem resposta ──────────────────────────────────────────────────────
  // De vez em quando (e ao carregar a conversa) vê se a última mensagem é da pessoa e se não há nenhuma resposta a caminho; se for assim,
  // gera-se a resposta — com a IA e, se ela não estiver disponível ou falhar, com as perguntas prontas da equipa (o JSON de recuo). Serve
  // quando a página recarrega a meio de uma resposta, quando uma ligação cai, ou quando uma resposta fica presa.
  useEffect(() => {
    responderRef.current = responder;
  });
  useEffect(() => {
    if (!carregado) return;
    const verificar = () => {
      const a = gRef.current;
      const ultima = a.mensagens[a.mensagens.length - 1];
      if (!ultima || ultima.de !== "eu") return;
      if (respondendo.current) {
        // uma resposta presa (nada chega há muito tempo): larga-se e responde-se com as perguntas prontas
        if (Date.now() - inicioDaResposta.current > RESPOSTA_PRESA_MS) {
          respondendo.current = false;
          setPensando(null);
          raciocinioEmCurso.current = null;
          void responderRef.current(ultima.texto, undefined, true);
        }
        return;
      }
      const tentativas = (tentativasDeResposta.current.get(ultima.id) ?? 0) + 1;
      tentativasDeResposta.current.set(ultima.id, tentativas);
      if (tentativas > 3) return;
      void responderRef.current(ultima.texto, undefined, tentativas >= 2);
    };
    verificar();
    const relogio = window.setInterval(verificar, VERIFICACAO_DAS_RESPOSTAS_MS);
    return () => window.clearInterval(relogio);
  }, [carregado]);

  // ─── a faixa de perguntas (desliza com o dedo, com a roda na horizontal e arrastando com o rato; a roda vertical segue para a conversa) ──

  const aoPremirNaFaixa = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !faixa.current) return;
    arrastoFaixa.current = { x: e.clientX, rolagem: faixa.current.scrollLeft, arrastou: false };
  };
  const aoArrastarNaFaixa = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastoFaixa.current;
    const el = faixa.current;
    if (!a || !el) return;
    const dx = e.clientX - a.x;
    if (!a.arrastou && Math.abs(dx) > 5) {
      a.arrastou = true;
      el.setPointerCapture(e.pointerId);
    }
    if (a.arrastou) el.scrollLeft = a.rolagem - dx;
  };
  const aoSoltarNaFaixa = (e: PointerEvent<HTMLDivElement>) => {
    const el = faixa.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // o clique que vem a seguir a um arrastar não escolhe a pergunta onde o rato foi largado
    window.setTimeout(() => {
      arrastoFaixa.current = null;
    }, 0);
  };
  const aoClicarNaFaixa = (e: MouseEvent<HTMLDivElement>) => {
    if (arrastoFaixa.current?.arrastou) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // ─── puxar a conversa: para a ESQUERDA mostra a hora do que a pessoa escreveu (por baixo da mensagem); para a DIREITA mostra a fotografia
  // do assistente (no canto de baixo da resposta) e a hora dela. Cada lado só mexe nas mensagens que lhe pertencem. ───────────────────

  const aoPremirNaLista = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    arrastoLista.current = { x: e.clientX, y: e.clientY, modo: "" };
  };
  const aoArrastarNaLista = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastoLista.current;
    const el = lista.current;
    if (!a || !el) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.modo) {
      // com o rato (PC) não há rolagem a arrastar: um desvio na vertical não tira a vez ao arrasto na horizontal; com o dedo, sim
      // (a rolagem vertical é do navegador)
      const rato = e.pointerType === "mouse";
      if (Math.abs(dx) > 8 && (rato || Math.abs(dx) > Math.abs(dy) * 1.5)) {
        a.modo = "h";
        el.setPointerCapture(e.pointerId);
        el.dataset.arrastando = "";
      } else if (!rato && Math.abs(dy) > 8) {
        a.modo = "v";
      }
    }
    if (a.modo === "h") {
      const px = Math.max(-RESERVA_ESQUERDA, Math.min(RESERVA_DIREITA, dx * 0.9));
      el.style.setProperty("--arrasto", `${px}px`);
      el.style.setProperty("--revelar-esq", String(px < 0 ? Math.min(1, -px / RESERVA_ESQUERDA) : 0));
      el.style.setProperty("--revelar-dir", String(px > 0 ? Math.min(1, px / RESERVA_DIREITA) : 0));
    }
  };
  const aoSoltarNaLista = (e: PointerEvent<HTMLDivElement>) => {
    const el = lista.current;
    if (el) {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      delete el.dataset.arrastando;
      el.style.setProperty("--arrasto", "0px");
      el.style.setProperty("--revelar-esq", "0");
      el.style.setProperty("--revelar-dir", "0");
    }
    // o clique que vem a seguir a puxar não abre a ligação onde o dedo foi largado
    window.setTimeout(() => {
      arrastoLista.current = null;
    }, 0);
  };
  const aoClicarNaLista = (e: MouseEvent<HTMLDivElement>) => {
    if (arrastoLista.current?.modo === "h") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const aoSubmeter = (e: FormEvent) => {
    e.preventDefault();
    void enviar(entrada);
  };

  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    // o Escape recua um passo de cada vez: fecha o menu, volta do histórico à conversa e, por fim, fecha o chat
    if (menuAberto) {
      setMenuAberto(false);
      botaoDoMenu.current?.focus();
    } else if (vista === "historico") {
      setVista("conversa");
    } else {
      fechar();
    }
  };

  if (!carregado) return null;

  const modo: ModoDoAssistente = iaCaiu ? "offline" : modoDoServidor;
  const itensDoHistorico: ItemDoHistorico[] = conversasGuardadas.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    atualizada: e.atualizada,
    mensagens: (e.estado as Partial<Guardado>).mensagens?.length ?? 0,
  }));
  const textoDoConvite: string = dados.convites[g.convites - 1] ?? "";
  // se a pessoa perguntou e fechou o chat, a resposta continua sem ela: ENQUANTO o assistente trabalha (a pensar, a pesquisar, a escrever)
  // o próprio botão azul troca o ícone da conversa (nada pisca): o loading dos quadrados a pensar e a pesquisar e o lápis a escrever a
  // resposta final; quando ela acaba aparece no balão o princípio dela (só a resposta final) e ao fim de 2,5 s o balão sai: fica só a bolinha
  const naoVista = !aberto && !!ultimo && ultimo.id > vistaAte;
  const aTrabalharDeFora = naoVista && ocupado;
  const respostaDeFora = naoVista && !ocupado && ultimo?.de === "bot" && !!ultimo.raciocinio && ultimo.texto !== "";
  const textoDaResposta = respostaDeFora ? textoDaPrevia(paragrafosSimples(ultimo?.texto ?? "", opcoesDaResposta)) : "";
  const temPrevia = respostaDeFora && textoDaResposta !== "";
  const mostrarPrevia = temPrevia && ultimo?.id !== previaDispensada;
  const mostrarConvite = !mostrarPrevia && convite && !aberto && g.ponto && textoDoConvite !== "";
  // na hero o botão e o balão não estão à vista (a bolinha vai com o botão): voltam quando a pessoa sai dela
  const mostrarBalao = visivel && (mostrarPrevia || mostrarConvite);
  const quemResponde = modo === "humano" && nomeDeQuemResponde ? nomeDeQuemResponde : textos.previa.ia;
  // o conteúdo segue os dados e não o ter sido dispensado: quando a resposta sai (2,5 s depois) o balão desvanece-se com o mesmo texto,
  // sem trocar de conteúdo a meio da saída
  const balao: ReactNode =
    mostrarConvite || !temPrevia ? (
      <span>{textoDoConvite}</span>
    ) : (
      <BalaoDaResposta
        key={ultimo?.id}
        quem={quemResponde}
        texto={textoDaResposta}
        textos={textos}
        ativo={mostrarBalao}
        id={ultimo?.id ?? 0}
        aoAcabar={setPreviaDispensada}
      />
    );
  const avisar = g.ponto || respostaDeFora;
  // a escrever a resposta final: o passo «escrever» está activo ou a resposta já começou a aparecer
  const aEscreverDeFora =
    aTrabalharDeFora &&
    (formaDoRaciocinio(pensando?.passos ?? ultimo?.raciocinio?.passos ?? []) === "lapis" ||
      (ultimo?.de === "bot" && ultimo.texto !== ""));
  const rotuloDoBotao = aTrabalharDeFora
    ? `${dados.abrir}, ${textos.pensar.aPensar}`
    : avisar
      ? `${dados.abrir}, ${dados.mensagemNova}`
      : dados.abrir;
  const fecharBalao = () => (mostrarPrevia && ultimo ? setPreviaDispensada(ultimo.id) : fecharConvite());
  const sugestoes = perguntasPorFazer(dados.perguntas, new Set(g.feitas), 3);
  const livre = !ocupado && !escrevendo;
  const aVez = aberto && g.abertura && livre && ultimo?.de === "bot";
  // enquanto se pergunta se pode guardar a conversa, os dois botões ocupam o espaço das perguntas sugeridas (o Autorizo em destaque)
  const perguntarAutorizacao = aVez && g.guardar === "pergunta" && conversou && !semAutorizacao;
  const mostrarSugestoes = aVez && !perguntarAutorizacao;
  const aoSeguir = () => {
    if (window.matchMedia("(max-width: 39.99rem)").matches) setAberto(false);
  };

  /** A hora de uma mensagem, por baixo dela (só se vê ao puxar a conversa: a da pessoa para a esquerda, a do assistente para a direita). */
  const detalhe = (m: Mensagem): ReactNode => (
    <span className="aia-detalhe" aria-hidden="true">
      <time dateTime={new Date(m.em).toISOString()}>{dataDeEnvio(m.em)}</time>
    </span>
  );

  return (
    <ContextoDoCarregar.Provider value={CarregarDoProjecto ?? null}>
      <div ref={raiz} className="aia" data-pronto={visivel ? "sim" : "nao"} data-aberto={aberto ? "sim" : "nao"}>
        <div
          className="aia-convite"
          data-visivel={mostrarBalao ? "sim" : "nao"}
          inert={!mostrarBalao}
          aria-live="polite"
        >
          <button
            type="button"
            className="aia-convite-texto"
            data-previa={mostrarPrevia ? "sim" : "nao"}
            onClick={abrir}
          >
            {balao}
          </button>
          <button type="button" className="aia-convite-fechar" onClick={fecharBalao} aria-label={dados.fechar}>
            <IconeFechar className="aia-icone-pequeno" />
          </button>
        </div>

        <section
          id="aia-painel"
          ref={painel}
          role="dialog"
          aria-label={dados.nome}
          aria-modal="false"
          className="aia-painel"
          inert={!aberto}
          onKeyDown={aoTeclar}
          onDragOver={
            anexos
              ? (e) => {
                  if (e.dataTransfer.types.includes("Files")) {
                    e.preventDefault();
                    setALargar(true);
                  }
                }
              : undefined
          }
          onDragLeave={
            anexos
              ? (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setALargar(false);
                }
              : undefined
          }
          onDrop={anexos ? aoLargarFicheiro : undefined}
        >
          <div className="aia-cabeca">
            <span className="aia-avatar-vivo" data-modo={modo}>
              <Avatar avatar={avatar} />
              <i className="aia-vivo" aria-hidden="true" />
            </span>
            <span className="aia-quem">
              <strong>{dados.nome}</strong>
              <span className="aia-estado-linha">
                <span className="aia-estado" data-modo={modo} role="status" aria-live="polite">
                  {textos.estado[modo]}
                </span>
                <button
                  type="button"
                  className="aia-info"
                  aria-pressed={datasVisiveis}
                  aria-label={datasVisiveis ? textos.datas.esconder : textos.datas.mostrar}
                  title={datasVisiveis ? textos.datas.esconder : textos.datas.mostrar}
                  onClick={() => setDatasVisiveis((v) => !v)}
                >
                  <IconeInfo className="aia-icone-pequeno" />
                </button>
              </span>
            </span>
            <button
              ref={botaoDoMenu}
              type="button"
              className="aia-menu-botao"
              data-aia-menu-botao=""
              aria-haspopup="menu"
              aria-expanded={menuAberto}
              aria-controls="aia-menu"
              aria-label={textos.menu.abrir}
              title={textos.menu.abrir}
              onClick={() => setMenuAberto((v) => !v)}
            >
              <span className="aia-burger-caixa" aria-hidden="true">
                <span className="aia-burger-traco" />
                <span className="aia-burger-traco" />
                <span className="aia-burger-traco" />
              </span>
            </button>
            <button type="button" className="aia-fechar" onClick={fechar} aria-label={dados.fechar}>
              <IconeFechar className="aia-icone-medio" />
            </button>
          </div>

          <MenuDoChat
            textos={textos.menu}
            aberto={menuAberto}
            ocupado={ocupado}
            aoFechar={() => setMenuAberto(false)}
            aoNova={novaConversa}
            aoHistorico={() => {
              setVista("historico");
              setMenuAberto(false);
            }}
            aoApagarTudo={apagarTodoOHistorico}
            extras={itensDoMenu}
          />

          <div
            ref={lista}
            className="aia-lista"
            data-datas={datasVisiveis ? "sim" : "nao"}
            inert={vista === "historico"}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            tabIndex={0}
            onPointerDown={aoPremirNaLista}
            onPointerMove={aoArrastarNaLista}
            onPointerUp={aoSoltarNaLista}
            onPointerCancel={aoSoltarNaLista}
            onClickCapture={aoClicarNaLista}
          >
            <p className="aia-aviso">{dados.aviso}</p>
            {g.guardar === "sim" ? (
              <p className="aia-aviso">
                {dados.conversa.guardada}{" "}
                <button
                  type="button"
                  className="aia-lixo"
                  onClick={() => void pararEApagar()}
                  aria-label={dados.conversa.parar}
                  title={dados.conversa.parar}
                >
                  <IconeLixo className="aia-icone-pequeno" />
                </button>
              </p>
            ) : null}
            {nota ? <p className="aia-aviso">{nota}</p> : null}
            {g.mensagens.map((m, indice) => {
              const aChegar = ocupado && m.id === ultimo?.id;
              // o botão «Falar com a equipa» não vem em todas as respostas: um que já apareceu antes só volta se a pessoa pedir contacto
              const semBotoes =
                m.de === "bot" &&
                temBotaoNaResposta(m.texto) &&
                botaoRepetido({
                  botaoAntes: g.mensagens.slice(0, indice).some((x) => x.de === "bot" && temBotaoNaResposta(x.texto)),
                  perguntaDaPessoa: perguntaDaResposta(m),
                });
              // os cartões do projecto que a IA pôs no meio do texto («[[cartao]]»); os que sobram vão por baixo
              const noTexto =
                cartao && m.cartoes?.length
                  ? Math.min(contarCartoesNoTexto(m.texto, opcoesDaResposta), m.cartoes.length)
                  : 0;
              return (
                <div key={m.id} className="aia-linha" data-de={m.de}>
                  {m.de === "bot" ? (
                    <>
                      {m.raciocinio ? (
                        <Pensar
                          passos={m.raciocinio.passos}
                          feito
                          segundos={m.raciocinio.segundos}
                          textos={textos}
                          fonteEmFoco={fonteVista?.mensagem === m.id ? fonteVista : undefined}
                          modeloDaPesquisa={modeloDaPesquisa}
                        />
                      ) : null}
                      <div className="aia-msg">
                        <span className="aia-foto" aria-hidden="true">
                          <Avatar avatar={avatar} />
                        </span>
                        <Resposta
                          texto={m.texto}
                          fontes={m.fontes}
                          aoVerFonte={
                            m.raciocinio?.passos.some((p) => (p.fontes?.length ?? 0) > 0)
                              ? (n) => setFonteVista({ mensagem: m.id, n })
                              : undefined
                          }
                          modeloDaFonte={textos.pensar.verFonte}
                          aoEscolher={m.id === ultimo?.id && !ocupado ? (opcao) => void enviar(opcao) : undefined}
                          semBotoes={semBotoes}
                          opcoes={opcoesDaResposta}
                          Ligacao={Ligacao}
                          aoSeguir={aoSeguir}
                          cartoes={
                            cartao && noTexto > 0 ? m.cartoes?.slice(0, noTexto).map((c) => cartao(c, m.id)) : undefined
                          }
                          formulario={(esquema) => (
                            <FormularioDoChat
                              esquema={esquema}
                              respondido={m.formulario?.respostas}
                              textos={textos}
                              aoEnviar={(valores, respostas) => enviarFormulario(m, esquema, valores, respostas)}
                            />
                          )}
                        />
                        {cartao && m.cartoes && m.cartoes.length > noTexto ? (
                          <div className="aia-cartoes">
                            {m.cartoes.slice(noTexto).map((c, i) => (
                              <Fragment key={noTexto + i}>{cartao(c, m.id)}</Fragment>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {m.raciocinio && (m.texto || m.cartoes?.length) && !aChegar ? (
                        <Avaliar textos={textos} avaliacao={m.avaliacao} aoEnviar={(a) => avaliar(m, a)} />
                      ) : null}
                    </>
                  ) : (
                    <>
                      {saindoDaFila.includes(m.id) ? (
                        <p className="aia-eu" data-espera="sim">
                          <span className="aia-eu-espera" data-saindo="sim">
                            <Carregar rotulo={textos.fila.espera} />
                          </span>
                          <span className="aia-eu-texto">{m.texto}</span>
                        </p>
                      ) : (
                        <>
                          {m.anexo && anexos ? <div className="aia-anexo">{anexos.renderizar(m.anexo)}</div> : null}
                          {m.texto ? <p className="aia-eu">{m.texto}</p> : null}
                        </>
                      )}
                      <span className="aia-foto" aria-hidden="true">
                        <Avatar avatar={null} />
                      </span>
                    </>
                  )}
                  {detalhe(m)}
                </div>
              );
            })}
            {pensando ? (
              <div className="aia-pensa-linha">
                <Pensar
                  passos={pensando.passos}
                  feito={false}
                  segundos={0}
                  textos={textos}
                  modeloDaPesquisa={modeloDaPesquisa}
                />
              </div>
            ) : null}
            {escrevendo && !pensando ? (
              <p className="aia-bot">
                <span className="aia-escreve" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="aia-so-leitores">{dados.aEscrever}</span>
              </p>
            ) : null}
            {envio && anexos ? (
              <div className="aia-linha" data-de="eu">
                <div className="aia-envio" role="status">
                  <span className="aia-envio-nome">{anexos.rotulos.aEnviar.replace("{nome}", envio.nome)}</span>
                  <span className="aia-envio-barra">
                    <i style={{ width: `${Math.round(envio.progresso * 100)}%` }} />
                  </span>
                </div>
              </div>
            ) : null}
            {/* o que a pessoa escreveu enquanto o assistente trabalhava: espera aqui, com o loading, até ele a ver */}
            {fila.map((f) => (
              <MensagemEmFila key={`fila-${f.id}`} texto={f.texto} textos={textos} />
            ))}
            {perguntarAutorizacao ? (
              <div className="aia-consentimento">
                <p>{dados.conversa.pergunta}</p>
              </div>
            ) : null}
          </div>

          <div className="aia-base" inert={vista === "historico"}>
            {/* as perguntas sugeridas (e a ligação para a equipa) lado a lado numa faixa que se desliza para o lado; fica por cima da escrita */}
            <div className="aia-faixa" data-ativo={mostrarSugestoes ? "sim" : "nao"} inert={!mostrarSugestoes}>
              <div className="aia-faixa-interior">
                <div
                  ref={faixa}
                  className="aia-sugestoes"
                  onPointerDown={aoPremirNaFaixa}
                  onPointerMove={aoArrastarNaFaixa}
                  onPointerUp={aoSoltarNaFaixa}
                  onPointerCancel={aoSoltarNaFaixa}
                  onClickCapture={aoClicarNaFaixa}
                >
                  {sugestoes.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className="aia-sugestao"
                      onClick={() => void enviar(dados.perguntas[i]!.pergunta, i)}
                    >
                      {dados.perguntas[i]!.pergunta}
                    </button>
                  ))}
                  {dados.chamada.href ? (
                    <Ligacao href={dados.chamada.href} className="aia-chamada" onClick={aoSeguir}>
                      <span>{dados.chamada.rotulo}</span>
                      <IconeSetaDiagonal className="aia-icone-seta" />
                    </Ligacao>
                  ) : null}
                </div>
              </div>
            </div>

            {/* a autorização para guardar a conversa: os dois botões ocupam o espaço de baixo — o Autorizo azul e largo, o Não autorizo um botão 3D
              vermelho só com um X (o nome fica para os leitores de ecrã e para a dica) */}
            <div
              className="aia-autorizar"
              data-ativo={perguntarAutorizacao ? "sim" : "nao"}
              inert={!perguntarAutorizacao}
            >
              <div className="aia-autorizar-interior">
                <div className="aia-autorizar-botoes" role="group" aria-label={dados.conversa.pergunta}>
                  <button type="button" className="aia-autorizo" onClick={() => decidirGuardar(true)}>
                    {dados.conversa.sim}
                  </button>
                  <button
                    type="button"
                    className="aia-nao-autorizo"
                    aria-label={dados.conversa.nao}
                    title={dados.conversa.nao}
                    onClick={() => decidirGuardar(false)}
                  >
                    <IconeFechar className="aia-icone-grande" />
                  </button>
                </div>
              </div>
            </div>

            <form className="aia-rodape" onSubmit={aoSubmeter}>
              <div className="aia-escrita">
                {anexos ? (
                  <>
                    <button
                      type="button"
                      className="aia-clipe"
                      aria-label={anexos.rotulos.anexar}
                      title={anexos.rotulos.anexar}
                      disabled={ocupado}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => ficheiroRef.current?.click()}
                    >
                      <IconeClipe className="aia-icone-medio" />
                    </button>
                    <input
                      ref={ficheiroRef}
                      type="file"
                      className="aia-so-leitores"
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={(e) => {
                        void escolherFicheiro(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </>
                ) : null}
                <input
                  ref={campo}
                  type="text"
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  maxLength={LIMITES_DO_CHAT.caracteresPorMensagem}
                  placeholder={dados.campo}
                  aria-label={dados.campo}
                  autoComplete="off"
                  enterKeyHint="send"
                  onPaste={
                    anexos
                      ? (e) => {
                          const f = e.clipboardData.files?.[0];
                          if (f) {
                            e.preventDefault();
                            void escolherFicheiro(f);
                          }
                        }
                      : undefined
                  }
                />
                {/* o toque não tira o foco da escrita: o teclado fica aberto e a pessoa continua a escrever (as mensagens seguintes ficam em fila) */}
                {BotaoDeEnviar ? (
                  <span className="aia-enviar-do-projecto" onMouseDown={(e) => e.preventDefault()}>
                    <BotaoDeEnviar rotulo={dados.enviar} desativado={!entrada.trim()} />
                  </span>
                ) : (
                  <button
                    type="submit"
                    className="aia-enviar"
                    aria-label={dados.enviar}
                    disabled={!entrada.trim()}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <IconeCima className="aia-icone-medio" />
                  </button>
                )}
              </div>
            </form>
          </div>

          {aLargar && anexos ? <div className="aia-largar">{anexos.rotulos.largar}</div> : null}

          <HistoricoDoChat
            textos={textos.historico}
            aberto={vista === "historico"}
            itens={itensDoHistorico}
            atual={g.conversa}
            ocupado={ocupado}
            aoVoltar={() => setVista("conversa")}
            aoAbrir={abrirDoHistorico}
            aoRenomear={renomearConversa}
            aoApagar={apagarConversaDoHistorico}
          />
        </section>

        <button
          ref={botao}
          type="button"
          className="aia-botao"
          aria-expanded={aberto}
          aria-controls="aia-painel"
          aria-label={rotuloDoBotao}
          onClick={abrir}
        >
          {aTrabalharDeFora ? (
            aEscreverDeFora ? (
              <IconeDoBotaoAEscrever />
            ) : (
              <span className="aia-botao-carregar">
                <Carregar rotulo={textos.pensar.aPensar} />
              </span>
            )
          ) : (
            <IconeConversa className="aia-icone-grande" />
          )}
          {avisar && !aberto ? <span className="aia-ponto" aria-hidden="true" /> : null}
        </button>
      </div>
    </ContextoDoCarregar.Provider>
  );
}
