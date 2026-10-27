import {
  resumirAvaliacoes,
  type AvaliacaoEnviada,
  type EstadoDaAvaliacao,
  type LinhaParaResumo,
  type MotivoDeMa,
  type Nota,
  type Sentido,
} from "../nucleo/avaliacoes";
import {
  horaDeEnvio,
  ID_DE_CONVERSA,
  LIMITES_DA_CONVERSA,
  type FonteGuardada,
  type RegistoDeConversa,
} from "../nucleo/conversas";
import type {
  EsquemaDoFormulario,
  FormularioValidado,
  LinhaDeResposta,
  RespostaLimpa,
  TipoDeCampo,
} from "../nucleo/formulario";
import type { NovaOrientacao, Orientacao } from "../nucleo/orientacoes";
import type { Raciocinio } from "../nucleo/pensar";
import {
  filtrosDeAvaliacao,
  type AvaliacaoGuardada,
  type ConversaGuardada,
  type ExecutorSql,
  type FormularioGuardado,
  type MensagemGuardadaNoPainel,
  type OrientacaoGuardada,
  type ParametrosDeLista,
  type RepositorioDoAssistente,
} from "./repositorio";

// O armazenamento do assistente em Postgres (esquema em sql/001_assistente.sql). Só chegam aqui conversas que o visitante autorizou
// guardar, avaliações e formulários que ele próprio enviou; não se guarda o endereço IP.

const PRIMEIRA = `(SELECT texto FROM chat_mensagem m WHERE m.conversa_id = c.id AND m.papel = 'user' ORDER BY m.enviado_em, m.id LIMIT 1)`;
const COLUNAS_DA_CONVERSA = `c.id, c.criado_em, c.ultima_em, c.consentimento_em, c.pagina, c.mensagens, ${PRIMEIRA} AS primeira_pergunta`;

/** Procura em texto: `%` e `_` literais. */
const parteDeProcura = (q: string): string => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
const sentidoDaOrdem = (p: ParametrosDeLista): "ASC" | "DESC" => (p.direccao === "asc" ? "ASC" : "DESC");
const idValido = (id: string): boolean => ID_DE_CONVERSA.test(id);

type FilaDeAvaliacao = {
  id: string;
  conversa_id: string;
  mensagem_ref: number;
  sentido: Sentido;
  nota: number;
  motivos: string[];
  comentario: string;
  pergunta: string;
  resposta: string;
  raciocinio: Raciocinio | null;
  fontes: FonteGuardada[] | null;
  pagina: string;
  estado: EstadoDaAvaliacao;
  criado_em: Date;
  atualizado_em: Date;
};

const COLUNAS_DA_AVALIACAO = `a.id, a.conversa_id, a.mensagem_ref, a.sentido, a.nota, a.motivos, a.comentario, a.pergunta, a.resposta,
  a.raciocinio, a.fontes, a.pagina, a.estado, a.criado_em, a.atualizado_em`;

function paraAvaliacao(f: FilaDeAvaliacao): AvaliacaoGuardada {
  return {
    id: f.id,
    conversa: f.conversa_id,
    mensagem: f.mensagem_ref,
    sentido: f.sentido,
    nota: f.nota as Nota,
    motivos: f.motivos as MotivoDeMa[],
    comentario: f.comentario,
    pergunta: f.pergunta,
    resposta: f.resposta,
    raciocinio: f.raciocinio,
    fontes: f.fontes ?? [],
    pagina: f.pagina,
    estado: f.estado,
    criado_em: f.criado_em,
    atualizado_em: f.atualizado_em,
  };
}

type FilaDeOrientacao = {
  id: string;
  titulo: string;
  palavras: string[];
  instrucao: string;
  ativa: boolean;
  avaliacao_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
};

const paraOrientacao = (f: FilaDeOrientacao): OrientacaoGuardada => ({
  id: f.id,
  titulo: f.titulo,
  palavras: f.palavras,
  instrucao: f.instrucao,
  ativa: f.ativa,
  avaliacao_id: f.avaliacao_id,
  criado_em: f.criado_em,
  atualizado_em: f.atualizado_em,
});

