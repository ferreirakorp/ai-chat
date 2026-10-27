"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { preencher, type TextosDoAssistente } from "../nucleo/conteudo";
import { dataDeEnvio } from "../nucleo/data";
import { LIMITES_DO_HISTORICO } from "../nucleo/historico";
import { IconeLapis, IconeLixo, IconeVoltar } from "./icones";

// O histórico de conversas deste aparelho: cada conversa com o seu título (dado pela IA ou, sem ela, feito das palavras da conversa),
// que a pessoa pode mudar; abrir uma continua-a; cada uma pode ser apagada. Cobre a conversa por baixo do cabeçalho.
// Mudar o título: o lápis torna o título editável no próprio sítio (a mesma letra, sem caixa nem outros botões); guarda-se com Enter, ao sair
// do campo ou com o lápis outra vez; o Escape desiste.

export type ItemDoHistorico = {
  id: string;
  titulo: string;
  /** Quando a conversa mexeu pela última vez (ms). */
  atualizada: number;
  mensagens: number;
};

export function HistoricoDoChat({
  textos,
  aberto,
  itens,
  atual,
  ocupado,
  aoVoltar,
  aoAbrir,
  aoRenomear,
  aoApagar,
}: {
  textos: TextosDoAssistente["historico"];
  aberto: boolean;
  itens: readonly ItemDoHistorico[];
  /** A conversa que está aberta no chat (aparece destacada). */
  atual: string;
  /** A IA está a responder: não se muda de conversa nem se apaga nada enquanto isso. */
  ocupado: boolean;
  aoVoltar: () => void;
  aoAbrir: (id: string) => void;
  aoRenomear: (id: string, titulo: string) => void;
  aoApagar: (id: string) => void;
}): ReactElement {
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  // o Escape desistiu: o campo que desaparece não guarda ao sair
  const desistiu = useRef(false);

  useEffect(() => {
    if (editando) {
      campo.current?.focus();
      campo.current?.select();
    }
  }, [editando]);

  const comecar = (item: ItemDoHistorico) => {
    desistiu.current = false;
    setRascunho(item.titulo);
    setEditando(item.id);
  };
  const confirmar = () => {
    if (editando && rascunho.trim()) aoRenomear(editando, rascunho);
    setEditando(null);
  };
  const guardar = (e: FormEvent) => {
    e.preventDefault();
    confirmar();
  };
  const legenda = (item: ItemDoHistorico) =>
    `${dataDeEnvio(item.atualizada)} · ${item.mensagens === 1 ? textos.umaMensagem : preencher(textos.mensagens, { n: item.mensagens })}`;

  return (
    <div
      className="aia-historico"
      data-aberto={aberto ? "sim" : "nao"}
      inert={!aberto}
      role="region"
      aria-label={textos.titulo}
    >
      <div className="aia-historico-topo">
        <button
          type="button"
          className="aia-historico-voltar"
          onClick={aoVoltar}
          aria-label={textos.voltar}
          title={textos.voltar}
        >
          <IconeVoltar className="aia-icone-medio" />
        </button>
        <h3>{textos.titulo}</h3>
      </div>
      {itens.length === 0 ? (
        <p className="aia-historico-vazio">{textos.vazio}</p>
      ) : (
        <ul className="aia-historico-lista">
          {itens.map((item) => {
            const aEditar = editando === item.id;
            return (
              <li key={item.id} className="aia-historico-item" data-atual={item.id === atual ? "sim" : "nao"}>
                <form className="aia-historico-linha" onSubmit={guardar}>
                  {aEditar ? (
                    <div className="aia-historico-abrir" data-edicao="sim">
                      <input
                        ref={campo}
                        type="text"
                        className="aia-historico-titulo-campo"
                        value={rascunho}
                        maxLength={LIMITES_DO_HISTORICO.titulo}
                        onChange={(e) => setRascunho(e.target.value)}
                        onBlur={() => {
                          if (!desistiu.current) confirmar();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            desistiu.current = true;
                            setEditando(null);
                          }
                        }}
                        aria-label={textos.renomear}
                      />
                      <small>{legenda(item)}</small>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="aia-historico-abrir"
                      disabled={ocupado}
                      onClick={() => aoAbrir(item.id)}
                      aria-label={`${textos.abrir}: ${item.titulo}`}
                    >
                      <strong>{item.titulo}</strong>
                      <small>{legenda(item)}</small>
                    </button>
                  )}
                  <button
                    type="button"
                    className="aia-historico-acao"
                    aria-label={aEditar ? textos.guardarTitulo : textos.renomear}
                    title={aEditar ? textos.guardarTitulo : textos.renomear}
                    // o toque no lápis não tira o foco do campo: guarda-se uma vez, com o clique
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (aEditar ? confirmar() : comecar(item))}
                  >
                    <IconeLapis className="aia-icone-pequeno" />
                  </button>
                  <button
                    type="button"
                    className="aia-historico-acao aia-historico-apagar"
                    disabled={ocupado}
                    aria-label={textos.apagar}
                    title={textos.apagar}
                    onClick={() => aoApagar(item.id)}
                  >
                    <IconeLixo className="aia-icone-pequeno" />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
