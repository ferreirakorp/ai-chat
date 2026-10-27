// A avaliação de uma resposta do assistente: o visitante diz se foi BOA (e QUÃO boa) ou MÁ (e, se quiser, PORQUÊ) e pode dizer mais. Tudo
// o que o navegador envia valida-se aqui, e o resumo para o painel (as medidas) calcula-se aqui, sobre linhas simples. Módulo PURO.
import { ID_DE_CONVERSA, lerFontesGuardadas, paginaValida, semControlo, type FonteGuardada } from "./conversas";
import { validarRaciocinio, type Raciocinio } from "./pensar";

export const MOTIVOS_DE_MA = [
  "nao-respondeu",
  "errada",
  "incompleta",
  "confusa",
  "longa",
  "insistente",
  "outro",
] as const;
export type MotivoDeMa = (typeof MOTIVOS_DE_MA)[number];

/** Uma resposta boa vale 3 (boa), 4 (muito boa) ou 5 (excelente); uma má vale 1. */
export const NIVEIS_DE_BOA = [3, 4, 5] as const;
export type Sentido = "boa" | "ma";
export type Nota = 1 | 2 | 3 | 4 | 5;

/** Depois de enviar uma avaliação, a pessoa tem este tempo para a alterar ou retirar; passado ele fica como está. */
export const TEMPO_PARA_MUDAR_DE_IDEIA_MS = 5000;
/** O «Obrigado pela avaliação.» fica este tempo e depois sai a desvanecer (o tempo que a saída demora vem do CSS). */
export const TEMPO_DO_AGRADECIMENTO_MS = 2500;
/** A saída do agradecimento (desvanecer e encolher) demora isto; passado, o elemento deixa de existir. */
export const SAIDA_DO_AGRADECIMENTO_MS = 600;

export const LIMITES_DA_AVALIACAO = { comentario: 500, pergunta: 1500, resposta: 4000, mensagem: 1_000_000 } as const;

/** O que o navegador envia: a avaliação e uma cópia da pergunta, da resposta e do raciocínio (a equipa lê-os no painel). */
export type AvaliacaoEnviada = {
  /** O identificador da conversa (o mesmo do chat; a avaliação some se o visitante apagar a conversa). */
  conversa: string;
  /** O número da mensagem do assistente dentro da conversa (no navegador). Uma avaliação por mensagem: enviar outra substitui a anterior. */
  mensagem: number;
  sentido: Sentido;
  nota: Nota;
  motivos: MotivoDeMa[];
  comentario: string;
  pergunta: string;
  resposta: string;
  raciocinio: Raciocinio | null;
  fontes: FonteGuardada[];
  pagina: string;
};

export type ErroDeAvaliacao = "invalido" | "tamanho";

export function validarAvaliacao(
  entrada: unknown,
): { ok: true; avaliacao: AvaliacaoEnviada } | { ok: false; erro: ErroDeAvaliacao } {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, erro: "invalido" };
  const o = entrada as Record<string, unknown>;
  if (typeof o.conversa !== "string" || !ID_DE_CONVERSA.test(o.conversa)) return { ok: false, erro: "invalido" };
  const mensagem = o.mensagem;
  if (
    typeof mensagem !== "number" ||
    !Number.isInteger(mensagem) ||
    mensagem < 1 ||
    mensagem > LIMITES_DA_AVALIACAO.mensagem
  ) {
    return { ok: false, erro: "invalido" };
  }
  if (o.sentido !== "boa" && o.sentido !== "ma") return { ok: false, erro: "invalido" };
  const sentido: Sentido = o.sentido;
  const nota = o.nota;
  if (typeof nota !== "number" || !Number.isInteger(nota)) return { ok: false, erro: "invalido" };
  if (sentido === "boa" && !(NIVEIS_DE_BOA as readonly number[]).includes(nota)) return { ok: false, erro: "invalido" };
  if (sentido === "ma" && nota !== 1) return { ok: false, erro: "invalido" };

  const motivos: MotivoDeMa[] = [];
  if (sentido === "ma" && Array.isArray(o.motivos)) {
    for (const m of o.motivos) {
      if (
        typeof m === "string" &&
        (MOTIVOS_DE_MA as readonly string[]).includes(m) &&
        !motivos.includes(m as MotivoDeMa)
      ) {
        motivos.push(m as MotivoDeMa);
      }
    }
  }

  const comentario = typeof o.comentario === "string" ? semControlo(o.comentario) : "";
  if (comentario.length > LIMITES_DA_AVALIACAO.comentario) return { ok: false, erro: "tamanho" };
  const pergunta = typeof o.pergunta === "string" ? semControlo(o.pergunta) : "";
  const resposta = typeof o.resposta === "string" ? semControlo(o.resposta) : "";
  if (!pergunta || !resposta) return { ok: false, erro: "invalido" };
  if (pergunta.length > LIMITES_DA_AVALIACAO.pergunta || resposta.length > LIMITES_DA_AVALIACAO.resposta) {
    return { ok: false, erro: "tamanho" };
  }

  return {
    ok: true,
    avaliacao: {
      conversa: o.conversa.toLowerCase(),
      mensagem,
      sentido,
      nota: nota as Nota,
      motivos,
      comentario,
      pergunta,
      resposta,
      raciocinio: validarRaciocinio(o.raciocinio),
      fontes: lerFontesGuardadas(o.fontes),
      pagina: paginaValida(o.pagina),
    },
  };
}

