"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import {
  LIMITES_DA_AVALIACAO,
  MOTIVOS_DE_MA,
  NIVEIS_DE_BOA,
  SAIDA_DO_AGRADECIMENTO_MS,
  TEMPO_DO_AGRADECIMENTO_MS,
  TEMPO_PARA_MUDAR_DE_IDEIA_MS,
  type MotivoDeMa,
  type Nota,
  type Sentido,
} from "../nucleo/avaliacoes";
import { preencher, type TextosDoAssistente } from "../nucleo/conteudo";
import { Carregar } from "./Carregar";
import { IconeCima, IconeFechar, IconeFeito, IconeLapis, IconePolegarBaixo, IconePolegarCima } from "./icones";

/** O que a pessoa disse de uma resposta (guardado na mensagem, só no navegador, para mostrar «Avaliada»). */
export type AvaliacaoLocal = { sentido: Sentido; nota: Nota; motivos: MotivoDeMa[]; comentario: string };

type Modo = "fechado" | Sentido;

/** A nota de uma boa avaliação em que a pessoa só escreveu e não escolheu o nível: «Boa», o nível de base. */
const NOTA_DE_BOA_SEM_NIVEL: Nota = 3;

// Avaliar uma resposta: «Esta resposta ajudou?» → BOA (e QUÃO boa: boa, muito boa, excelente) ou MÁ (e, se quiser, PORQUÊ) e, em qualquer dos
// casos, dizer mais se quiser. O envio é um acto expresso: a equipa passa a ver esta pergunta, esta resposta e o raciocínio (diz-se
// no cartão). Depois de enviada, a pessoa tem 5 segundos para mudar de ideia: um lápis com a contagem dos segundos ao lado; passados eles
// a avaliação fica como está.

/** Os segundos que a pessoa tem para mudar de ideia (a contagem que se vê ao lado do lápis). */
const SEGUNDOS_PARA_MUDAR_DE_IDEIA = Math.round(TEMPO_PARA_MUDAR_DE_IDEIA_MS / 1000);

/** O agradecimento: «visivel» logo a seguir a enviar, «saindo» enquanto desvanece e encolhe, «fora» quando já saiu (ou nunca houve). */
export type FaseDoAgradecimento = "visivel" | "saindo" | "fora";

/**
 * A avaliação enviada: o agradecimento (que sai sozinho), o que a pessoa disse e, enquanto dura o tempo para mudar de ideia, um
 * lápis (alterar) com os segundos que faltam à frente dele. `restantes` é o número de segundos (0 = já passou).
 */
export function AvaliacaoFeita({
  textos,
  avaliacao,
  restantes,
  agradecimento,
  aoAlterar,
}: {
  textos: TextosDoAssistente;
  avaliacao: AvaliacaoLocal;
  restantes: number;
  agradecimento: FaseDoAgradecimento;
  aoAlterar: () => void;
}): ReactElement {
  const t = textos.avaliar;
  const rotulo = avaliacao.sentido === "boa" ? t.niveis[avaliacao.nota as 3 | 4 | 5] : t.ma;
  return (
    <div className="aia-avalia aia-avalia-feita">
      {agradecimento !== "fora" ? (
        <span className="aia-avalia-obrigado" data-saindo={agradecimento === "saindo" ? "sim" : "nao"}>
          <IconeFeito className="aia-avalia-icone" />
          {t.obrigado}
        </span>
      ) : null}
      <span className="aia-avalia-estado">{preencher(t.avaliada, { sentido: rotulo })}</span>
      {restantes > 0 ? (
        <span className="aia-avalia-acoes">
          <span className="aia-avalia-contagem" aria-hidden="true">
            {restantes}s
          </span>
          <button
            type="button"
            className="aia-avalia-lapis"
            onClick={aoAlterar}
            aria-label={t.alterar}
            title={t.alterar}
          >
            <IconeLapis className="aia-icone-pequeno" />
          </button>
        </span>
      ) : null}
    </div>
  );
}

