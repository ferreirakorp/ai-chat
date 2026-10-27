// O raciocínio (cadeia de pensamento) do assistente: os passos REAIS que a resposta percorreu — perceber a pergunta, decidir se pesquisa,
// pesquisar, aplicar as orientações da equipa, escrever — construídos a partir dos eventos do fluxo (nucleo/fluxo.ts). Módulo PURO: serve
// ao chat (mostra-o ao vivo e depois no «Pensou durante…»), ao servidor (valida o que se guarda) e ao painel (lê-o).
import { preencher, type TextosDoAssistente } from "./conteudo";
import {
  LIMITES_DO_FLUXO,
  lerFontesPesquisadas,
  textoLimpo,
  type EventoDoFluxo,
  type FontePesquisada,
  type MotivoSemPesquisa,
} from "./fluxo";

export const CHAVES_DE_PASSO = ["perceber", "decidir", "pesquisar", "orientar", "acao", "escrever", "prontas"] as const;
export type ChaveDePasso = (typeof CHAVES_DE_PASSO)[number];
export type EstadoDoPasso = "feito" | "ativo" | "pendente";

export type PassoDoRaciocinio = {
  chave: ChaveDePasso;
  /** Curto: «Perceber a pergunta». */
  titulo: string;
  /** Uma frase sobre o que se fez neste passo. */
  descricao: string;
  estado: EstadoDoPasso;
  /** Nos passos «pesquisar» e «acao»: o que se procurou na web. */
  consulta?: string;
  /** Só no passo «acao»: o ícone do «A pensar…» enquanto está activo. */
  icone?: FormaDoIcone;
  /** Só no passo «pesquisar»: o que a pesquisa trouxe, pela ordem dos números [1], [2]… que a resposta cita. */
  fontes?: FontePesquisada[];
};

export type Raciocinio = { passos: PassoDoRaciocinio[]; segundos: number };

export const LIMITES_DO_RACIOCINIO = { passos: 14, titulo: 80, descricao: 280, segundos: 600 } as const;

const ordemDe = (chave: ChaveDePasso): number => CHAVES_DE_PASSO.indexOf(chave);

/** O primeiro passo, logo que a pessoa envia a pergunta. */
export function raciocinioInicial(textos: TextosDoAssistente, caminho: string): PassoDoRaciocinio[] {
  const p = textos.pensar.passos;
  return [
    {
      chave: "perceber",
      titulo: p.perceberTitulo,
      descricao: preencher(p.perceberDescricao, { caminho }),
      estado: "ativo",
    },
  ];
}

const marcar = (
  passos: readonly PassoDoRaciocinio[],
  chave: ChaveDePasso,
  estado: EstadoDoPasso,
): PassoDoRaciocinio[] => passos.map((x) => (x.chave === chave ? { ...x, estado } : x));

const sem = (passos: readonly PassoDoRaciocinio[], ...chaves: ChaveDePasso[]): PassoDoRaciocinio[] =>
  passos.filter((x) => !chaves.includes(x.chave));

const ordenar = (passos: PassoDoRaciocinio[]): PassoDoRaciocinio[] =>
  [...passos].sort((a, b) => ordemDe(a.chave) - ordemDe(b.chave));

/** Garante o passo «escrever» (pendente ou activo). */
function comEscrever(
  passos: PassoDoRaciocinio[],
  estado: EstadoDoPasso,
  textos: TextosDoAssistente,
): PassoDoRaciocinio[] {
  const p = textos.pensar.passos;
  if (passos.some((x) => x.chave === "escrever")) return marcar(passos, "escrever", estado);
  return ordenar([...passos, { chave: "escrever", titulo: p.escreverTitulo, descricao: p.escreverAtiva, estado }]);
}

function descricaoSemPesquisa(motivo: MotivoSemPesquisa, textos: TextosDoAssistente): string {
  const p = textos.pensar.passos;
  if (motivo === "equipa") return p.decidirEquipa;
  if (motivo === "limite") return p.decidirLimite;
  if (motivo === "falhou") return p.decidirFalhou;
  return p.decidirNao;
}

/**
 * Acrescenta ao raciocínio o que um evento do fluxo diz (sem mudar o original). O pedaço de texto da resposta põe o passo «escrever»
 * a activo; o fim e os erros não mexem (quem conclui é `concluirRaciocinio`).
 */
