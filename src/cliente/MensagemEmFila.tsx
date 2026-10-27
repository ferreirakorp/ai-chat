"use client";

import { useEffect, useRef, type ReactElement } from "react";
import type { TextosDoAssistente } from "../nucleo/conteudo";
import { Carregar } from "./Carregar";

/**
 * Uma mensagem escrita enquanto o assistente ainda trabalhava noutra: a bolha da pessoa com o loading (os nove quadrados) DENTRO dela, à
 * esquerda, até ele a poder ver. Quando passa para a conversa o loading sai a animar (ver `data-saindo` no CSS).
 */
export function MensagemEmFila({ texto, textos }: { texto: string; textos: TextosDoAssistente }): ReactElement {
  const linha = useRef<HTMLDivElement>(null);
  // aparece logo à vista, por baixo do que o assistente está a fazer
  useEffect(() => {
    const espera = window.setTimeout(() => linha.current?.scrollIntoView({ block: "end", behavior: "smooth" }), 60);
    return () => window.clearTimeout(espera);
  }, []);
  return (
    <div ref={linha} className="aia-linha" data-de="eu" data-fila="sim">
      <p className="aia-eu" data-espera="sim">
        <span className="aia-eu-espera">
          <Carregar rotulo={textos.fila.espera} />
        </span>
        <span className="aia-eu-texto">{texto}</span>
      </p>
    </div>
  );
}
