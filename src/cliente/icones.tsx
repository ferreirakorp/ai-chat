// Os ícones do assistente (SVG inline: o módulo não depende de nenhuma biblioteca de ícones). Servem ao chat e ao painel.
import type { ReactElement } from "react";
import type { TipoDeLigacao } from "../nucleo/ligacoes";
import type { FormaDoIcone } from "../nucleo/pensar";

type Props = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function IconeFeito({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </svg>
  );
}

/** Só o visto (sem círculo): vai dentro da marca azul de um passo feito. */
export function IconeVisto({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className} strokeWidth={3.2}>
      <path d="m5.5 12.8 4.2 4.2 8.8-9.4" />
    </svg>
  );
}

/** O telefone: vai no fim de um número de telefone clicável, dentro do texto da resposta. */
function IconeTelefone({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function IconeEmail({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function IconeVideo({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="m22 8-6 4 6 4V8z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function IconeDocumento({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function IconeMapa({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconeImagem({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

/** O ícone que vai no fim de uma ligação do texto, conforme o que ela abre (uma página do site não leva ícone). */
export function IconeDaLigacao({ tipo, className }: Props & { tipo: TipoDeLigacao }): ReactElement | null {
  if (tipo === "telefone") return <IconeTelefone className={className} />;
  if (tipo === "email") return <IconeEmail className={className} />;
  if (tipo === "whatsapp") return <IconeConversa className={className} />;
  if (tipo === "video") return <IconeVideo className={className} />;
  if (tipo === "mapa") return <IconeMapa className={className} />;
  if (tipo === "documento") return <IconeDocumento className={className} />;
  if (tipo === "imagem") return <IconeImagem className={className} />;
  if (tipo === "web") return <IconeGlobo className={className} />;
  return null;
}

/** O clipe: anexar um ficheiro à conversa. */
export function IconeClipe({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="m21.4 11.1-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
    </svg>
  );
}

/** A lupa: vai ao lado da palavra «Pesquisa» no passo em que o assistente pesquisou na web. */
export function IconeLupa({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconeLigacaoExterna({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function IconeSeta({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className} strokeWidth={1.8}>
      <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

/**
 * O X: dois traços cruzados com a MESMA espessura e pontas do hambúrguer do cabeçalho (nunca um SVG fino ao lado de um hambúrguer
 * pesado). O tamanho e a espessura vêm da classe `aia-icone-*`.
 */
export function IconeFechar({ className }: Props): ReactElement {
  return <span className={`aia-xis${className ? ` ${className}` : ""}`} aria-hidden="true" />;
}

export function IconeSetaDiagonal({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M7 17L17 7M8 7h9v9" />
    </svg>
  );
}

export function IconeCima({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function IconeConversa({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
    </svg>
  );
}

export function IconePolegarCima({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z" />
      <path d="M7 11l4-7a2 2 0 0 1 2 2v3h5.2a2 2 0 0 1 2 2.3l-1.1 6.4a2 2 0 0 1-2 1.7H7" />
    </svg>
  );
}

export function IconePolegarBaixo({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3Z" />
      <path d="m17 13-4 7a2 2 0 0 1-2-2v-3H5.8a2 2 0 0 1-2-2.3l1.1-6.4a2 2 0 0 1 2-1.7H17" />
    </svg>
  );
}

export function IconeLixo({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

/** Um relógio com a seta para trás: o histórico. */
export function IconeHistorico({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4.5V8H7" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconeMais({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconeLapis({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

/** O chevron para a esquerda (voltar). */
export function IconeVoltar({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className} strokeWidth={2.2}>
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
    </svg>
  );
}

/** Um cérebro (o assistente a pensar). */
function IconeCerebro({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}

/** Um globo (o assistente a pesquisar na internet). */
function IconeGlobo({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <ellipse cx="12" cy="12" rx="4.2" ry="9" />
    </svg>
  );
}

/** O ícone do que o assistente está a fazer: cérebro, globo ou lápis. */
export function IconeDaAccao({ forma, className }: Props & { forma: FormaDoIcone }): ReactElement {
  if (forma === "globo") return <IconeGlobo className={className} />;
  if (forma === "lapis") return <IconeLapis className={className} />;
  return <IconeCerebro className={className} />;
}

/** Um «i» num círculo: informação (aqui, as datas e as horas da conversa). */
export function IconeInfo({ className }: Props): ReactElement {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.2" />
    </svg>
  );
}
