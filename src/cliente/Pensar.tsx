"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import type { TextosDoAssistente } from "../nucleo/conteudo";
import {
  estadoDoFio,
  formaDoRaciocinio,
  frasesDoRaciocinio,
  rotuloDoPensar,
  type PassoDoRaciocinio,
} from "../nucleo/pensar";
import { IconeDaAccao, IconeSeta } from "./icones";
import { MarcaDoPasso, PassosDoRaciocinio } from "./PassosDoRaciocinio";

// O «A pensar…» (e, depois, «Pensou durante N s»): enquanto a resposta não chega, uma linha com brilho e, por baixo, as frases dos passos a
// aparecer (só as últimas, com um esbatido em cima); quando a resposta começa fica «Pensou durante N s» e, se a pessoa abrir, a cadeia de
// pensamento completa (os passos com o seu estado, a descrição, o que se pesquisou e as fontes com todos os detalhes). Os passos são os
// reais (nucleo/pensar.ts). Quando a pessoa clica na bola de uma fonte no texto da resposta, abre-se aqui, já nessa fonte.

// Ao vivo o «A pensar…» leva sempre um ícone do que o assistente está a fazer (o globo ao pesquisar na internet, o cérebro ao pensar e o
// lápis ao escrever, cada um com a sua animação) e o chevron à frente dele; a pessoa pode esconder ou ver as frases. A escolha (ver ou
// esconder) lembra-se nas respostas seguintes, enquanto a página não recarregar.
let verOPensamentoAoVivo = true;

/** A altura máxima das frases ao vivo (px) e do esbatido em cima: o resto sobe e sai. */
const ALTURA_MAXIMA = 132;
const ESBATIDO = 16;

export function Pensar({
  passos,
  feito,
  segundos,
  textos,
  fonteEmFoco,
  modeloDaPesquisa,
}: {
  passos: readonly PassoDoRaciocinio[];
  /** `false` enquanto a resposta não chegou; `true` na mensagem acabada. */
  feito: boolean;
  segundos: number;
  textos: TextosDoAssistente;
  /** A fonte que a pessoa pediu para ver (clicou na bola dela). Cada clique é um objecto novo: abre o raciocínio e leva até à fonte. */
  fonteEmFoco?: { n: number } | undefined;
  /** Para onde leva o termo pesquisado (ver `PassosDoRaciocinio`). */
  modeloDaPesquisa?: string;
}): ReactElement {
  const t = textos.pensar;
  const [aberto, setAberto] = useState(false);
  const [pedidoVisto, setPedidoVisto] = useState<{ n: number } | undefined>(undefined);
  const [aoVivoAberto, setAoVivoAberto] = useState(verOPensamentoAoVivo);
  const gaveta = useRef<HTMLDivElement>(null);
  // um pedido novo abre o raciocínio (ajusta-se durante a renderização, o modo recomendado pelo React: sem efeito e sem piscar)
  if (fonteEmFoco && fonteEmFoco !== pedidoVisto) {
    setPedidoVisto(fonteEmFoco);
    setAberto(true);
  }
  const fluxo = useRef<HTMLDivElement>(null);
  const [alturaDoFluxo, setAlturaDoFluxo] = useState(0);
  const frases = frasesDoRaciocinio(passos);
  const forma = formaDoRaciocinio(passos);

  // mede as frases (mudam de altura quando chega uma nova ou a largura muda) para a janela crescer até ao máximo e depois só subir
  useLayoutEffect(() => {
    const el = fluxo.current;
    if (!el || feito) return;
    const medir = () => setAlturaDoFluxo(el.offsetHeight);
    medir();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    observador?.observe(el);
    return () => observador?.disconnect();
  }, [feito, frases.length]);

  // depois de a gaveta abrir, leva a fonte pedida para a vista
  useEffect(() => {
    if (!feito || !fonteEmFoco) return;
    const espera = window.setTimeout(() => {
      const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gaveta.current
        ?.querySelector<HTMLElement>(`[data-fonte="${fonteEmFoco.n}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: reduzido ? "auto" : "smooth" });
    }, 340);
    return () => window.clearTimeout(espera);
  }, [feito, fonteEmFoco]);

  if (feito) {
    const { verbo, resto } = rotuloDoPensar(textos, segundos);
    return (
      <div className="aia-pensa" data-estado="pensou">
        <button
          type="button"
          className="aia-pensa-cabeca aia-pensa-clicavel"
          aria-expanded={aberto}
          aria-label={`${verbo} ${resto}. ${aberto ? t.esconder : t.mostrar}`}
          onClick={() => setAberto((a) => !a)}
        >
          <span className="aia-pensa-verbo">{verbo}</span>
          <span>{resto}</span>
          <IconeSeta className="aia-pensa-seta" />
        </button>
        <div ref={gaveta} className="aia-pensa-gaveta" data-aberto={aberto ? "sim" : "nao"} inert={!aberto}>
          <div className="aia-pensa-interior">
            <div className="aia-pensa-cartao" role="group" aria-label={t.raciocinio}>
              <PassosDoRaciocinio
                passos={passos}
                rotulos={{
                  consulta: t.consulta,
                  fontes: t.fontes,
                  abrirFonte: t.abrirFonte,
                  abrirPesquisa: t.abrirPesquisa,
                }}
                fonteEmFoco={fonteEmFoco?.n}
                modeloDaPesquisa={modeloDaPesquisa}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const limitada = alturaDoFluxo > ALTURA_MAXIMA;
  const altura = limitada ? ALTURA_MAXIMA : alturaDoFluxo;
  const mascara = limitada ? `linear-gradient(to bottom, transparent 0, #000 ${ESBATIDO}px, #000 100%)` : "none";
  return (
    <div className="aia-pensa" data-estado="a-pensar" role="status">
      <button
        type="button"
        className="aia-pensa-cabeca aia-pensa-clicavel"
        aria-expanded={aoVivoAberto}
        aria-label={`${t.aPensar} ${aoVivoAberto ? t.esconder : t.mostrar}`}
        onClick={() => {
          verOPensamentoAoVivo = !aoVivoAberto;
          setAoVivoAberto(!aoVivoAberto);
        }}
      >
        <span className="aia-pensa-brilho">{t.aPensar}</span>
        <span className="aia-pensa-icone" aria-hidden="true">
          <span key={forma} className="aia-pensa-icone-forma" data-forma={forma}>
            <IconeDaAccao forma={forma} className="aia-icone-pequeno" />
          </span>
        </span>
        <IconeSeta className="aia-pensa-seta" />
      </button>
      <div
        className="aia-pensa-janela"
        data-aberto={aoVivoAberto ? "sim" : "nao"}
        inert={!aoVivoAberto}
        style={{ height: aoVivoAberto ? `${altura}px` : "0px", WebkitMaskImage: mascara, maskImage: mascara }}
      >
        <div
          ref={fluxo}
          className="aia-pensa-fluxo aia-cadeia"
          style={{ transform: `translateY(${limitada ? ALTURA_MAXIMA - alturaDoFluxo : 0}px)` }}
        >
          {passos.map((p, i) => (
            <div key={`${p.chave}-${i}`} className="aia-pensa-passo" data-estado={p.estado}>
              <div className="aia-cadeia-lado" aria-hidden="true">
                <MarcaDoPasso estado={p.estado} />
                {i < passos.length - 1 ? (
                  <span className="aia-cadeia-linha" data-estado={estadoDoFio(passos, i)} />
                ) : null}
              </div>
              <p className="aia-pensa-frase">{p.descricao || p.titulo}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
