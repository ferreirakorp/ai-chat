"use client";

import { useEffect, type ReactElement } from "react";
import type { TextosDoAssistente } from "../nucleo/conteudo";
import { TEMPO_DA_PREVIA_MS } from "../nucleo/previa";
import { IconeDaAccao } from "./icones";

// O chat fechado. Enquanto o assistente trabalha o PRÓPRIO botão azul troca o ícone da conversa: o loading dos quadrados a pensar e a
// pesquisar e o lápis (a única coisa animada) a escrever a resposta final; nada pisca. Quando a resposta acaba, o balão mostra o princípio
// dela — só a resposta final, nunca a escrever — em duas linhas (o fim esbate-se), com «I.A. Resposta:» (ou o nome de quem responde) à
// frente, e sai ao fim de 2,5 s.

/** O lápis animado do botão azul, no lugar do ícone da conversa, enquanto o assistente escreve a resposta final com o chat fechado. */
export function IconeDoBotaoAEscrever(): ReactElement {
  return (
    <span className="aia-botao-forma" aria-hidden="true">
      <IconeDaAccao forma="lapis" className="aia-icone-grande" />
    </span>
  );
}

/**
 * A resposta final no balão. `quem` é o token de quem responde («I.A.» ou, se for alguém da equipa, o nome dessa pessoa). Chamar com
 * `key` da mensagem. Não é persistente: enquanto está à vista (`ativo`) conta 2,5 s e avisa o dono (`aoAcabar(id)`) para o balão sair.
 */
export function BalaoDaResposta({
  quem,
  texto,
  textos,
  ativo,
  id,
  aoAcabar,
}: {
  quem: string;
  texto: string;
  textos: TextosDoAssistente;
  /** O balão está à vista (na hero, por exemplo, não está: então nem conta). */
  ativo: boolean;
  id: number;
  aoAcabar: (id: number) => void;
}): ReactElement {
  useEffect(() => {
    if (!ativo) return;
    const espera = window.setTimeout(() => aoAcabar(id), TEMPO_DA_PREVIA_MS);
    return () => window.clearTimeout(espera);
  }, [ativo, aoAcabar, id]);
  return (
    <span className="aia-previa">
      <strong className="aia-previa-quem">{quem}</strong> {textos.previa.resposta} {texto}
    </span>
  );
}
