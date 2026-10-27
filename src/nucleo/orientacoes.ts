// As orientações da equipa para a IA: instruções que a equipa escreve no painel (muitas vezes a partir de uma avaliação) para «perguntas
// deste tipo». Quando a pergunta de um visitante tem as palavras-chave de uma orientação activa, a IA recebe essa instrução nas suas
// regras. Módulo PURO: a validação do que a equipa escreve, a procura das orientações certas e o bloco que entra nas instruções.
import { normalizarTexto, palavrasDoTexto } from "./chat";
import { semControlo } from "./conversas";

export type Orientacao = {
  id: string;
  titulo: string;
  /** As palavras (ou expressões) que identificam o tipo de pergunta. */
  palavras: string[];
  instrucao: string;
  ativa: boolean;
};

export type NovaOrientacao = Omit<Orientacao, "id">;

export const LIMITES_DAS_ORIENTACOES = {
  titulo: 80,
  palavras: 12,
  palavra: 40,
  instrucao: 600,
  /** Quantas orientações seguem para a IA numa resposta. */
  porResposta: 3,
} as const;

export type ErroDeOrientacao = "titulo" | "palavras" | "instrucao";

/**
 * Valida o que a equipa escreveu. `palavras` pode vir como lista ou como texto separado por vírgulas, pontos e vírgulas ou linhas.
 */
export function validarOrientacao(
  entrada: unknown,
): { ok: true; orientacao: NovaOrientacao } | { ok: false; erro: ErroDeOrientacao } {
  if (typeof entrada !== "object" || entrada === null) return { ok: false, erro: "titulo" };
  const { titulo, palavras, instrucao, ativa } = entrada as Record<string, unknown>;
  const t = typeof titulo === "string" ? semControlo(titulo).replace(/\s+/g, " ") : "";
  if (t.length < 3 || t.length > LIMITES_DAS_ORIENTACOES.titulo) return { ok: false, erro: "titulo" };

  const brutas = Array.isArray(palavras) ? palavras : typeof palavras === "string" ? palavras.split(/[,;\n]+/) : [];
  const lidas: string[] = [];
  const vistas = new Set<string>();
  for (const b of brutas) {
    if (typeof b !== "string") continue;
    const p = semControlo(b).replace(/\s+/g, " ").slice(0, LIMITES_DAS_ORIENTACOES.palavra);
    const n = normalizarTexto(p);
    if (n.length < 2 || vistas.has(n)) continue;
    vistas.add(n);
    lidas.push(p);
  }
  if (lidas.length === 0 || lidas.length > LIMITES_DAS_ORIENTACOES.palavras) return { ok: false, erro: "palavras" };

  const i = typeof instrucao === "string" ? semControlo(instrucao) : "";
  if (i.length < 10 || i.length > LIMITES_DAS_ORIENTACOES.instrucao) return { ok: false, erro: "instrucao" };

  return { ok: true, orientacao: { titulo: t, palavras: lidas, instrucao: i, ativa: ativa !== false } };
}

/** As palavras que a pergunta de um visitante sugere como palavras-chave (para pré-preencher o formulário da orientação). */
export function palavrasSugeridas(pergunta: string, maximo = 6): string[] {
  const vistas = new Set<string>();
  for (const p of palavrasDoTexto(pergunta)) vistas.add(p);
  return [...vistas].slice(0, maximo);
}

const raiz = (palavra: string): string => palavra.slice(0, 5);

/**
 * As orientações activas que servem à mensagem do visitante, as mais certeiras primeiro (no máximo `porResposta`). Uma palavra de
 * 5 letras ou mais serve pela raiz («investir» serve a «investimentos»); as mais curtas e as expressões têm de coincidir inteiras.
 */
export function orientacoesParaMensagem(
  mensagem: string,
  orientacoes: readonly Orientacao[],
  maximo: number = LIMITES_DAS_ORIENTACOES.porResposta,
): Orientacao[] {
  const texto = normalizarTexto(mensagem);
  if (!texto) return [];
  const cercado = ` ${texto} `;
  const raizes = new Set(
    texto
      .split(" ")
      .filter((p) => p.length >= 4)
      .map(raiz),
  );
  const pontuadas: Array<{ o: Orientacao; pontos: number; ordem: number }> = [];
  orientacoes.forEach((o, ordem) => {
    if (!o.ativa) return;
    let pontos = 0;
    for (const bruta of o.palavras) {
      const p = normalizarTexto(bruta);
      if (!p) continue;
      if (p.includes(" ")) {
        if (cercado.includes(` ${p} `)) pontos += p.split(" ").length;
      } else if (p.length >= 5) {
        if (raizes.has(raiz(p))) pontos += 1;
      } else if (cercado.includes(` ${p} `)) {
        pontos += 1;
      }
    }
    if (pontos > 0) pontuadas.push({ o, pontos, ordem });
  });
  pontuadas.sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem);
  return pontuadas.slice(0, maximo).map((x) => x.o);
}

/** O bloco que entra nas instruções da IA (vazio se não houver orientações). */
export function blocoDeOrientacoes(orientacoes: readonly Orientacao[]): string {
  if (orientacoes.length === 0) return "";
  return [
    "ORIENTAÇÕES DA EQUIPA PARA ESTE TIPO DE PERGUNTA (segue-as; se alguma contrariar as REGRAS FIXAS, as regras fixas ganham):",
    ...orientacoes.map((o, i) => `${i + 1}. ${o.instrucao}`),
  ].join("\n");
}