type FilaDeFormulario = {
  id: string;
  conversa_id: string;
  mensagem_ref: number;
  esquema: EsquemaDoFormulario;
  pagina: string;
  criado_em: Date;
};

type FilaDeResposta = RespostaLimpa & { formulario_id: string };

export function repositorioPg(executor: ExecutorSql): RepositorioDoAssistente {
  async function respostasDosFormularios(ids: string[]): Promise<Map<string, RespostaLimpa[]>> {
    const mapa = new Map<string, RespostaLimpa[]>();
    if (ids.length === 0) return mapa;
    const linhas = await executor.consultar<FilaDeResposta & { tipo: TipoDeCampo }>(
      `SELECT formulario_id, campo, rotulo, tipo, texto, numero, opcoes FROM chat_resposta
        WHERE formulario_id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    for (const l of linhas) {
      const lista = mapa.get(l.formulario_id) ?? [];
      lista.push({
        campo: l.campo,
        rotulo: l.rotulo,
        tipo: l.tipo,
        texto: l.texto,
        numero: l.numero,
        opcoes: l.opcoes,
      });
      mapa.set(l.formulario_id, lista);
    }
    return mapa;
  }

  const paraFormulario = (f: FilaDeFormulario, respostas: Map<string, RespostaLimpa[]>): FormularioGuardado => ({
    id: f.id,
    conversa: f.conversa_id,
    mensagem: f.mensagem_ref,
    esquema: f.esquema,
    pagina: f.pagina,
    criado_em: f.criado_em,
    respostas: respostas.get(f.id) ?? [],
  });

  return {
    // ─── conversas ───

    async guardarMensagens(registo: RegistoDeConversa) {
      return executor.transaccao(async (tx) => {
        await tx.consultar(`INSERT INTO chat_conversa (id, pagina) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [
          registo.id,
          registo.pagina,
        ]);
        const actual = await tx.umaLinha<{ mensagens: number }>(
          `SELECT mensagens FROM chat_conversa WHERE id = $1 FOR UPDATE`,
          [registo.id],
        );
        if ((actual?.mensagens ?? 0) + registo.mensagens.length > LIMITES_DA_CONVERSA.total) return "cheia" as const;
        for (const m of registo.mensagens) {
          await tx.consultar(
            `INSERT INTO chat_mensagem (conversa_id, papel, texto, fontes, raciocinio, enviado_em) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              registo.id,
              m.papel,
              m.texto,
              m.fontes.length ? JSON.stringify(m.fontes) : null,
              m.raciocinio ? JSON.stringify(m.raciocinio) : null,
              horaDeEnvio(m.em),
            ],
          );
        }
        await tx.consultar(`UPDATE chat_conversa SET mensagens = mensagens + $2, ultima_em = now() WHERE id = $1`, [
          registo.id,
          registo.mensagens.length,
        ]);
        return "ok" as const;
      });
    },

    async apagarConversa(id: string) {
      if (!idValido(id)) return false;
      return executor.transaccao(async (tx) => {
        const conversa = await tx.consultar(`DELETE FROM chat_conversa WHERE id = $1 RETURNING id`, [id]);
        const avaliacoes = await tx.consultar(`DELETE FROM chat_avaliacao WHERE conversa_id = $1 RETURNING id`, [id]);
        const formularios = await tx.consultar(`DELETE FROM chat_formulario WHERE conversa_id = $1 RETURNING id`, [id]);
        return conversa.length + avaliacoes.length + formularios.length > 0;
      });
    },

    async listarConversas(params) {
      const ordens: Record<string, string> = { quando: "c.ultima_em", mensagens: "c.mensagens", inicio: "c.criado_em" };
      const valores: unknown[] = [];
      let onde = "";
      if (params.q) {
        valores.push(parteDeProcura(params.q));
        onde = `WHERE EXISTS (SELECT 1 FROM chat_mensagem m WHERE m.conversa_id = c.id AND m.texto ILIKE $${valores.length})`;
      }
      const ordem = `${ordens[params.ordem] ?? "c.ultima_em"} ${sentidoDaOrdem(params)}`;
      const [total, linhas] = await Promise.all([
        executor.umaLinha<{ n: number }>(`SELECT count(*)::int AS n FROM chat_conversa c ${onde}`, valores),
        executor.consultar<ConversaGuardada>(
          `SELECT ${COLUNAS_DA_CONVERSA} FROM chat_conversa c ${onde} ORDER BY ${ordem}, c.id LIMIT ${Math.floor(params.tamanho)} OFFSET ${Math.floor(params.desvio)}`,
          valores,
        ),
      ]);
      return { linhas, total: total?.n ?? 0 };
    },

    async lerConversa(id: string) {
      if (!idValido(id)) return null;
      const conversa = await executor.umaLinha<ConversaGuardada>(
        `SELECT ${COLUNAS_DA_CONVERSA} FROM chat_conversa c WHERE c.id = $1`,
        [id],
      );
      if (!conversa) return null;
      const [mensagens, avaliacoes, formularios] = await Promise.all([
        executor.consultar<MensagemGuardadaNoPainel>(
          `SELECT id, papel, texto, fontes, raciocinio, enviado_em FROM chat_mensagem WHERE conversa_id = $1 ORDER BY enviado_em, id`,
          [id],
        ),
        executor.consultar<FilaDeAvaliacao>(
          `SELECT ${COLUNAS_DA_AVALIACAO} FROM chat_avaliacao a WHERE a.conversa_id = $1 ORDER BY a.mensagem_ref`,
          [id],
        ),
        executor.consultar<FilaDeFormulario>(
          `SELECT id, conversa_id, mensagem_ref, esquema, pagina, criado_em FROM chat_formulario WHERE conversa_id = $1 ORDER BY mensagem_ref`,
          [id],
        ),
      ]);
      const respostas = await respostasDosFormularios(formularios.map((f) => f.id));
      return {
        conversa,
        mensagens,
        avaliacoes: avaliacoes.map(paraAvaliacao),
        formularios: formularios.map((f) => paraFormulario(f, respostas)),
      };
    },

    // ─── avaliações ───

    async guardarAvaliacao(a: AvaliacaoEnviada) {
      await executor.consultar(
        `INSERT INTO chat_avaliacao (conversa_id, mensagem_ref, sentido, nota, motivos, comentario, pergunta, resposta, raciocinio, fontes, pagina)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (conversa_id, mensagem_ref) DO UPDATE
           SET sentido = EXCLUDED.sentido, nota = EXCLUDED.nota, motivos = EXCLUDED.motivos, comentario = EXCLUDED.comentario,
               pergunta = EXCLUDED.pergunta, resposta = EXCLUDED.resposta, raciocinio = EXCLUDED.raciocinio, fontes = EXCLUDED.fontes,
               pagina = EXCLUDED.pagina, estado = 'nova', atualizado_em = now()`,
        [
          a.conversa,
          a.mensagem,
          a.sentido,
          a.nota,
          a.motivos,
          a.comentario,
          a.pergunta,
          a.resposta,
          a.raciocinio ? JSON.stringify(a.raciocinio) : null,
          a.fontes.length ? JSON.stringify(a.fontes) : null,
          a.pagina,
        ],
      );
    },

    async retirarAvaliacao(conversa: string, mensagem: number) {
      if (!idValido(conversa)) return false;
      const linhas = await executor.consultar(
        `DELETE FROM chat_avaliacao WHERE conversa_id = $1 AND mensagem_ref = $2 RETURNING id`,
        [conversa, mensagem],
      );
      return linhas.length > 0;
    },

    async listarAvaliacoes(params) {
      const { sentido, estado } = filtrosDeAvaliacao(params);
      const valores: unknown[] = [];
      const condicoes: string[] = [];
      if (sentido) {
        valores.push(sentido);
        condicoes.push(`a.sentido = $${valores.length}`);
      }
      if (estado) {
        valores.push(estado);
        condicoes.push(`a.estado = $${valores.length}`);
      }
      if (params.q) {
        valores.push(parteDeProcura(params.q));
        const n = valores.length;
        condicoes.push(`(a.pergunta ILIKE $${n} OR a.resposta ILIKE $${n} OR a.comentario ILIKE $${n})`);
      }
      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
      const ordens: Record<string, string> = { quando: "a.criado_em", nota: "a.nota" };
      const ordem = `${ordens[params.ordem] ?? "a.criado_em"} ${sentidoDaOrdem(params)}`;
      const [total, linhas] = await Promise.all([
        executor.umaLinha<{ n: number }>(`SELECT count(*)::int AS n FROM chat_avaliacao a ${onde}`, valores),
        executor.consultar<FilaDeAvaliacao>(
          `SELECT ${COLUNAS_DA_AVALIACAO} FROM chat_avaliacao a ${onde} ORDER BY ${ordem}, a.id LIMIT ${Math.floor(params.tamanho)} OFFSET ${Math.floor(params.desvio)}`,
          valores,
        ),
      ]);
      return { linhas: linhas.map(paraAvaliacao), total: total?.n ?? 0 };
    },

    async lerAvaliacao(id: string) {
      if (!idValido(id)) return null;
      const fila = await executor.umaLinha<FilaDeAvaliacao>(
        `SELECT ${COLUNAS_DA_AVALIACAO} FROM chat_avaliacao a WHERE a.id = $1`,
        [id],
      );
      if (!fila) return null;
      const orientacoes = await executor.consultar<FilaDeOrientacao>(
        `SELECT id, titulo, palavras, instrucao, ativa, avaliacao_id, criado_em, atualizado_em
           FROM chat_orientacao WHERE avaliacao_id = $1 ORDER BY criado_em DESC`,
        [id],
      );
      return { avaliacao: paraAvaliacao(fila), orientacoes: orientacoes.map(paraOrientacao) };
    },

    async resumoDasAvaliacoes() {
      const linhas = await executor.consultar<LinhaParaResumo>(
        `SELECT sentido, nota, motivos, comentario, estado, criado_em FROM chat_avaliacao ORDER BY criado_em DESC LIMIT 5000`,
      );
      return resumirAvaliacoes(linhas);
    },

    async marcarAvaliacao(id: string, estado: EstadoDaAvaliacao) {
      if (!idValido(id)) return;
      await executor.consultar(`UPDATE chat_avaliacao SET estado = $2, atualizado_em = now() WHERE id = $1`, [
        id,
        estado,
      ]);
    },

    // ─── orientações ───

    async listarOrientacoes() {
      const linhas = await executor.consultar<FilaDeOrientacao>(
        `SELECT id, titulo, palavras, instrucao, ativa, avaliacao_id, criado_em, atualizado_em
           FROM chat_orientacao ORDER BY ativa DESC, criado_em DESC`,
      );
      return linhas.map(paraOrientacao);
    },

    async orientacoesAtivas() {
      const linhas = await executor.consultar<Orientacao>(
        `SELECT id, titulo, palavras, instrucao, ativa FROM chat_orientacao WHERE ativa ORDER BY criado_em`,
      );
      return linhas;
    },

    async guardarOrientacao(o: NovaOrientacao & { id?: string; avaliacaoId?: string | null }) {
      if (o.id) {
        if (!idValido(o.id)) throw new Error("orientação inválida");
        await executor.consultar(
          `UPDATE chat_orientacao SET titulo = $2, palavras = $3, instrucao = $4, ativa = $5, atualizado_em = now() WHERE id = $1`,
          [o.id, o.titulo, o.palavras, o.instrucao, o.ativa],
        );
        return o.id;
      }
      const nova = await executor.umaLinha<{ id: string }>(
        `INSERT INTO chat_orientacao (titulo, palavras, instrucao, ativa, avaliacao_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [o.titulo, o.palavras, o.instrucao, o.ativa, o.avaliacaoId && idValido(o.avaliacaoId) ? o.avaliacaoId : null],
      );
      if (!nova) throw new Error("não foi possível guardar a orientação");
      return nova.id;
    },

    async alternarOrientacao(id: string, ativa: boolean) {
      if (!idValido(id)) return;
      await executor.consultar(`UPDATE chat_orientacao SET ativa = $2, atualizado_em = now() WHERE id = $1`, [
        id,
        ativa,
      ]);
    },

    async apagarOrientacao(id: string) {
      if (!idValido(id)) return;
      await executor.consultar(`DELETE FROM chat_orientacao WHERE id = $1`, [id]);
    },

    // ─── formulários ───

    async guardarFormulario(f: FormularioValidado) {
      return executor.transaccao(async (tx) => {
        const fila = await tx.umaLinha<{ id: string }>(
          `INSERT INTO chat_formulario (conversa_id, mensagem_ref, formulario_ref, titulo, esquema, pagina)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (conversa_id, mensagem_ref) DO UPDATE
             SET formulario_ref = EXCLUDED.formulario_ref, titulo = EXCLUDED.titulo, esquema = EXCLUDED.esquema,
                 pagina = EXCLUDED.pagina, criado_em = now()
           RETURNING id`,
          [f.conversa, f.mensagem, f.esquema.id, f.esquema.titulo, JSON.stringify(f.esquema), f.pagina],
        );
        if (!fila) throw new Error("não foi possível guardar o formulário");
        await tx.consultar(`DELETE FROM chat_resposta WHERE formulario_id = $1`, [fila.id]);
        for (const r of f.respostas) {
          await tx.consultar(
            `INSERT INTO chat_resposta (formulario_id, campo, rotulo, tipo, texto, numero, opcoes) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [fila.id, r.campo, r.rotulo, r.tipo, r.texto, r.numero, r.opcoes],
          );
        }
        return fila.id;
      });
    },

    async listarFormularios(params) {
      const valores: unknown[] = [];
      let onde = "";
      if (params.q) {
        valores.push(parteDeProcura(params.q));
        const n = valores.length;
        onde = `WHERE f.titulo ILIKE $${n} OR EXISTS (SELECT 1 FROM chat_resposta r WHERE r.formulario_id = f.id AND (r.texto ILIKE $${n} OR r.rotulo ILIKE $${n}))`;
      }
      const ordem = `f.criado_em ${sentidoDaOrdem(params)}`;
      const [total, linhas] = await Promise.all([
        executor.umaLinha<{ n: number }>(`SELECT count(*)::int AS n FROM chat_formulario f ${onde}`, valores),
        executor.consultar<FilaDeFormulario>(
          `SELECT f.id, f.conversa_id, f.mensagem_ref, f.esquema, f.pagina, f.criado_em FROM chat_formulario f ${onde}
            ORDER BY ${ordem}, f.id LIMIT ${Math.floor(params.tamanho)} OFFSET ${Math.floor(params.desvio)}`,
          valores,
        ),
      ]);
      const respostas = await respostasDosFormularios(linhas.map((l) => l.id));
      return { linhas: linhas.map((l) => paraFormulario(l, respostas)), total: total?.n ?? 0 };
    },

    async lerFormulario(id: string) {
      if (!idValido(id)) return null;
      const fila = await executor.umaLinha<FilaDeFormulario>(
        `SELECT id, conversa_id, mensagem_ref, esquema, pagina, criado_em FROM chat_formulario WHERE id = $1`,
        [id],
      );
      if (!fila) return null;
      return paraFormulario(fila, await respostasDosFormularios([fila.id]));
    },

    async respostasParaAnalise() {
      return executor.consultar<LinhaDeResposta>(
        `SELECT f.formulario_ref AS formulario, r.campo, r.rotulo, r.tipo, r.texto, r.numero, r.opcoes, r.criado_em
           FROM chat_resposta r JOIN chat_formulario f ON f.id = r.formulario_id
          ORDER BY r.criado_em DESC, r.id LIMIT 20000`,
      );
    },
  };
}
