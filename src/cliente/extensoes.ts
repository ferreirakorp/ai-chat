import type { ReactNode } from "react";

// Os pontos de extensão do assistente: o que um projecto traz de seu sem mexer no módulo. Tudo é opcional.

/** Anexar ficheiros à conversa (qualquer formato): o projecto sabe enviá-los e desenhar a prévia. */
export type AnexosDoAssistente = {
  /** Envia o ficheiro (`aoProgresso` leva 0–1). Devolve o anexo que a mensagem leva ou o código de um erro. */
  enviar: (ficheiro: File, aoProgresso: (fracao: number) => void) => Promise<{ anexo: unknown } | { erro: string }>;
  /** A prévia do anexo dentro da bolha da pessoa. */
  renderizar: (anexo: unknown) => ReactNode;
  rotulos: {
    anexar: string;
    /** O que se lê ao largar ficheiros em cima do chat. */
    largar: string;
    /** «A enviar {nome}» */
    aEnviar: string;
    /** O texto de um erro do envio. */
    erro: (codigo: string) => string;
  };
};

/** Um item que o projecto acrescenta ao menu (hambúrguer) do cabeçalho: uma ligação (`href`) ou uma acção (`aoClicar`). */
export type ItemDoMenuExtra = {
  id: string;
  rotulo: string;
  icone?: ReactNode;
  href?: string;
  aoClicar?: () => void;
};
