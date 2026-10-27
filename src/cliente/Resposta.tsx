import { Fragment, type ElementType, type ReactElement, type ReactNode } from "react";
import { preencher } from "../nucleo/conteudo";
import type { EsquemaDoFormulario } from "../nucleo/formulario";
import { analisarResposta, nomeDaPagina, type Inline, type OpcoesDaResposta } from "../nucleo/resposta-rica";
import { IconeDaLigacao, IconeSetaDiagonal } from "./icones";
import { tipoDaLigacao, type TipoDeLigacao } from "../nucleo/ligacoes";

export type FonteDaResposta = { titulo: string; url: string };

/** O que as fontes são para uma linha: a lista (pela ordem dos números [1], [2]…), o que fazer ao clicar numa e o texto acessível. */
type FontesDaLinha = {
  lista: readonly FonteDaResposta[];
  /** Se a mensagem tem o raciocínio com a pesquisa, clicar numa fonte abre-o nela; senão a bola leva à própria página da fonte. */
  aoVer: ((n: number) => void) | undefined;
  /** {n} e {titulo} */
  modelo: string;
};

/** O que se vê de uma fonte no texto: uma bola numerada (e, quando é um facto da pesquisa, o texto a tracejado antes dela). */
function AlvoDaFonte({
  fontes,
  n,
  className,
  tabIndex,
  children,
}: {
  fontes: FontesDaLinha;
  n: number;
  className: string;
  tabIndex?: number;
  children: ReactNode;
}): ReactElement {
  const fonte = fontes.lista[n - 1] as FonteDaResposta;
  const rotulo = preencher(fontes.modelo, { n, titulo: fonte.titulo });
  if (fontes.aoVer) {
    const ver = fontes.aoVer;
    return (
      <button type="button" className={className} title={rotulo} tabIndex={tabIndex} onClick={() => ver(n)}>
        {children}
      </button>
    );
  }
  return (
    <a
      className={className}
      href={fonte.url}
      title={rotulo}
      tabIndex={tabIndex}
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      {children}
    </a>
  );
}

/**
 * Uma linha de texto: negrito, `código`, ligações (do site abrem aqui; as de fora noutro separador), telefones/e-mails clicáveis e as
 * fontes da pesquisa na web — uma bola numerada à frente do texto (e, num facto tirado da pesquisa, o texto tracejado e esbatido).
 * Um número sem fonte (a IA enganou-se) não se mostra.
 */
