"use client";

import { useContext, type CSSProperties, type ReactElement } from "react";
import { ContextoDoCarregar } from "./contexto";

/**
 * O carregamento do assistente: nove quadrados (3×3) que pulsam em cascata — o mesmo carregamento único do site, em ponto pequeno
 * para caber dentro de um botão (usa a cor do texto do botão). O `rotulo` é o que os leitores de ecrã ouvem.
 */
export function Carregar({ rotulo }: { rotulo: string }): ReactElement {
  // um projecto com o seu próprio loading põe-no aqui (prop `Carregar` do assistente)
  const DoProjecto = useContext(ContextoDoCarregar);
  if (DoProjecto) return <DoProjecto rotulo={rotulo} />;
  return (
    <span className="aia-carregar" role="status">
      <span className="aia-carregar-grelha" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ "--aia-atraso": `${i * 0.1}s` } as CSSProperties} />
        ))}
      </span>
      <span className="aia-so-leitores">{rotulo}</span>
    </span>
  );
}
