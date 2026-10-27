import { resumirAvaliacoes, type AvaliacaoEnviada, type EstadoDaAvaliacao } from "../nucleo/avaliacoes";
import { horaDeEnvio, ID_DE_CONVERSA, LIMITES_DA_CONVERSA, type RegistoDeConversa } from "../nucleo/conversas";
import type { FormularioValidado, LinhaDeResposta } from "../nucleo/formulario";
import type { NovaOrientacao, Orientacao } from "../nucleo/orientacoes";
import {
  filtrosDeAvaliacao,
  type AvaliacaoGuardada,
  type ConversaGuardada,
  type FormularioGuardado,
  type MensagemGuardadaNoPainel,
  type OrientacaoGuardada,
  type ParametrosDeLista,
  type RepositorioDoAssistente,
} from "./repositorio";

// O armazenamento do assistente em memória: para testes, demonstrações e para experimentar o componente sem base de dados. Perde tudo
// quando o processo termina. Tem o mesmo comportamento do armazenamento em Postgres (substituir, apagar em cascata, filtros, ordens).

type ConversaNaMemoria = ConversaGuardada & { lista: MensagemGuardadaNoPainel[] };

let contador = 0;
const novoId = (): string => {
  contador += 1;
  const n = contador.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${n}`;
};

const pagina = <T>(linhas: T[], p: ParametrosDeLista): T[] => linhas.slice(p.desvio, p.desvio + p.tamanho);
const contem = (texto: string, q: string): boolean => texto.toLowerCase().includes(q.toLowerCase());
const comSentido = <T>(linhas: T[], p: ParametrosDeLista, valor: (x: T) => number): T[] =>
  [...linhas].sort((a, b) => (p.direccao === "asc" ? 1 : -1) * (valor(a) - valor(b)));

export function repositorioMemoria(agora: () => Date = () => new Date()): RepositorioDoAssistente {
  const conversas = new Map<string, ConversaNaMemoria>();
  const avaliacoes = new Map<string, AvaliacaoGuardada>();
  const orientacoes = new Map<string, OrientacaoGuardada>();
  const formularios = new Map<string, FormularioGuardado>();
  let sequenciaDeMensagens = 0;

  const avaliacaoDe = (conversa: string, mensagem: number): AvaliacaoGuardada | undefined =>
    [...avaliacoes.values()].find((a) => a.conversa === conversa && a.mensagem === mensagem);
  const formularioDe = (conversa: string, mensagem: number): FormularioGuardado | undefined =>
    [...formularios.values()].find((f) => f.conversa === conversa && f.mensagem === mensagem);

  return {
    async guardarMensagens(registo: RegistoDeConversa) {
      const t = agora();
      let c = conversas.get(registo.id);
      if (!c) {
        c = {
          id: registo.id,
          criado_em: t,
          ultima_em: t,
          consentimento_em: t,
          pagina: registo.pagina,
          mensagens: 0,
          primeira_pergunta: null,
          lista: [],
        };
        conversas.set(registo.id, c);
      }
      if (c.mensagens + registo.mensagens.length > LIMITES_DA_CONVERSA.total) return "cheia";
      for (const m of registo.mensagens) {
        sequenciaDeMensagens += 1;
        c.lista.push({
          id: sequenciaDeMensagens,
          papel: m.papel,
          texto: m.texto,
          fontes: m.fontes.length ? m.fontes : null,
          raciocinio: m.raciocinio,
          enviado_em: horaDeEnvio(m.em, t.getTime()),
        });
      }
      c.mensagens += registo.mensagens.length;
      c.ultima_em = t;
      c.primeira_pergunta = c.lista.find((m) => m.papel === "user")?.texto ?? null;
      return "ok";
    },

    async apagarConversa(id: string) {
      if (!ID_DE_CONVERSA.test(id)) return false;
      let apagou = conversas.delete(id);
      for (const [k, a] of avaliacoes) {
        if (a.conversa !== id) continue;
        avaliacoes.delete(k);
        apagou = true;
      }
      for (const [k, f] of formularios) {
        if (f.conversa !== id) continue;
        formularios.delete(k);
        apagou = true;
      }
      return apagou;
    },

    async listarConversas(params) {
      let linhas = [...conversas.values()];
      if (params.q) linhas = linhas.filter((c) => c.lista.some((m) => contem(m.texto, params.q)));
      const valor =
        params.ordem === "mensagens"
          ? (c: ConversaNaMemoria) => c.mensagens
          : params.ordem === "inicio"
            ? (c: ConversaNaMemoria) => c.criado_em.getTime()
            : (c: ConversaNaMemoria) => c.ultima_em.getTime();
      const total = linhas.length;
      const lista = pagina(comSentido(linhas, params, valor), params).map((c): ConversaGuardada => ({
        id: c.id,
        criado_em: c.criado_em,
        ultima_em: c.ultima_em,
        consentimento_em: c.consentimento_em,
        pagina: c.pagina,
        mensagens: c.mensagens,
        primeira_pergunta: c.primeira_pergunta,
      }));
      return { linhas: lista, total };
    },

    async lerConversa(id: string) {
      const c = conversas.get(id);
      if (!c) return null;
      const { lista, ...conversa } = c;
      return {
        conversa,
        mensagens: [...lista],
        avaliacoes: [...avaliacoes.values()].filter((a) => a.conversa === id).sort((a, b) => a.mensagem - b.mensagem),
        formularios: [...formularios.values()].filter((f) => f.conversa === id).sort((a, b) => a.mensagem - b.mensagem),
      };
    },

    async guardarAvaliacao(a: AvaliacaoEnviada) {
      const t = agora();
      const antes = avaliacaoDe(a.conversa, a.mensagem);
      const id = antes?.id ?? novoId();
      avaliacoes.set(id, { ...a, id, estado: "nova", criado_em: antes?.criado_em ?? t, atualizado_em: t });
    },

    async retirarAvaliacao(conversa: string, mensagem: number) {
      const a = avaliacaoDe(conversa, mensagem);
      return a ? avaliacoes.delete(a.id) : false;
    },

    async listarAvaliacoes(params) {
      const { sentido, estado } = filtrosDeAvaliacao(params);
      let linhas = [...avaliacoes.values()];
      if (sentido) linhas = linhas.filter((a) => a.sentido === sentido);
      if (estado) linhas = linhas.filter((a) => a.estado === estado);
      if (params.q)
        linhas = linhas.filter(
          (a) => contem(a.pergunta, params.q) || contem(a.resposta, params.q) || contem(a.comentario, params.q),
        );
      const valor =
        params.ordem === "nota" ? (a: AvaliacaoGuardada) => a.nota : (a: AvaliacaoGuardada) => a.criado_em.getTime();
      return { linhas: pagina(comSentido(linhas, params, valor), params), total: linhas.length };
    },

    async lerAvaliacao(id: string) {
      const avaliacao = avaliacoes.get(id);
      if (!avaliacao) return null;
      return { avaliacao, orientacoes: [...orientacoes.values()].filter((o) => o.avaliacao_id === id) };
    },

    async resumoDasAvaliacoes() {
      return resumirAvaliacoes([...avaliacoes.values()], agora());
    },

    async marcarAvaliacao(id: string, estado: EstadoDaAvaliacao) {
      const a = avaliacoes.get(id);
      if (a) avaliacoes.set(id, { ...a, estado, atualizado_em: agora() });
    },

    async listarOrientacoes() {
      return [...orientacoes.values()].sort(
        (a, b) => Number(b.ativa) - Number(a.ativa) || b.criado_em.getTime() - a.criado_em.getTime(),
      );
    },

    async orientacoesAtivas(): Promise<Orientacao[]> {
      return [...orientacoes.values()]
        .filter((o) => o.ativa)
        .map(({ id, titulo, palavras, instrucao, ativa }) => ({ id, titulo, palavras, instrucao, ativa }));
    },

    async guardarOrientacao(o: NovaOrientacao & { id?: string; avaliacaoId?: string | null }) {
      const t = agora();
      if (o.id) {
        const antes = orientacoes.get(o.id);
        if (!antes) throw new Error("orientação inexistente");
        orientacoes.set(o.id, {
          ...antes,
          titulo: o.titulo,
          palavras: o.palavras,
          instrucao: o.instrucao,
          ativa: o.ativa,
          atualizado_em: t,
        });
        return o.id;
      }
      const id = novoId();
      orientacoes.set(id, {
        id,
        titulo: o.titulo,
        palavras: o.palavras,
        instrucao: o.instrucao,
        ativa: o.ativa,
        avaliacao_id: o.avaliacaoId ?? null,
        criado_em: t,
        atualizado_em: t,
      });
      return id;
    },

    async alternarOrientacao(id: string, ativa: boolean) {
      const o = orientacoes.get(id);
      if (o) orientacoes.set(id, { ...o, ativa, atualizado_em: agora() });
    },

    async apagarOrientacao(id: string) {
      orientacoes.delete(id);
    },

    async guardarFormulario(f: FormularioValidado) {
      const antes = formularioDe(f.conversa, f.mensagem);
      const id = antes?.id ?? novoId();
      formularios.set(id, {
        id,
        conversa: f.conversa,
        mensagem: f.mensagem,
        esquema: f.esquema,
        pagina: f.pagina,
        criado_em: agora(),
        respostas: f.respostas,
      });
      return id;
    },

    async listarFormularios(params) {
      let linhas = [...formularios.values()];
      if (params.q) {
        linhas = linhas.filter(
          (f) =>
            contem(f.esquema.titulo, params.q) ||
            f.respostas.some((r) => contem(r.texto, params.q) || contem(r.rotulo, params.q)),
        );
      }
      return {
        linhas: pagina(
          comSentido(linhas, params, (f) => f.criado_em.getTime()),
          params,
        ),
        total: linhas.length,
      };
    },

    async lerFormulario(id: string) {
      return formularios.get(id) ?? null;
    },

    async respostasParaAnalise() {
      const linhas: LinhaDeResposta[] = [];
      for (const f of formularios.values()) {
        for (const r of f.respostas) {
          linhas.push({
            formulario: f.esquema.id,
            campo: r.campo,
            rotulo: r.rotulo,
            tipo: r.tipo,
            texto: r.texto,
            numero: r.numero,
            opcoes: r.opcoes,
            criado_em: f.criado_em,
          });
        }
      }
      return linhas.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()).slice(0, 20000);
    },
  };
}