export function aplicarEventoAoRaciocinio(
  passos: readonly PassoDoRaciocinio[],
  evento: EventoDoFluxo,
  textos: TextosDoAssistente,
): PassoDoRaciocinio[] {
  const p = textos.pensar.passos;
  if ("semPesquisa" in evento) {
    const base = marcar(sem(passos, "decidir"), "perceber", "feito");
    return comEscrever(
      ordenar([
        ...base,
        {
          chave: "decidir",
          titulo: p.decidirTitulo,
          descricao: descricaoSemPesquisa(evento.semPesquisa, textos),
          estado: "feito",
        },
      ]),
      "ativo",
      textos,
    );
  }
  if ("pesquisa" in evento) {
    const base = marcar(sem(passos, "decidir", "pesquisar"), "perceber", "feito");
    return comEscrever(
      ordenar([
        ...base,
        {
          chave: "decidir",
          titulo: p.decidirTitulo,
          descricao: preencher(p.decidirPesquisa, { consulta: evento.pesquisa }),
          estado: "feito",
        },
        {
          chave: "pesquisar",
          titulo: p.pesquisarTitulo,
          descricao: preencher(p.pesquisarAtiva, { consulta: evento.pesquisa }),
          estado: "ativo",
          consulta: evento.pesquisa,
        },
      ]),
      "pendente",
      textos,
    );
  }
  if ("fontes" in evento) {
    const n = evento.fontes.length;
    const descricao = n === 0 ? p.pesquisarNada : n === 1 ? p.pesquisarUma : preencher(p.pesquisarVarias, { n });
    const atualizado = passos.map((x): PassoDoRaciocinio => {
      if (x.chave !== "pesquisar") return x;
      const resto = { ...x };
      delete resto.fontes;
      return { ...resto, estado: "feito", descricao, ...(n > 0 ? { fontes: evento.fontes } : {}) };
    });
    return comEscrever(atualizado, "ativo", textos);
  }
  if ("orientacoes" in evento) {
    if (evento.orientacoes <= 0) return [...passos];
    const descricao = evento.orientacoes === 1 ? p.orientarUma : preencher(p.orientarVarias, { n: evento.orientacoes });
    return ordenar([
      ...sem(passos, "orientar"),
      { chave: "orientar", titulo: p.orientarTitulo, descricao, estado: "feito" },
    ]);
  }
  if ("passo" in evento) {
    const { titulo, descricao, consulta, fontes, icone } = evento.passo;
    // o mesmo passo outra vez (mesmo título, ainda a decorrer) é o progresso dele: actualiza-o em vez de acrescentar um igual
    const repetido = passos.findIndex((x) => x.chave === "acao" && x.estado === "ativo" && x.titulo === titulo);
    if (repetido >= 0) {
      return passos.map((x, i): PassoDoRaciocinio => {
        if (i !== repetido) return x;
        const resto = { ...x };
        delete resto.fontes;
        return {
          ...resto,
          descricao: descricao || x.descricao,
          estado: fontes ? "feito" : "ativo",
          ...(consulta ? { consulta } : x.consulta ? { consulta: x.consulta } : {}),
          ...(fontes && fontes.length > 0 ? { fontes } : {}),
          ...(icone ? { icone } : x.icone ? { icone: x.icone } : {}),
        };
      });
    }
    // o passo anterior (de uma ferramenta) acabou; este fica a decorrer, a não ser que já traga o resultado (as fontes)
    const feitos = passos.map((x): PassoDoRaciocinio =>
      x.chave === "acao" && x.estado === "ativo" ? { ...x, estado: "feito" } : x,
    );
    return comEscrever(
      ordenar([
        ...marcar(feitos, "perceber", "feito"),
        {
          chave: "acao",
          titulo,
          descricao: descricao || titulo,
          estado: fontes ? "feito" : "ativo",
          ...(consulta ? { consulta } : {}),
          ...(fontes && fontes.length > 0 ? { fontes } : {}),
          ...(icone ? { icone } : {}),
        },
      ]),
      "pendente",
      textos,
    );
  }
  if ("t" in evento) {
    return comEscrever(marcar(passos, "perceber", "feito"), "ativo", textos);
  }
  return [...passos];
}

/**
 * O raciocínio acabado, pronto a guardar na mensagem: todos os passos «feito», pela ordem certa, com o último passo a dizer como a
 * resposta foi escrita (`prontas`: a IA não respondeu e usou-se a resposta pronta da equipa).
 */
export function concluirRaciocinio(
  passos: readonly PassoDoRaciocinio[],
  textos: TextosDoAssistente,
  opcoes: { prontas?: boolean } = {},
): PassoDoRaciocinio[] {
  const p = textos.pensar.passos;
  let r = [...passos].map((x): PassoDoRaciocinio => ({ ...x, estado: "feito" }));
  // um passo de pesquisa sem fontes só pode ser «não trouxe nada» (mesmo que nunca o tenha dito: não fica a «procurar…»)
  r = r.map((x) => (x.chave === "pesquisar" && !x.fontes ? { ...x, descricao: p.pesquisarNada } : x));
  if (opcoes.prontas) {
    r = sem(r, "escrever", "prontas");
    r.push({ chave: "prontas", titulo: p.prontasTitulo, descricao: p.prontasDescricao, estado: "feito" });
  } else {
    r = sem(r, "escrever", "prontas");
    r.push({ chave: "escrever", titulo: p.escreverTitulo, descricao: p.escreverFeita, estado: "feito" });
  }
  return ordenar(r);
}

