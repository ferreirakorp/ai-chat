"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import type { TextosDoAssistente } from "../nucleo/conteudo";
import type { ItemDoMenuExtra } from "./extensoes";
import { IconeFechar, IconeHistorico, IconeLixo, IconeMais } from "./icones";

// O menu (hambúrguer) do cabeçalho do chat: nova conversa, ver o histórico e apagar todo o histórico (este pede confirmação ali mesmo,
// no próprio menu). Fecha ao clicar fora e com o Escape (o componente do chat trata do Escape).

function Itens({
  textos,
  ocupado,
  aoNova,
  aoHistorico,
  aoApagarTudo,
  extras,
}: {
  textos: TextosDoAssistente["menu"];
  ocupado: boolean;
  aoNova: () => void;
  aoHistorico: () => void;
  aoApagarTudo: () => void;
  extras: readonly ItemDoMenuExtra[];
}): ReactElement {
  // a confirmação mora aqui dentro: quando o menu fecha este componente sai (a chave muda) e ela volta ao início
  const [confirmar, setConfirmar] = useState(false);
  if (confirmar) {
    return (
      <div className="aia-menu-confirmar" role="group" aria-label={textos.apagarTudo}>
        <p>{textos.confirmar}</p>
        <div className="aia-menu-confirmar-botoes">
          <button type="button" className="aia-menu-perigo-solido" onClick={aoApagarTudo}>
            {textos.confirmarSim}
          </button>
          <button type="button" className="aia-menu-cancelar" onClick={() => setConfirmar(false)}>
            {textos.confirmarNao}
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <button type="button" role="menuitem" className="aia-menu-item" disabled={ocupado} onClick={aoNova}>
        <IconeMais className="aia-icone-pequeno" />
        {textos.nova}
      </button>
      <button type="button" role="menuitem" className="aia-menu-item" onClick={aoHistorico}>
        <IconeHistorico className="aia-icone-pequeno" />
        {textos.historico}
      </button>
      {extras.map((item) =>
        item.href ? (
          <a key={item.id} role="menuitem" className="aia-menu-item" href={item.href}>
            {item.icone}
            {item.rotulo}
          </a>
        ) : (
          <button key={item.id} type="button" role="menuitem" className="aia-menu-item" onClick={item.aoClicar}>
            {item.icone}
            {item.rotulo}
          </button>
        ),
      )}
      <button
        type="button"
        role="menuitem"
        className="aia-menu-item aia-menu-perigo"
        disabled={ocupado}
        onClick={() => setConfirmar(true)}
      >
        <IconeLixo className="aia-icone-pequeno" />
        {textos.apagarTudo}
      </button>
    </>
  );
}

export function MenuDoChat({
  textos,
  aberto,
  ocupado,
  aoFechar,
  aoNova,
  aoHistorico,
  aoApagarTudo,
  extras = [],
}: {
  textos: TextosDoAssistente["menu"];
  aberto: boolean;
  /** A IA está a responder: não se muda de conversa nem se apaga nada enquanto isso. */
  ocupado: boolean;
  aoFechar: () => void;
  aoNova: () => void;
  aoHistorico: () => void;
  aoApagarTudo: () => void;
  /** Itens do projecto, entre «Histórico» e «Apagar todo o histórico». */
  extras?: readonly ItemDoMenuExtra[];
}): ReactElement {
  const caixa = useRef<HTMLDivElement>(null);

  // clicar fora fecha (o botão do hambúrguer trata do seu próprio clique)
  useEffect(() => {
    if (!aberto) return;
    const aoPremir = (e: PointerEvent) => {
      const alvo = e.target as Element | null;
      if (!alvo || caixa.current?.contains(alvo) || alvo.closest("[data-aia-menu-botao]")) return;
      aoFechar();
    };
    document.addEventListener("pointerdown", aoPremir);
    return () => document.removeEventListener("pointerdown", aoPremir);
  }, [aberto, aoFechar]);

  return (
    <div
      ref={caixa}
      id="aia-menu"
      role="menu"
      aria-label={textos.abrir}
      className="aia-menu"
      data-aberto={aberto ? "sim" : "nao"}
      inert={!aberto}
    >
      <button
        type="button"
        className="aia-menu-topo"
        onClick={aoFechar}
        aria-label={textos.fechar}
        title={textos.fechar}
      >
        <span>{textos.fechar}</span>
        <span className="aia-menu-fechar" aria-hidden="true">
          <IconeFechar className="aia-icone-pequeno" />
        </span>
      </button>
      <Itens
        key={aberto ? "aberto" : "fechado"}
        textos={textos}
        ocupado={ocupado}
        aoNova={aoNova}
        aoHistorico={aoHistorico}
        aoApagarTudo={aoApagarTudo}
        extras={extras}
      />
    </div>
  );
}