/** Avaliar uma resposta (boa e quão boa, ou má e porquê, e dizer mais); depois de enviar há 5 s para mudar de ideia (o lápis). */
export function Avaliar({
  textos,
  avaliacao,
  aoEnviar,
}: {
  textos: TextosDoAssistente;
  avaliacao: AvaliacaoLocal | undefined;
  aoEnviar: (a: AvaliacaoLocal) => Promise<boolean>;
}): ReactElement {
  const t = textos.avaliar;
  const idDoAviso = useId();
  const cartao = useRef<HTMLFormElement>(null);
  const [modo, setModo] = useState<Modo>("fechado");
  const [nivel, setNivel] = useState<Nota | null>(null);
  const [motivos, setMotivos] = useState<MotivoDeMa[]>([]);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);
  // o tempo para mudar de ideia: só abre ao enviar (uma avaliação que já lá estava, de antes, não o tem) e conta os segundos até 0
  const [restantes, setRestantes] = useState(0);
  // o agradecimento: aparece ao enviar, sai a desvanecer ao fim de 2,5 s e depois deixa de existir
  const [agradecimento, setAgradecimento] = useState<FaseDoAgradecimento>("fora");

  useEffect(() => {
    if (restantes <= 0) return;
    const espera = window.setTimeout(() => setRestantes((r) => r - 1), 1000);
    return () => window.clearTimeout(espera);
  }, [restantes]);

  useEffect(() => {
    if (agradecimento === "fora") return;
    const espera = window.setTimeout(
      () => setAgradecimento(agradecimento === "visivel" ? "saindo" : "fora"),
      agradecimento === "visivel" ? TEMPO_DO_AGRADECIMENTO_MS : SAIDA_DO_AGRADECIMENTO_MS,
    );
    return () => window.clearTimeout(espera);
  }, [agradecimento]);

  // ao abrir a avaliação o cartão fica TODO à vista, acima da escrita do chat (senão tinha de se rolar para cima para a escrever)
  useEffect(() => {
    if (modo === "fechado") return;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const espera = window.setTimeout(
      () => cartao.current?.scrollIntoView({ block: "end", behavior: reduzido ? "auto" : "smooth" }),
      80,
    );
    return () => window.clearTimeout(espera);
  }, [modo]);

  const abrir = (sentido: Sentido, anterior?: AvaliacaoLocal) => {
    setRestantes(0);
    setAgradecimento("fora");
    setModo(sentido);
    setErro(false);
    setNivel(anterior?.sentido === "boa" ? anterior.nota : null);
    setMotivos(anterior?.sentido === "ma" ? anterior.motivos : []);
    setComentario(anterior?.comentario ?? "");
  };

  const fechar = () => {
    setModo("fechado");
    setErro(false);
  };

  // enviar: uma boa avaliação precisa de um nível OU de uma palavra escrita (o que a pessoa escreveu já chega); uma má pode ir logo
  const podeEnviar = modo === "ma" || nivel !== null || comentario.trim().length > 0;

  const submeter = async (e: FormEvent) => {
    e.preventDefault();
    if (modo === "fechado" || enviando) return;
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(false);
    const ok = await aoEnviar({
      sentido: modo,
      nota: modo === "boa" ? (nivel ?? NOTA_DE_BOA_SEM_NIVEL) : 1,
      motivos: modo === "ma" ? motivos : [],
      comentario: comentario.trim(),
    });
    setEnviando(false);
    if (ok) {
      fechar();
      setRestantes(SEGUNDOS_PARA_MUDAR_DE_IDEIA);
      setAgradecimento("visivel");
    } else setErro(true);
  };

  /** A pergunta que vive dentro da caixa de texto (a de uma boa avaliação ou a de uma má). */
  const pergunta = modo === "ma" ? t.perguntaMa : t.perguntaBoa;

  const alternarMotivo = (m: MotivoDeMa) =>
    setMotivos((atuais) => (atuais.includes(m) ? atuais.filter((x) => x !== m) : [...atuais, m]));

  if (modo === "fechado") {
    if (avaliacao) {
      return (
        <AvaliacaoFeita
          textos={textos}
          avaliacao={avaliacao}
          restantes={restantes}
          agradecimento={agradecimento}
          aoAlterar={() => abrir(avaliacao.sentido, avaliacao)}
        />
      );
    }
    return (
      <div className="aia-avalia">
        <span className="aia-avalia-pergunta">{t.pergunta}</span>
        <button type="button" className="aia-avalia-polegar" onClick={() => abrir("boa")}>
          <IconePolegarCima className="aia-avalia-icone" />
          {t.boa}
        </button>
        <button type="button" className="aia-avalia-polegar" onClick={() => abrir("ma")}>
          <IconePolegarBaixo className="aia-avalia-icone" />
          {t.ma}
        </button>
      </div>
    );
  }

  return (
    <form
      ref={cartao}
      className="aia-avalia-cartao"
      onSubmit={submeter}
      aria-label={t.pergunta}
      // tocar nas opções, no enviar ou no X não tira o foco da caixa de texto: o teclado não fecha a meio do toque (o que fazia o resto do
      // chat voltar a aparecer e o botão fugir de debaixo do dedo)
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      {/* a pergunta mora dentro da caixa de texto */}
      <textarea
        className="aia-avalia-texto"
        rows={3}
        maxLength={LIMITES_DA_AVALIACAO.comentario}
        placeholder={pergunta}
        aria-label={pergunta}
        aria-describedby={idDoAviso}
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
      />
      <span id={idDoAviso} className="aia-so-leitores">
        {t.aviso}
      </span>
      {erro ? (
        <p className="aia-avalia-erro" role="alert">
          {t.erro}
        </p>
      ) : null}
      {/* as opções de avaliação ficam POR BAIXO da caixa de texto, com a seta de enviar e o X vermelho de cancelar */}
      <div className="aia-avalia-rodape">
        {modo === "boa" ? (
          <fieldset className="aia-avalia-grupo">
            <legend className="aia-so-leitores">{t.quaoBoa}</legend>
            <div className="aia-avalia-opcoes" role="radiogroup" aria-label={t.quaoBoa}>
              {NIVEIS_DE_BOA.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={nivel === n}
                  className="aia-avalia-opcao"
                  data-escolhida={nivel === n ? "sim" : "nao"}
                  onClick={() => setNivel((atual) => (atual === n ? null : n))}
                >
                  {t.niveis[n]}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="aia-avalia-grupo">
            <legend className="aia-so-leitores">{t.porque}</legend>
            <div className="aia-avalia-opcoes" role="group" aria-label={t.porque}>
              {MOTIVOS_DE_MA.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={motivos.includes(m)}
                  className="aia-avalia-opcao"
                  data-escolhida={motivos.includes(m) ? "sim" : "nao"}
                  onClick={() => alternarMotivo(m)}
                >
                  {t.motivos[m] ?? m}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="aia-avalia-botoes">
          <button
            type="submit"
            className="aia-avalia-enviar"
            disabled={enviando || !podeEnviar}
            aria-busy={enviando}
            aria-label={enviando ? t.aEnviar : t.enviar}
            title={`${t.enviar}. ${t.aviso}`}
          >
            {enviando ? <Carregar rotulo={t.aEnviar} /> : <IconeCima className="aia-icone-medio" />}
          </button>
          <button
            type="button"
            className="aia-avalia-cancelar"
            onClick={fechar}
            aria-label={t.cancelar}
            title={t.cancelar}
          >
            <IconeFechar className="aia-icone-medio" />
          </button>
        </div>
      </div>
    </form>
  );
}
