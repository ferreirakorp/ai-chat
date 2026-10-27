// Perguntas em formato JSON: a IA pode pedir informação com um FORMULÁRIO a sério (escolhas, escala, texto…) em vez de texto solto. O
// visitante preenche-o no próprio chat e as respostas ficam guardadas de forma estruturada (uma linha por pergunta respondida), para
// o painel as analisar como métricas de marketing, exportar e aprender com o assistente. Módulo PURO: o formato que a IA escreve, a
// validação do esquema e das respostas, o texto que segue para a conversa e as estatísticas/exportação para o painel.
import { ID_DE_CONVERSA, paginaValida, semControlo } from "./conversas";

export const TIPOS_DE_CAMPO = [
  "escolha",
  "multipla",
  "sim-nao",
  "escala",
  "texto",
  "numero",
  "email",
  "telefone",
] as const;
export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number];

export const LIMITES_DO_FORMULARIO = {
  campos: 6,
  titulo: 100,
  rotulo: 160,
  ajuda: 120,
  opcoes: 8,
  opcao: 60,
  texto: 300,
  escalaMaxima: 10,
  numeroMaximo: 1_000_000_000_000,
  /** O que a IA escreve (o JSON) não pode passar daqui. */
  json: 4000,
} as const;

export type CampoDoFormulario = {
  /** Identificador curto do campo dentro do formulário (a-z, 0-9, _ e -). */
  id: string;
  tipo: TipoDeCampo;
  /** A pergunta, tal como a pessoa a lê. */
  rotulo: string;
  /** `escolha` e `multipla`: 2 a 8 opções. */
  opcoes?: string[];
  /** `escala` (1 a 5 por omissão) e `numero`. */
  min?: number;
  max?: number;
  obrigatorio: boolean;
  ajuda?: string;
};

export type EsquemaDoFormulario = {
  id: string;
  titulo: string;
  campos: CampoDoFormulario[];
};

const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const TELEFONE = /^\+?[0-9][0-9 ()-]{6,19}$/;

const frase = (v: unknown, max: number): string =>
  typeof v === "string" ? semControlo(v).replace(/\s+/g, " ").slice(0, max) : "";

/**
 * Lê (e limpa) o esquema de um formulário vindo da IA: só os tipos conhecidos, tamanhos limitados, opções únicas. Devolve `null` se não
 * der para montar um formulário útil (sem campos válidos). O que a IA escreve nunca é confiado tal como vem.
 */
export function lerEsquema(valor: unknown): EsquemaDoFormulario | null {
  if (typeof valor !== "object" || valor === null) return null;
  const { id, titulo, campos } = valor as { id?: unknown; titulo?: unknown; campos?: unknown };
  if (!Array.isArray(campos)) return null;
  const lidos: CampoDoFormulario[] = [];
  const ids = new Set<string>();
  for (const bruto of campos.slice(0, LIMITES_DO_FORMULARIO.campos)) {
    const c = (bruto ?? {}) as Record<string, unknown>;
    const campoId = typeof c.id === "string" ? c.id.trim().toLowerCase() : "";
    const rotulo = frase(c.rotulo, LIMITES_DO_FORMULARIO.rotulo);
    const tipo = c.tipo;
    if (!SLUG.test(campoId) || ids.has(campoId) || !rotulo) continue;
    if (typeof tipo !== "string" || !(TIPOS_DE_CAMPO as readonly string[]).includes(tipo)) continue;
    const campo: CampoDoFormulario = {
      id: campoId,
      tipo: tipo as TipoDeCampo,
      rotulo,
      obrigatorio: c.obrigatorio !== false,
    };
    const ajuda = frase(c.ajuda, LIMITES_DO_FORMULARIO.ajuda);
    if (ajuda) campo.ajuda = ajuda;
    if (campo.tipo === "escolha" || campo.tipo === "multipla") {
      const opcoes: string[] = [];
      if (Array.isArray(c.opcoes)) {
        for (const o of c.opcoes) {
          const t = frase(o, LIMITES_DO_FORMULARIO.opcao);
          if (t && !opcoes.includes(t)) opcoes.push(t);
          if (opcoes.length >= LIMITES_DO_FORMULARIO.opcoes) break;
        }
      }
      if (opcoes.length < 2) continue;
      campo.opcoes = opcoes;
    }
    if (campo.tipo === "escala") {
      const min = typeof c.min === "number" && Number.isInteger(c.min) ? c.min : 1;
      const max = typeof c.max === "number" && Number.isInteger(c.max) ? c.max : 5;
      if (max <= min || max - min + 1 > LIMITES_DO_FORMULARIO.escalaMaxima || min < 0) continue;
      campo.min = min;
      campo.max = max;
    }
    if (campo.tipo === "numero") {
      if (typeof c.min === "number" && Number.isFinite(c.min)) campo.min = c.min;
      if (typeof c.max === "number" && Number.isFinite(c.max)) campo.max = c.max;
      if (campo.min !== undefined && campo.max !== undefined && campo.max < campo.min) continue;
    }
    ids.add(campoId);
    lidos.push(campo);
  }
  if (lidos.length === 0) return null;
  const formId = typeof id === "string" && SLUG.test(id.trim().toLowerCase()) ? id.trim().toLowerCase() : "formulario";
  return { id: formId, titulo: frase(titulo, LIMITES_DO_FORMULARIO.titulo), campos: lidos };
}

