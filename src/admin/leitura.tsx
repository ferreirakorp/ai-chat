// Os componentes de LEITURA do painel do assistente: mostram o que o assistente guardou (raciocínio, avaliações, respostas de formulários)
// e as medidas. São de apresentação — recebem os dados por props, não sabem de autenticação, rotas nem formulários do projecto — e
// funcionam num componente de servidor. As acções (guardar uma orientação, apagar…) são do projecto.
import type { ReactElement } from "react";
import { PassosDoRaciocinio } from "../cliente/PassosDoRaciocinio";
import type { MotivoDeMa, Nota, ResumoDeAvaliacoes, Sentido } from "../nucleo/avaliacoes";
import { textosPadrao, type TextosDoAssistente } from "../nucleo/conteudo";
import type { EstatisticaDePergunta, RespostaLimpa } from "../nucleo/formulario";
import type { Raciocinio } from "../nucleo/pensar";
import "../estilos/admin.css";

/** O raciocínio de uma resposta, fechado por omissão: «Raciocínio · 5 passos · 3 s» e, ao abrir, a cadeia de pensamento. */
export function RaciocinioLido({
  raciocinio,
  rotulo = "Raciocínio",
  aberto = false,
}: {
  raciocinio: Raciocinio;
  rotulo?: string;
  aberto?: boolean;
}): ReactElement {
  const n = raciocinio.passos.length;
  return (
    <details className="aia-admin-raciocinio" open={aberto}>
      <summary>
        {rotulo} · {n} {n === 1 ? "passo" : "passos"} · {raciocinio.segundos} s
      </summary>
      <div className="aia-admin-raciocinio-corpo">
        <PassosDoRaciocinio passos={raciocinio.passos} />
      </div>
    </details>
  );
}

/** Quanto vale uma avaliação, em palavras: «Boa», «Muito boa», «Excelente» ou «Má». */
export function rotuloDaAvaliacao(sentido: Sentido, nota: number, textos: TextosDoAssistente = textosPadrao): string {
  if (sentido === "ma") return textos.avaliar.ma;
  return textos.avaliar.niveis[(nota === 4 || nota === 5 ? nota : 3) as 3 | 4 | 5];
}

/** A selo de uma avaliação (boa/má e a nota) e os motivos, como etiquetas. */
export function AvaliacaoLida({
  sentido,
  nota,
  motivos,
  comentario,
  textos = textosPadrao,
}: {
  sentido: Sentido;
  nota: Nota;
  motivos: readonly MotivoDeMa[];
  comentario: string;
  textos?: TextosDoAssistente;
}): ReactElement {
  return (
    <div className="aia-admin-avaliacao" data-sentido={sentido}>
      <p className="aia-admin-avaliacao-topo">
        <span className="aia-admin-selo" data-sentido={sentido}>
          {rotuloDaAvaliacao(sentido, nota, textos)}
        </span>
        <span className="aia-admin-nota">{nota}/5</span>
      </p>
      {motivos.length > 0 ? (
        <ul className="aia-admin-motivos">
          {motivos.map((m) => (
            <li key={m}>{textos.avaliar.motivos[m] ?? m}</li>
          ))}
        </ul>
      ) : null}
      {comentario ? <blockquote className="aia-admin-comentario">{comentario}</blockquote> : null}
    </div>
  );
}

/** As respostas de um formulário preenchido: uma pergunta e a sua resposta por linha. */
export function RespostasLidas({ respostas }: { respostas: readonly RespostaLimpa[] }): ReactElement {
  return (
    <dl className="aia-admin-respostas">
      {respostas.map((r) => (
        <div key={r.campo}>
          <dt>{r.rotulo}</dt>
          <dd>{r.texto}</dd>
        </div>
      ))}
    </dl>
  );
}

const percentagem = (parte: number, total: number): number => (total === 0 ? 0 : Math.round((parte / total) * 100));