/** O ícone do que o assistente está a fazer agora (mostra-se quando a pessoa esconde o raciocínio ao vivo). */
export type FormaDoIcone = "cerebro" | "globo" | "lapis";

/**
 * O globo enquanto pesquisa na web, o lápis enquanto escreve e o cérebro nos outros passos (perceber a pergunta, decidir, aplicar as
 * orientações da equipa). Vai pelo passo que está a activo.
 */
export function formaDoRaciocinio(passos: readonly PassoDoRaciocinio[]): FormaDoIcone {
  const ativo = [...passos].reverse().find((p) => p.estado === "ativo");
  if (ativo?.chave === "acao") return ativo.icone ?? "cerebro";
  if (ativo?.chave === "pesquisar") return "globo";
  if (ativo?.chave === "escrever") return "lapis";
  return "cerebro";
}

/** O estado do fio que liga o passo `i` ao seguinte: azul cheio se o seguinte também está feito, a CORRER (ao vivo) se o seguinte é o que se está a fazer, a pontilhado se ainda não chegou lá. */
export function estadoDoFio(passos: readonly Pick<PassoDoRaciocinio, "estado">[], i: number): EstadoDoPasso {
  if (passos[i]?.estado !== "feito") return "pendente";
  return passos[i + 1]?.estado === "feito" ? "feito" : "ativo";
}

/** As frases do raciocínio ao vivo (uma por passo): é o que o «A pensar…» vai mostrando. */
export function frasesDoRaciocinio(passos: readonly PassoDoRaciocinio[]): string[] {
  return passos.map((x) => x.descricao || x.titulo);
}

/** O cabeçalho do raciocínio acabado: «Pensou» + «durante 3 s». */
export function rotuloDoPensar(textos: TextosDoAssistente, segundos: number): { verbo: string; resto: string } {
  return {
    verbo: textos.pensar.pensou,
    resto: preencher(textos.pensar.durante, { s: Math.max(1, Math.round(segundos)) }),
  };
}

const ESTADOS: readonly string[] = ["feito", "ativo", "pendente"];

/** Valida um raciocínio vindo de fora (o que o navegador envia para guardar): forma certa e tamanhos limitados, ou `null`. */
export function validarRaciocinio(valor: unknown): Raciocinio | null {
  if (typeof valor !== "object" || valor === null) return null;
  const { passos, segundos } = valor as { passos?: unknown; segundos?: unknown };
  if (!Array.isArray(passos) || passos.length === 0) return null;
  const lidos: PassoDoRaciocinio[] = [];
  for (const bruto of passos.slice(0, LIMITES_DO_RACIOCINIO.passos)) {
    const { chave, titulo, descricao, estado, fontes, consulta, icone } = (bruto ?? {}) as Record<string, unknown>;
    if (typeof chave !== "string" || !(CHAVES_DE_PASSO as readonly string[]).includes(chave)) continue;
    const t = textoLimpo(titulo, LIMITES_DO_RACIOCINIO.titulo);
    if (!t) continue;
    const listaDeFontes = lerFontesPesquisadas(fontes);
    const consultaLida =
      chave === "pesquisar" || chave === "acao" ? textoLimpo(consulta, LIMITES_DO_FLUXO.consulta) : "";
    const iconeLido =
      chave === "acao" && (icone === "globo" || icone === "lapis" || icone === "cerebro") ? icone : undefined;
    lidos.push({
      chave: chave as ChaveDePasso,
      titulo: t,
      descricao: textoLimpo(descricao, LIMITES_DO_RACIOCINIO.descricao),
      estado: typeof estado === "string" && ESTADOS.includes(estado) ? (estado as EstadoDoPasso) : "feito",
      ...(consultaLida ? { consulta: consultaLida } : {}),
      ...(iconeLido ? { icone: iconeLido } : {}),
      ...(listaDeFontes.length > 0 ? { fontes: listaDeFontes } : {}),
    });
  }
  if (lidos.length === 0) return null;
  const s = typeof segundos === "number" && Number.isFinite(segundos) ? segundos : 0;
  return { passos: lidos, segundos: Math.min(LIMITES_DO_RACIOCINIO.segundos, Math.max(0, Math.round(s))) };
}
