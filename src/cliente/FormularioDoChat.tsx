"use client";

import { useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import type { TextosDoAssistente } from "../nucleo/conteudo";
import {
  LIMITES_DO_FORMULARIO,
  validarRespostas,
  type CampoDoFormulario,
  type EsquemaDoFormulario,
  type RespostaLimpa,
  type ValorBruto,
} from "../nucleo/formulario";
import { Carregar } from "./Carregar";
import { IconeFeito } from "./icones";

type Valores = Record<string, ValorBruto | undefined>;

// Um formulário a sério no meio da conversa: a IA descreve as perguntas em JSON (nucleo/formulario.ts) e o chat desenha os campos —
// escolhas, escala, texto, número, e-mail, telefone. A pessoa preenche, o chat valida (as mesmas regras do servidor) e envia: as respostas
// ficam estruturadas para a equipa analisar. Depois de enviado, mostra-se um resumo só de leitura.

function Campo({
  campo,
  valor,
  erro,
  textos,
  aoMudar,
}: {
  campo: CampoDoFormulario;
  valor: ValorBruto | undefined;
  erro: string | undefined;
  textos: TextosDoAssistente["formulario"];
  aoMudar: (v: ValorBruto | undefined) => void;
}): ReactElement {
  const id = useId();
  const legenda = (
    <>
      {campo.rotulo}
      {campo.obrigatorio ? null : <span className="aia-form-opcional"> {textos.opcional}</span>}
    </>
  );

  let controlo: ReactElement;
  if (campo.tipo === "escolha" || campo.tipo === "sim-nao" || campo.tipo === "escala") {
    const opcoes: Array<{ rotulo: string; valor: ValorBruto }> =
      campo.tipo === "escolha"
        ? (campo.opcoes ?? []).map((o) => ({ rotulo: o, valor: o }))
        : campo.tipo === "sim-nao"
          ? [
              { rotulo: textos.sim, valor: true },
              { rotulo: textos.nao, valor: false },
            ]
          : Array.from({ length: (campo.max ?? 5) - (campo.min ?? 1) + 1 }, (_, i) => {
              const n = (campo.min ?? 1) + i;
              return { rotulo: String(n), valor: n };
            });
    controlo = (
      <div
        className="aia-form-opcoes"
        role="radiogroup"
        aria-labelledby={`${id}-l`}
        data-escala={campo.tipo === "escala" ? "sim" : "nao"}
      >
        {opcoes.map((o) => (
          <button
            key={String(o.valor)}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            className="aia-form-opcao"
            data-escolhida={valor === o.valor ? "sim" : "nao"}
            onClick={() => aoMudar(valor === o.valor && !campo.obrigatorio ? undefined : o.valor)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    );
  } else if (campo.tipo === "multipla") {
    const escolhidas = Array.isArray(valor) ? valor : [];
    controlo = (
      <div className="aia-form-opcoes" role="group" aria-labelledby={`${id}-l`}>
        {(campo.opcoes ?? []).map((o) => {
          const ligada = escolhidas.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={ligada}
              className="aia-form-opcao"
              data-escolhida={ligada ? "sim" : "nao"}
              onClick={() => aoMudar(ligada ? escolhidas.filter((x) => x !== o) : [...escolhidas, o])}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  } else {
    const tipoDoCampo =
      campo.tipo === "email"
        ? "email"
        : campo.tipo === "telefone"
          ? "tel"
          : campo.tipo === "numero"
            ? "number"
            : "text";
    controlo = (
      <input
        id={`${id}-c`}
        className="aia-form-entrada"
        type={tipoDoCampo}
        inputMode={campo.tipo === "numero" ? "decimal" : campo.tipo === "telefone" ? "tel" : undefined}
        autoComplete={campo.tipo === "email" ? "email" : campo.tipo === "telefone" ? "tel" : "off"}
        maxLength={campo.tipo === "numero" ? undefined : LIMITES_DO_FORMULARIO.texto}
        {...(campo.tipo === "numero" && campo.min !== undefined ? { min: campo.min } : {})}
        {...(campo.tipo === "numero" && campo.max !== undefined ? { max: campo.max } : {})}
        placeholder={campo.ajuda ?? ""}
        value={typeof valor === "string" ? valor : typeof valor === "number" ? String(valor) : ""}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-e` : undefined}
        onChange={(e) => aoMudar(e.target.value)}
      />
    );
  }

  return (
    <div className="aia-form-campo" data-campo={campo.id}>
      {campo.tipo === "escolha" || campo.tipo === "multipla" || campo.tipo === "sim-nao" || campo.tipo === "escala" ? (
        <p id={`${id}-l`} className="aia-form-legenda">
          {legenda}
        </p>
      ) : (
        <label htmlFor={`${id}-c`} id={`${id}-l`} className="aia-form-legenda">
          {legenda}
        </label>
      )}
      {controlo}
      {erro ? (
        <p id={`${id}-e`} className="aia-form-erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/** Os valores escritos no formulário, no formato que o servidor valida (o texto de um número vira número). */
function valoresParaEnviar(esquema: EsquemaDoFormulario, valores: Valores): Record<string, ValorBruto> {
  const saida: Record<string, ValorBruto> = {};
  for (const c of esquema.campos) {
    const v = valores[c.id];
    if (v === undefined || v === "") continue;
    if (c.tipo === "numero") {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (Number.isFinite(n)) saida[c.id] = n;
      else saida[c.id] = String(v); // fica inválido e o campo diz porquê
    } else {
      saida[c.id] = v;
    }
  }
  return saida;
}

export function FormularioDoChat({
  esquema,
  respondido,
  textos,
  aoEnviar,
}: {
  esquema: EsquemaDoFormulario;
  /** As respostas já enviadas (o formulário passa a só de leitura). */
  respondido: readonly RespostaLimpa[] | undefined;
  textos: TextosDoAssistente;
  aoEnviar: (valores: Record<string, ValorBruto>, respostas: RespostaLimpa[]) => Promise<boolean>;
}): ReactElement {
  const t = textos.formulario;
  const [valores, setValores] = useState<Valores>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const raiz = useRef<HTMLFormElement>(null);

  if (respondido) {
    return (
      <div className="aia-form aia-form-feito">
        <p className="aia-form-titulo">
          <IconeFeito className="aia-form-icone" />
          {t.enviado}
        </p>
        <dl className="aia-form-resumo">
          {respondido.map((r) => (
            <div key={r.campo}>
              <dt>{r.rotulo}</dt>
              <dd>{r.texto}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const submeter = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    const enviar = valoresParaEnviar(esquema, valores);
    const r = validarRespostas(esquema, enviar);
    if (!r.ok) {
      const campoComErro = r.erro.campo;
      setErros(campoComErro ? { [campoComErro]: r.erro.erro === "obrigatorio" ? t.obrigatorio : t.invalido } : {});
      raiz.current
        ?.querySelector<HTMLElement>(`[data-campo="${campoComErro}"] input, [data-campo="${campoComErro}"] button`)
        ?.focus();
      return;
    }
    setErros({});
    setFalhou(false);
    setEnviando(true);
    const ok = await aoEnviar(enviar, r.respostas);
    setEnviando(false);
    if (!ok) setFalhou(true);
  };

  return (
    <form ref={raiz} className="aia-form" onSubmit={submeter} noValidate aria-label={esquema.titulo || undefined}>
      {esquema.titulo ? <p className="aia-form-titulo">{esquema.titulo}</p> : null}
      {esquema.campos.map((c) => (
        <Campo
          key={c.id}
          campo={c}
          valor={valores[c.id]}
          erro={erros[c.id]}
          textos={t}
          aoMudar={(v) => {
            setValores((a) => ({ ...a, [c.id]: v }));
            if (erros[c.id]) setErros((a) => ({ ...a, [c.id]: "" }));
          }}
        />
      ))}
      <p className="aia-form-aviso">{t.aviso}</p>
      {falhou ? (
        <p className="aia-form-erro" role="alert">
          {t.erro}
        </p>
      ) : null}
      <button type="submit" className="aia-form-enviar" disabled={enviando} aria-busy={enviando}>
        {enviando ? (
          <>
            <Carregar rotulo={t.aEnviar} />
            <span aria-hidden="true">{t.aEnviar}</span>
          </>
        ) : (
          t.enviar
        )}
      </button>
    </form>
  );
}