// ─── O formato que a IA escreve ─────────────────────────────────────────────────────────────────────────────────────

const ABRE = /\[\[\s*formul[aá]rio\s*\]\]/i;
const FECHA = /\[\[\s*\/\s*formul[aá]rio\s*\]\]/i;

export type TextoSeparado = {
  /** O texto antes do formulário. */
  antes: string;
  /** O formulário, se veio completo e válido. */
  esquema: EsquemaDoFormulario | null;
  /** O texto depois do formulário (sem um segundo formulário). */
  depois: string;
  /** O formulário ainda está a chegar (abriu e não fechou): não se mostra nada dele. */
  emCurso: boolean;
};

/**
 * Separa o formulário do texto de uma resposta: `[[formulario]]` + JSON + `[[/formulario]]` (o JSON pode vir dentro de uma cerca de
 * código). Só o primeiro formulário conta. Enquanto o fecho não chega (a resposta vem aos pedaços) o formulário fica `emCurso`.
 */
export function separarFormulario(texto: string): TextoSeparado {
  const a = ABRE.exec(texto);
  if (!a) return { antes: texto, esquema: null, depois: "", emCurso: false };
  const antes = texto.slice(0, a.index);
  const resto = texto.slice(a.index + a[0].length);
  const f = FECHA.exec(resto);
  if (!f) return { antes, esquema: null, depois: "", emCurso: true };
  let json = resto.slice(0, f.index).trim();
  json = json
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let esquema: EsquemaDoFormulario | null = null;
  if (json.length <= LIMITES_DO_FORMULARIO.json) {
    try {
      esquema = lerEsquema(JSON.parse(json));
    } catch {
      esquema = null;
    }
  }
  const depois = separarFormulario(resto.slice(f.index + f[0].length)).antes;
  return { antes, esquema, depois, emCurso: false };
}

/** O texto de uma resposta sem o bloco do formulário (para medir, ler em voz alta e guardar um resumo). */
export function textoSemFormulario(texto: string): string {
  const s = separarFormulario(texto);
  return `${s.antes}${s.depois}`;
}

// ─── As respostas ───────────────────────────────────────────────────────────────────────────────────────────────────

/** O que o navegador envia por campo: texto, número, lista de opções ou sim/não. */
export type ValorBruto = string | number | boolean | string[];

/** Uma pergunta respondida, já limpa e pronta a guardar: uma linha por pergunta (é o que o painel analisa). */
export type RespostaLimpa = {
  campo: string;
  rotulo: string;
  tipo: TipoDeCampo;
  /** A resposta tal como se lê («Comércio», «Comércio; Serviços», «Sim», «4», «uma frase escrita»). */
  texto: string;
  /** Para `numero`, `escala` e `sim-nao` (1 = sim, 0 = não); senão `null`. */
  numero: number | null;
  /** As opções escolhidas (`escolha`, `multipla`, `sim-nao`); senão vazio. */
  opcoes: string[];
};

export type ErroDeRespostas = { campo: string; erro: "obrigatorio" | "invalido" };