function Linha({
  pedacos,
  Ligacao,
  aoSeguir,
  fontes,
}: {
  pedacos: Inline[];
  Ligacao: ElementType;
  aoSeguir: () => void;
  fontes: FontesDaLinha;
}): ReactElement {
  return (
    <>
      {pedacos.map((p, i) => {
        if (p.t === "texto") return <Fragment key={i}>{p.texto}</Fragment>;
        if (p.t === "negrito") return <strong key={i}>{p.texto}</strong>;
        if (p.t === "codigo") return <code key={i}>{p.texto}</code>;
        if (p.t === "citacao" || p.t === "fonte") {
          if (!fontes.lista[p.indice - 1]) return p.t === "fonte" ? <strong key={i}>{p.texto}</strong> : null;
          const bola = (
            <AlvoDaFonte
              fontes={fontes}
              n={p.indice}
              className="aia-fonte-bola"
              tabIndex={p.t === "fonte" ? -1 : undefined}
            >
              {p.indice}
            </AlvoDaFonte>
          );
          if (p.t === "citacao") return <Fragment key={i}>{bola}</Fragment>;
          return (
            <Fragment key={i}>
              <AlvoDaFonte fontes={fontes} n={p.indice} className="aia-fonte-texto">
                <strong>{p.texto}</strong>
              </AlvoDaFonte>
              {bola}
            </Fragment>
          );
        }
        // uma página do site é um clicável dentro do texto: só um preenchimento azul bebé (sem linha), com o NOME da página («contactos»)
        if (p.interna) {
          return (
            <Ligacao key={i} href={p.href} onClick={aoSeguir} className="aia-ligacao-pagina">
              {nomeDaPagina(p.texto)}
            </Ligacao>
          );
        }
        // as outras ligações levam no fim o ícone do que abrem (telefone, e-mail, globo, vídeo, mapa…), colado à última palavra
        const tipo = tipoDaLigacao(p.href, p.interna);
        return (
          <a
            key={i}
            href={p.href}
            className="aia-ligacao"
            data-tipo={tipo}
            {...(p.href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
          >
            <TextoDaLigacao texto={p.texto} tipo={tipo} />
          </a>
        );
      })}
    </>
  );
}

/** O texto de uma ligação com o ícone do que ela abre no fim, colado à última palavra (o ícone nunca fica sozinho numa linha). */
function TextoDaLigacao({ texto, tipo }: { texto: string; tipo: TipoDeLigacao }): ReactElement {
  const corte = texto.trimEnd().lastIndexOf(" ");
  const inicio = corte < 0 ? "" : texto.slice(0, corte + 1);
  const fim = corte < 0 ? texto : texto.slice(corte + 1);
  return (
    <>
      {inicio}
      <span className="aia-ligacao-fim">
        {fim}
        <IconeDaLigacao tipo={tipo} className="aia-ligacao-icone" />
      </span>
    </>
  );
}

/**
 * A resposta do assistente: parágrafos, listas, botões 3D de acção, formulários e, se houve pesquisa na web, as fontes como bolas
 * numeradas dentro do texto (o detalhe completo da pesquisa está no raciocínio). Sem caixa à volta e sem lista de fontes por baixo.
 */
export function Resposta({
  texto,
  fontes,
  aoVerFonte,
  modeloDaFonte,
  aoEscolher,
  semBotoes = false,
  opcoes,
  Ligacao,
  aoSeguir,
  formulario,
  cartoes,
}: {
  texto: string;
  fontes: FonteDaResposta[] | undefined;
  /** Abre o raciocínio na fonte `n`. Sem isto a bola leva à página da fonte. */
  aoVerFonte?: ((n: number) => void) | undefined;
  /** O texto acessível da bola de uma fonte: «Ver a fonte {n} no raciocínio: {titulo}». */
  modeloDaFonte: string;
  /** Enviar uma das opções de um clique («[[pergunta: …]]») como mensagem da pessoa. Sem isto as opções ficam desactivadas. */
  aoEscolher?: ((texto: string) => void) | undefined;
  /** Não mostra os botões de acção desta resposta (um botão repetido; ver `botaoRepetido`). */
  semBotoes?: boolean;
  opcoes: OpcoesDaResposta;
  Ligacao: ElementType;
  aoSeguir: () => void;
  /** Desenha o formulário que a IA pediu (o componente de quem usa decide o que fazer com as respostas). */
  formulario: (esquema: EsquemaDoFormulario) => ReactNode;
  /** Os cartões do projecto que a IA pôs no meio do texto («[[cartao]]»), pela ordem em que ela os pediu. */
  cartoes?: readonly ReactNode[] | undefined;
}): ReactElement {
  const dasFontes: FontesDaLinha = { lista: fontes ?? [], aoVer: aoVerFonte, modelo: modeloDaFonte };
  let proximoCartao = 0;
  return (
    <>
      {analisarResposta(texto, opcoes).map((bloco, i) => {
        // as opções de um clique: bullets em que cada pergunta é um clicável (a pessoa continua a conversa sem escrever)
        if (bloco.t === "perguntas") {
          return (
            <ul key={i} className="aia-opcoes">
              {bloco.opcoes.map((opcao) => (
                <li key={opcao}>
                  <button
                    type="button"
                    className="aia-opcao-rapida"
                    disabled={!aoEscolher}
                    onClick={() => aoEscolher?.(opcao)}
                  >
                    {opcao}
                  </button>
                </li>
              ))}
            </ul>
          );
        }
        if (bloco.t === "paragrafo") {
          return (
            <p key={i} className="aia-bot">
              {bloco.linhas.map((linha, j) => (
                <Fragment key={j}>
                  {j > 0 ? <br /> : null}
                  <Linha pedacos={linha} Ligacao={Ligacao} aoSeguir={aoSeguir} fontes={dasFontes} />
                </Fragment>
              ))}
            </p>
          );
        }
        if (bloco.t === "lista") {
          const Lista = bloco.ordenada ? "ol" : "ul";
          return (
            <Lista key={i} className="aia-bot aia-itens">
              {bloco.itens.map((item, j) => (
                <li key={j}>
                  <Linha pedacos={item} Ligacao={Ligacao} aoSeguir={aoSeguir} fontes={dasFontes} />
                </li>
              ))}
            </Lista>
          );
        }
        if (bloco.t === "formulario") {
          return <div key={i}>{formulario(bloco.esquema)}</div>;
        }
        if (bloco.t === "cartao") {
          const no = cartoes?.[proximoCartao++];
          return no ? (
            <div key={i} className="aia-cartao-no-texto">
              {no}
            </div>
          ) : null;
        }
        if (semBotoes) return null;
        const conteudo = (
          <>
            <span>{bloco.rotulo}</span>
            <span className="aia-botao-seta" aria-hidden="true">
              <IconeSetaDiagonal />
              <IconeSetaDiagonal />
            </span>
          </>
        );
        return (
          <p key={i} className="aia-acao">
            {bloco.interna ? (
              <Ligacao href={bloco.href} className="aia-botao-3d" onClick={aoSeguir}>
                {conteudo}
              </Ligacao>
            ) : (
              <a
                href={bloco.href}
                className="aia-botao-3d"
                {...(bloco.href.startsWith("https://")
                  ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                  : {})}
              >
                {conteudo}
              </a>
            )}
          </p>
        );
      })}
    </>
  );
}
