// O que o assistente guarda e lê: conversas (só as autorizadas), avaliações, orientações da equipa e formulários preenchidos. Esta é a
// interface única entre o servidor (rotas), o painel e o armazenamento: há uma implementação para Postgres (`repositorio-pg.ts`) e outra
// em memória (`repositorio-memoria.ts`, para testes e demonstrações). Um projecto novo só escolhe qual usa.
import type { AvaliacaoEnviada, EstadoDaAvaliacao, ResumoDeAvaliacoes, Sentido } from "../nucleo/avaliacoes";
import type { FonteGuardada, RegistoDeConversa } from "../nucleo/conversas";
import type { EsquemaDoFormulario, FormularioValidado, LinhaDeResposta, RespostaLimpa } from "../nucleo/formulario";
import type { NovaOrientacao, Orientacao } from "../nucleo/orientacoes";
import type { Raciocinio } from "../nucleo/pensar";

/** Os parâmetros de uma lista paginada (o `ParametrosLista` do painel serve tal como está). `filtros` leva, por exemplo, `sentido` e `estado`. */
export type ParametrosDeLista = {
  q: string;
  ordem: string;
  direccao: "asc" | "desc";
  tamanho: number;
  desvio: number;
  filtros?: Record<string, string>;
};

export type ConversaGuardada = {
  id: string;
  criado_em: Date;
  ultima_em: Date;
  consentimento_em: Date;
  pagina: string;
  mensagens: number;
  primeira_pergunta: string | null;
};

export type MensagemGuardadaNoPainel = {
  id: number;
  papel: "user" | "assistant";
  texto: string;
  fontes: FonteGuardada[] | null;
  raciocinio: Raciocinio | null;
  enviado_em: Date;
};

export type AvaliacaoGuardada = AvaliacaoEnviada & {
  id: string;
  estado: EstadoDaAvaliacao;
  criado_em: Date;
  atualizado_em: Date;
};

export type FormularioGuardado = {
  id: string;
  /** A conversa (identificador do navegador) e a mensagem do assistente onde o formulário apareceu. */
  conversa: string;
  mensagem: number;
  esquema: EsquemaDoFormulario;
  pagina: string;
  criado_em: Date;
  respostas: RespostaLimpa[];
};

export type OrientacaoGuardada = Orientacao & {
  /** A avaliação a partir da qual a equipa a escreveu (se foi o caso). */
  avaliacao_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
};

export interface RepositorioDoAssistente {
  // ─── conversas (só as que o visitante autorizou guardar) ───
  guardarMensagens(registo: RegistoDeConversa): Promise<"ok" | "cheia">;
  /** O visitante pára e apaga: some a conversa, as suas mensagens, as avaliações e os formulários dessa conversa. */
  apagarConversa(id: string): Promise<boolean>;
  listarConversas(params: ParametrosDeLista): Promise<{ linhas: ConversaGuardada[]; total: number }>;
  lerConversa(id: string): Promise<{
    conversa: ConversaGuardada;
    mensagens: MensagemGuardadaNoPainel[];
    avaliacoes: AvaliacaoGuardada[];
    formularios: FormularioGuardado[];
  } | null>;

  // ─── avaliações ───
  /** Uma avaliação por mensagem: guardar outra para a mesma mensagem substitui a anterior (e volta a «nova»). */
  guardarAvaliacao(avaliacao: AvaliacaoEnviada): Promise<void>;
  retirarAvaliacao(conversa: string, mensagem: number): Promise<boolean>;
  /** Filtros aceites em `params.filtros`: `sentido` («boa»/«ma») e `estado` («nova»/«revista»). Ordens: `quando`, `nota`. */
  listarAvaliacoes(params: ParametrosDeLista): Promise<{ linhas: AvaliacaoGuardada[]; total: number }>;
  lerAvaliacao(id: string): Promise<{ avaliacao: AvaliacaoGuardada; orientacoes: OrientacaoGuardada[] } | null>;
  resumoDasAvaliacoes(): Promise<ResumoDeAvaliacoes>;
  marcarAvaliacao(id: string, estado: EstadoDaAvaliacao): Promise<void>;

  // ─── orientações da equipa para a IA ───
  listarOrientacoes(): Promise<OrientacaoGuardada[]>;
  /** As activas, no formato que a IA usa (o servidor guarda-as numa cache curta). */
  orientacoesAtivas(): Promise<Orientacao[]>;
  /** Cria (sem `id`) ou actualiza (com `id`); devolve o `id`. */
  guardarOrientacao(o: NovaOrientacao & { id?: string; avaliacaoId?: string | null }): Promise<string>;
  alternarOrientacao(id: string, ativa: boolean): Promise<void>;
  apagarOrientacao(id: string): Promise<void>;

  // ─── formulários preenchidos (as perguntas em JSON que a IA fez) ───
  /** Um formulário por mensagem: voltar a enviar substitui o anterior. */
  guardarFormulario(formulario: FormularioValidado): Promise<string>;
  /** Ordens: `quando`. Procura (`q`) no título do formulário e nas respostas. */
  listarFormularios(params: ParametrosDeLista): Promise<{ linhas: FormularioGuardado[]; total: number }>;
  lerFormulario(id: string): Promise<FormularioGuardado | null>;
  /** Todas as respostas (uma linha por pergunta), das mais recentes às mais antigas (no máximo 20 000), para estatísticas e exportação. */
  respostasParaAnalise(): Promise<LinhaDeResposta[]>;
}

/** Os filtros de uma lista de avaliações, lidos de `params.filtros` (valores desconhecidos contam como «sem filtro»). */
export function filtrosDeAvaliacao(params: ParametrosDeLista): {
  sentido: Sentido | null;
  estado: EstadoDaAvaliacao | null;
} {
  const s = params.filtros?.sentido;
  const e = params.filtros?.estado;
  return {
    sentido: s === "boa" || s === "ma" ? s : null,
    estado: e === "nova" || e === "revista" ? e : null,
  };
}

/**
 * O que o armazenamento em Postgres precisa de um projecto: executar SQL e abrir uma transacção. Qualquer cliente serve se o
 * adaptar a isto (o `pg`, o `postgres`, o executor do próprio projecto).
 */
export type ExecutorSql = {
  consultar<T = Record<string, unknown>>(sql: string, valores?: unknown[]): Promise<T[]>;
  umaLinha<T = Record<string, unknown>>(sql: string, valores?: unknown[]): Promise<T | null>;
  transaccao<R>(trabalho: (tx: ExecutorSql) => Promise<R>): Promise<R>;
};