/** Valida as respostas de uma pessoa contra o esquema do formulário (cada campo pelo seu tipo). */
export function validarRespostas(
  esquema: EsquemaDoFormulario,
  respostas: unknown,
): { ok: true; respostas: RespostaLimpa[] } | { ok: false; erro: ErroDeRespostas } {
  const dados =
    typeof respostas === "object" && respostas !== null && !Array.isArray(respostas)
      ? (respostas as Record<string, unknown>)
      : null;
  if (!dados) return { ok: false, erro: { campo: "", erro: "invalido" } };
  const limpas: RespostaLimpa[] = [];
  for (const c of esquema.campos) {
    const v = dados[c.id];
    const vazio =
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);
    if (vazio) {
      if (c.obrigatorio) return { ok: false, erro: { campo: c.id, erro: "obrigatorio" } };
      continue;
    }
    const base = { campo: c.id, rotulo: c.rotulo, tipo: c.tipo };
    const invalido = { ok: false, erro: { campo: c.id, erro: "invalido" } } as const;
    if (c.tipo === "escolha") {
      if (typeof v !== "string" || !c.opcoes?.includes(v)) return invalido;
      limpas.push({ ...base, texto: v, numero: null, opcoes: [v] });
    } else if (c.tipo === "multipla") {
      if (!Array.isArray(v)) return invalido;
      const escolhidas = [...new Set(v)];
      if (escolhidas.some((o) => typeof o !== "string" || !c.opcoes?.includes(o))) return invalido;
      const lista = escolhidas as string[];
      limpas.push({ ...base, texto: lista.join("; "), numero: null, opcoes: lista });
    } else if (c.tipo === "sim-nao") {
      if (typeof v !== "boolean") return invalido;
      limpas.push({ ...base, texto: v ? "Sim" : "Não", numero: v ? 1 : 0, opcoes: [v ? "Sim" : "Não"] });
    } else if (c.tipo === "escala") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < (c.min ?? 1) || v > (c.max ?? 5)) return invalido;
      limpas.push({ ...base, texto: String(v), numero: v, opcoes: [] });
    } else if (c.tipo === "numero") {
      if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > LIMITES_DO_FORMULARIO.numeroMaximo)
        return invalido;
      if ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max)) return invalido;
      limpas.push({ ...base, texto: String(v), numero: v, opcoes: [] });
    } else {
      if (typeof v !== "string") return invalido;
      const t = semControlo(v).replace(/\s+/g, " ");
      if (!t || t.length > LIMITES_DO_FORMULARIO.texto) return invalido;
      if (c.tipo === "email" && !EMAIL.test(t)) return invalido;
      if (c.tipo === "telefone" && !TELEFONE.test(t)) return invalido;
      limpas.push({ ...base, texto: t, numero: null, opcoes: [] });
    }
  }
  if (limpas.length === 0) return { ok: false, erro: { campo: "", erro: "obrigatorio" } };
  return { ok: true, respostas: limpas };
}

/** As respostas como texto («Qual é o seu sector? Comércio»), para a conversa e para a IA as ler. */
export function respostasEmTexto(respostas: readonly RespostaLimpa[]): string {
  return respostas.map((r) => `${r.rotulo} ${r.texto}`).join("\n");
}

/** O que o navegador envia ao guardar um formulário preenchido. */
export type FormularioValidado = {
  conversa: string;
  /** O número da mensagem do assistente (no navegador) onde o formulário apareceu. */
  mensagem: number;
  esquema: EsquemaDoFormulario;
  respostas: RespostaLimpa[];
  pagina: string;
};

export function validarFormularioEnviado(
  entrada: unknown,
): { ok: true; formulario: FormularioValidado } | { ok: false; erro: "invalido" | "obrigatorio" } {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, erro: "invalido" };
  const o = entrada as Record<string, unknown>;
  if (typeof o.conversa !== "string" || !ID_DE_CONVERSA.test(o.conversa)) return { ok: false, erro: "invalido" };
  if (typeof o.mensagem !== "number" || !Number.isInteger(o.mensagem) || o.mensagem < 1 || o.mensagem > 1_000_000) {
    return { ok: false, erro: "invalido" };
  }
  const esquema = lerEsquema(o.esquema);
  if (!esquema) return { ok: false, erro: "invalido" };
  const r = validarRespostas(esquema, o.respostas);
  if (!r.ok) return { ok: false, erro: r.erro.erro };
  return {
    ok: true,
    formulario: {
      conversa: o.conversa.toLowerCase(),
      mensagem: o.mensagem,
      esquema,
      respostas: r.respostas,
      pagina: paginaValida(o.pagina),
    },
  };
}