/** Retirar uma avaliação (o visitante muda de ideias): só precisa de saber a conversa e a mensagem. */
export function validarRetirada(entrada: unknown): { conversa: string; mensagem: number } | null {
  if (typeof entrada !== "object" || entrada === null) return null;
  const { conversa, mensagem } = entrada as { conversa?: unknown; mensagem?: unknown };
  if (typeof conversa !== "string" || !ID_DE_CONVERSA.test(conversa)) return null;
  if (typeof mensagem !== "number" || !Number.isInteger(mensagem) || mensagem < 1) return null;
  return { conversa: conversa.toLowerCase(), mensagem };
}

// ─── As medidas para o painel ───────────────────────────────────────────────────────────────────────────────────────

export type EstadoDaAvaliacao = "nova" | "revista";

export type LinhaParaResumo = {
  sentido: Sentido;
  nota: number;
  motivos: readonly string[];
  comentario: string | null;
  estado: EstadoDaAvaliacao;
  criado_em: Date | string;
};

export type ResumoDeAvaliacoes = {
  total: number;
  boas: number;
  mas: number;
  /** De 0 a 100, ou `null` sem avaliações. */
  percentagemBoas: number | null;
  /** A média das notas (1 a 5), ou `null` sem avaliações. */
  notaMedia: number | null;
  porNota: Record<Nota, number>;
  /** Os motivos das respostas más, do mais ao menos citado. */
  motivos: Array<{ motivo: MotivoDeMa; total: number }>;
  comComentario: number;
  porRever: number;
  /** Os últimos 14 dias (do mais antigo ao de hoje, em UTC). */
  ultimosDias: Array<{ dia: string; boas: number; mas: number }>;
};

const diaDe = (d: Date): string => d.toISOString().slice(0, 10);

export function resumirAvaliacoes(linhas: readonly LinhaParaResumo[], agora: Date = new Date()): ResumoDeAvaliacoes {
  const porNota: Record<Nota, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const motivos = new Map<MotivoDeMa, number>();
  let boas = 0;
  let mas = 0;
  let soma = 0;
  let comComentario = 0;
  let porRever = 0;
  const dias = new Map<string, { boas: number; mas: number }>();
  for (let i = 13; i >= 0; i--) dias.set(diaDe(new Date(agora.getTime() - i * 86_400_000)), { boas: 0, mas: 0 });

  for (const l of linhas) {
    if (l.sentido === "boa") boas += 1;
    else mas += 1;
    const nota = Math.min(5, Math.max(1, Math.round(l.nota))) as Nota;
    porNota[nota] += 1;
    soma += nota;
    if (l.comentario && l.comentario.trim()) comComentario += 1;
    if (l.estado === "nova") porRever += 1;
    for (const m of l.motivos) {
      if ((MOTIVOS_DE_MA as readonly string[]).includes(m))
        motivos.set(m as MotivoDeMa, (motivos.get(m as MotivoDeMa) ?? 0) + 1);
    }
    const dia = diaDe(new Date(l.criado_em));
    const d = dias.get(dia);
    if (d) {
      if (l.sentido === "boa") d.boas += 1;
      else d.mas += 1;
    }
  }
  const total = linhas.length;
  return {
    total,
    boas,
    mas,
    percentagemBoas: total === 0 ? null : Math.round((boas / total) * 100),
    notaMedia: total === 0 ? null : Math.round((soma / total) * 10) / 10,
    porNota,
    motivos: [...motivos.entries()].map(([motivo, n]) => ({ motivo, total: n })).sort((a, b) => b.total - a.total),
    comComentario,
    porRever,
    ultimosDias: [...dias.entries()].map(([dia, v]) => ({ dia, ...v })),
  };
}