/** As medidas das avaliações: totais, % de boas, nota média, distribuição das notas, motivos das más e os últimos 14 dias. */
export function MedidasDasAvaliacoes({
  resumo,
  textos = textosPadrao,
}: {
  resumo: ResumoDeAvaliacoes;
  textos?: TextosDoAssistente;
}): ReactElement {
  const maiorDia = Math.max(1, ...resumo.ultimosDias.map((d) => d.boas + d.mas));
  const maiorMotivo = Math.max(1, ...resumo.motivos.map((m) => m.total));
  return (
    <div className="aia-admin-medidas">
      <ul className="aia-admin-kpis">
        <li>
          <span>Avaliações</span>
          <strong>{resumo.total}</strong>
          <small>{resumo.porRever} por rever</small>
        </li>
        <li>
          <span>Respostas boas</span>
          <strong>{resumo.percentagemBoas === null ? "—" : `${resumo.percentagemBoas} %`}</strong>
          <small>
            {resumo.boas} boas · {resumo.mas} más
          </small>
        </li>
        <li>
          <span>Nota média</span>
          <strong>{resumo.notaMedia === null ? "—" : resumo.notaMedia.toFixed(1)}</strong>
          <small>de 1 a 5</small>
        </li>
        <li>
          <span>Com comentário</span>
          <strong>{resumo.comComentario}</strong>
          <small>dizem mais do que a nota</small>
        </li>
      </ul>

      <div className="aia-admin-graficos">
        <section aria-labelledby="aia-notas">
          <h3 id="aia-notas">Notas</h3>
          <ol className="aia-admin-barras">
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <li key={n}>
                <span>
                  {n} ★
                  {n === 5
                    ? ` ${textos.avaliar.niveis[5]}`
                    : n === 4
                      ? ` ${textos.avaliar.niveis[4]}`
                      : n === 3
                        ? ` ${textos.avaliar.niveis[3]}`
                        : n === 1
                          ? ` ${textos.avaliar.ma}`
                          : ""}
                </span>
                <span className="aia-admin-barra" aria-hidden="true">
                  <i
                    data-sentido={n >= 3 ? "boa" : "ma"}
                    style={{ width: `${percentagem(resumo.porNota[n], resumo.total)}%` }}
                  />
                </span>
                <b>{resumo.porNota[n]}</b>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="aia-motivos">
          <h3 id="aia-motivos">Porque foram más</h3>
          {resumo.motivos.length === 0 ? (
            <p className="aia-admin-vazio">Ainda ninguém disse porquê.</p>
          ) : (
            <ol className="aia-admin-barras">
              {resumo.motivos.map((m) => (
                <li key={m.motivo}>
                  <span>{textos.avaliar.motivos[m.motivo] ?? m.motivo}</span>
                  <span className="aia-admin-barra" aria-hidden="true">
                    <i data-sentido="ma" style={{ width: `${percentagem(m.total, maiorMotivo)}%` }} />
                  </span>
                  <b>{m.total}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section aria-labelledby="aia-dias">
        <h3 id="aia-dias">Últimos 14 dias</h3>
        <ol className="aia-admin-dias">
          {resumo.ultimosDias.map((d) => (
            <li key={d.dia} title={`${d.dia}: ${d.boas} boas, ${d.mas} más`}>
              <span className="aia-admin-dia-barra" aria-hidden="true">
                <i data-sentido="ma" style={{ height: `${percentagem(d.mas, maiorDia)}%` }} />
                <i data-sentido="boa" style={{ height: `${percentagem(d.boas, maiorDia)}%` }} />
              </span>
              <small>{d.dia.slice(8)}</small>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** As perguntas que o assistente fez nos formulários e o que as pessoas responderam (para estudar os visitantes). */
export function EstatisticasDasPerguntas({ perguntas }: { perguntas: readonly EstatisticaDePergunta[] }): ReactElement {
  if (perguntas.length === 0) return <p className="aia-admin-vazio">Ainda ninguém respondeu a um formulário.</p>;
  return (
    <ol className="aia-admin-perguntas">
      {perguntas.map((p) => (
        <li key={p.chave} className="aia-admin-pergunta">
          <h3>{p.rotulo}</h3>
          <p className="aia-admin-pergunta-meta">
            {p.respostas} {p.respostas === 1 ? "resposta" : "respostas"} · {p.tipo}
          </p>
          {p.opcoes.length > 0 ? (
            <ol className="aia-admin-barras">
              {p.opcoes.map((o) => (
                <li key={o.opcao}>
                  <span>{o.opcao}</span>
                  <span className="aia-admin-barra" aria-hidden="true">
                    <i data-sentido="boa" style={{ width: `${o.percentagem}%` }} />
                  </span>
                  <b>
                    {o.total} · {o.percentagem} %
                  </b>
                </li>
              ))}
            </ol>
          ) : null}
          {p.media !== null ? (
            <p className="aia-admin-pergunta-numeros">
              Média <b>{p.media}</b> · mínimo <b>{p.minimo}</b> · máximo <b>{p.maximo}</b>
            </p>
          ) : null}
          {p.exemplos.length > 0 ? (
            <ul className="aia-admin-exemplos">
              {p.exemplos.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