// ─── As medidas e a exportação para o painel ────────────────────────────────────────────────────────────────────────

/** Uma pergunta respondida tal como está guardada (uma linha por resposta). */
export type LinhaDeResposta = {
  formulario: string;
  campo: string;
  rotulo: string;
  tipo: TipoDeCampo;
  texto: string;
  numero: number | null;
  opcoes: readonly string[];
  criado_em: Date | string;
};

export type EstatisticaDePergunta = {
  /** A pergunta normalizada (as mesmas perguntas de formulários diferentes juntam-se). */
  chave: string;
  rotulo: string;
  tipo: TipoDeCampo;
  respostas: number;
  /** `escolha`, `multipla` e `sim-nao`: quantas vezes saiu cada opção. */
  opcoes: Array<{ opcao: string; total: number; percentagem: number }>;
  /** `escala` e `numero`. */
  media: number | null;
  minimo: number | null;
  maximo: number | null;
  /** `texto`, `email` e `telefone`: as respostas mais recentes (até 5). */
  exemplos: string[];
};

const chaveDe = (rotulo: string, tipo: string): string =>
  `${tipo}:${rotulo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;

/** Agrupa as respostas por pergunta e calcula o que interessa a quem estuda os visitantes. As mais respondidas primeiro. */
export function resumirPerguntas(linhas: readonly LinhaDeResposta[]): EstatisticaDePergunta[] {
  const grupos = new Map<string, LinhaDeResposta[]>();
  for (const l of linhas) {
    const k = chaveDe(l.rotulo, l.tipo);
    const g = grupos.get(k);
    if (g) g.push(l);
    else grupos.set(k, [l]);
  }
  const saida: EstatisticaDePergunta[] = [];
  for (const [chave, g] of grupos) {
    const ordenadas = [...g].sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
    const primeira = ordenadas[0]!;
    const contagem = new Map<string, number>();
    for (const l of g) for (const o of l.opcoes) contagem.set(o, (contagem.get(o) ?? 0) + 1);
    const numeros = g.map((l) => l.numero).filter((n): n is number => n !== null);
    const soma = [...contagem.values()].reduce((s, n) => s + n, 0);
    saida.push({
      chave,
      rotulo: primeira.rotulo,
      tipo: primeira.tipo,
      respostas: g.length,
      opcoes: [...contagem.entries()]
        .map(([opcao, total]) => ({ opcao, total, percentagem: soma === 0 ? 0 : Math.round((total / g.length) * 100) }))
        .sort((a, b) => b.total - a.total),
      media:
        numeros.length && primeira.tipo !== "sim-nao"
          ? Math.round((numeros.reduce((s, n) => s + n, 0) / numeros.length) * 100) / 100
          : null,
      minimo: numeros.length && primeira.tipo !== "sim-nao" ? Math.min(...numeros) : null,
      maximo: numeros.length && primeira.tipo !== "sim-nao" ? Math.max(...numeros) : null,
      exemplos:
        primeira.tipo === "texto" || primeira.tipo === "email" || primeira.tipo === "telefone"
          ? ordenadas.slice(0, 5).map((l) => l.texto)
          : [],
    });
  }
  return saida.sort((a, b) => b.respostas - a.respostas || a.rotulo.localeCompare(b.rotulo, "pt"));
}

const celula = (valor: string): string => {
  // uma célula que começa por = + - @ seria uma fórmula no Excel: protege-se
  const segura = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return `"${segura.replaceAll('"', '""')}"`;
};

/** As respostas em CSV limpo (uma linha por pergunta respondida), pronto para folhas de cálculo e ferramentas de análise. */
export function respostasParaCsv(linhas: readonly LinhaDeResposta[]): string {
  const cabecalho = ["data", "formulario", "pergunta", "tipo", "resposta", "numero", "opcoes"];
  const corpo = linhas.map((l) =>
    [
      new Date(l.criado_em).toISOString(),
      l.formulario,
      l.rotulo,
      l.tipo,
      l.texto,
      l.numero === null ? "" : String(l.numero),
      l.opcoes.join("; "),
    ]
      .map(celula)
      .join(","),
  );
  return [cabecalho.map(celula).join(","), ...corpo].join("\r\n");
}
