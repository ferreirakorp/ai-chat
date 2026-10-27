// A cadeia de pensamento: os passos do raciocínio do assistente, cada um com o seu estado (feito, a fazer ou por fazer), a descrição e, no
// passo da pesquisa, o que se procurou e as fontes encontradas (numeradas como as bolas que a resposta cita). Serve ao chat (dentro do
// «Pensou durante…») e ao painel (a equipa lê-o). Sem estado e sem hooks: funciona num componente de servidor e num de cliente.
import type { ReactElement } from "react";
import { estadoDoFio, type PassoDoRaciocinio } from "../nucleo/pensar";
import "../estilos/raciocinio.css";
import { IconeLigacaoExterna, IconeLupa, IconeVisto } from "./icones";

export type RotulosDaCadeia = { consulta: string; fontes: string; abrirFonte: string; abrirPesquisa: string };

const ROTULOS_PADRAO: RotulosDaCadeia = {
  consulta: "Pesquisa",
  fontes: "Fontes",
  abrirFonte: "Abrir a fonte",
  abrirPesquisa: "Pesquisar no Google",
};

/** O endereço da fonte sem o `https://` nem o `www.` e com as letras acentuadas legíveis, para se ver de onde veio («pt.wikipedia.org/wiki/João_Lourenço»). */
function enderecoCurto(url: string): string {
  try {
    const u = new URL(url);
    let caminho = u.pathname === "/" ? "" : u.pathname;
    try {
      caminho = decodeURIComponent(caminho);
    } catch {
      // um % solto: fica como veio
    }
    return `${u.hostname.replace(/^www\./, "")}${caminho}`;
  } catch {
    return url;
  }
}

/** A marca de um passo: círculo azul 3D com visto (feito), anel a pontilhado azul a rodar (a fazer) ou anel a pontilhado (por fazer). Entre as bolas passa um fio (ver `estadoDoFio`). */
export function MarcaDoPasso({ estado }: { estado: PassoDoRaciocinio["estado"] }): ReactElement {
  return (
    <span className="aia-cadeia-marca" data-estado={estado} aria-hidden="true">
      {estado === "feito" ? <IconeVisto className="aia-cadeia-visto" /> : null}
    </span>
  );
}

export function PassosDoRaciocinio({
  passos,
  rotulos,
  fonteEmFoco,
  modeloDaPesquisa,
}: {
  passos: readonly PassoDoRaciocinio[];
  /** Os textos desta peça; os que faltam ficam em português. */
  rotulos?: Partial<RotulosDaCadeia>;
  /** O número da fonte a realçar (quando a pessoa clica na bola dela no texto da resposta). */
  fonteEmFoco?: number;
  /** O endereço para onde leva o termo pesquisado, com `{q}` no lugar dele (um motor de pesquisa). Sem ele, o termo não é uma ligação. */
  modeloDaPesquisa?: string;
}): ReactElement {
  const r = { ...ROTULOS_PADRAO, ...rotulos };
  return (
    <ol className="aia-cadeia">
      {passos.map((p, i) => (
        <li key={`${p.chave}-${i}`} className="aia-cadeia-passo" data-estado={p.estado}>
          <div className="aia-cadeia-lado" aria-hidden="true">
            <MarcaDoPasso estado={p.estado} />
            {i < passos.length - 1 ? <span className="aia-cadeia-linha" data-estado={estadoDoFio(passos, i)} /> : null}
          </div>
          <div className="aia-cadeia-corpo">
            <h4 className="aia-cadeia-titulo">{p.titulo}</h4>
            {p.descricao ? <p className="aia-cadeia-descricao">{p.descricao}</p> : null}
            {p.consulta ? (
              <p className="aia-cadeia-consulta">
                <IconeLupa className="aia-cadeia-lupa" />
                <strong>{r.consulta}</strong>
                {modeloDaPesquisa ? (
                  <a
                    href={modeloDaPesquisa.replace("{q}", encodeURIComponent(p.consulta))}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="aia-cadeia-termo"
                    title={r.abrirPesquisa}
                  >
                    {`'${p.consulta}'`}
                  </a>
                ) : (
                  <span className="aia-cadeia-termo">{`'${p.consulta}'`}</span>
                )}
              </p>
            ) : null}
            {p.fontes && p.fontes.length > 0 ? (
              <ol className="aia-cadeia-fontes" aria-label={r.fontes}>
                {p.fontes.map((f, j) => (
                  <li key={f.url} data-fonte={j + 1}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="aia-cadeia-fonte"
                      data-foco={fonteEmFoco === j + 1 ? "sim" : "nao"}
                      title={r.abrirFonte}
                    >
                      <span className="aia-cadeia-bola" aria-hidden="true">
                        {j + 1}
                      </span>
                      <span className="aia-cadeia-fonte-texto">
                        <strong>{f.titulo}</strong>
                        {f.resumo ? <small>{f.resumo}</small> : null}
                        <em>{enderecoCurto(f.url)}</em>
                      </span>
                      <IconeLigacaoExterna className="aia-cadeia-fonte-externa" />
                    </a>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
