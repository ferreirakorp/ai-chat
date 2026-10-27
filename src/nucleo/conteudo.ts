// O que descreve UM assistente: o conteúdo (textos, perguntas e respostas), o perfil da empresa (para as instruções da IA) e os textos da
// interface nova (raciocínio e avaliação). Módulo PURO, sem imports de runtime e só com dados que passam de um servidor para um
// componente do navegador (texto, listas e objectos — nunca funções).

export type PerguntaDoAssistente = { pergunta: string; resposta: string };

/**
 * O conteúdo que a equipa edita e o que o chat mostra. Os campos de texto são as etiquetas da interface; `perguntas` são as perguntas
 * sugeridas, as respostas prontas (quando a IA não responde) e as respostas oficiais que a IA sabe; `instrucoes` é a personalidade.
 */
export type ConteudoDoAssistente = {
  nome: string;
  papel: string;
  estado: string;
  abrir: string;
  fechar: string;
  mensagemNova: string;
  campo: string;
  enviar: string;
  aEscrever: string;
  aviso: string;
  /** O atalho de contacto ao lado das perguntas sugeridas; sem `href` não aparece. */
  chamada: { rotulo: string; href: string };
  /** A fotografia do assistente: a `chave` é de quem renderiza (o projecto decide como a mostra); sem ela, o avatar é a silhueta 3D. */
  avatar: { chave: string; alt: string };
  aPesquisar: string;
  fontes: string;
  conversa: { pergunta: string; sim: string; nao: string; guardada: string; parar: string; apagada: string };
  convites: readonly string[];
  abertura: readonly string[];
  perguntas: readonly PerguntaDoAssistente[];
  recuo: { generico: string; limite: string };
  instrucoes: string;
};

/**
 * O que a IA precisa de saber do projecto para as suas instruções fixas. Tudo o que é específico de um negócio (o que faz, que
 * regras de prudência tem, a ortografia, as páginas que existem) vive aqui e não no código do módulo.
 */
export type PerfilDaEmpresa = {
  nomeEmpresa: string;
  /** Uma frase: «uma loja de bicicletas em Lisboa». */
  descricao: string;
  /** A regra do idioma (por exemplo a ortografia de uma variante do português). */
  idioma: string;
  /** Regras de prudência do sector (cada uma vira uma regra numerada): não prometer rendimentos, não dar conselhos médicos… */
  regrasDoDominio: string[];
  /** As páginas do site para onde a IA pode ligar (e que o chat abre dentro do site): «/sobre», «/contactos»… */
  paginas: string[];
  /** Linhas de um exemplo do formato das respostas (negrito, lista e pergunta final; sem botão de contacto, que o modelo copiava para todo o lado). */
  exemploDoFormato: string[];
  /** Assuntos a recusar com simpatia: «política, saúde, programação…». */
  foraDoTema: string;
};

export function perfilPadrao(nomeEmpresa: string): PerfilDaEmpresa {
  return {
    nomeEmpresa,
    descricao: "uma empresa",
    idioma: "Escreve no idioma do visitante.",
    regrasDoDominio: [],
    paginas: ["/"],
    exemploDoFormato: [
      "Temos **duas áreas** para o seu negócio:",
      "1. **Consultoria**: decisões com análise de dados.",
      "2. **Acompanhamento**: apoio contínuo, a longo prazo.",
      "Qual é o seu sector?",
    ],
    foraDoTema: "política, saúde, programação",
  };
}

/** Preenche `{nome}` num modelo de texto: `preencher("durante {s} s", { s: 3 })` → «durante 3 s». */
export function preencher(modelo: string, valores: Record<string, string | number>): string {
  return modelo.replace(/\{(\w+)\}/g, (inteiro, chave: string) =>
    chave in valores ? String(valores[chave]) : inteiro,
  );
}

/** Com quem a pessoa está a falar neste momento: o modelo de IA, uma pessoa da equipa ou ninguém (a IA está fora e responde-se só com as perguntas prontas). */
export type ModoDoAssistente = "ia" | "humano" | "offline";

export const MODOS_DO_ASSISTENTE: readonly ModoDoAssistente[] = ["ia", "humano", "offline"];

/** Lê um modo vindo de fora (o servidor, o navegador): só os três conhecidos. */
export function lerModo(valor: unknown): ModoDoAssistente | null {
  return typeof valor === "string" && (MODOS_DO_ASSISTENTE as readonly string[]).includes(valor)
    ? (valor as ModoDoAssistente)
    : null;
}

/** Os textos da interface do raciocínio e da avaliação. Em português por omissão; um projecto muda os que quiser (`textos` no componente). */
export type TextosDoAssistente = {
  /** O estado ao vivo, por baixo do nome do assistente: com quem se está a falar. */
  estado: Record<ModoDoAssistente, string>;
  /** O botão «i» à frente do estado: mostra (e esconde) a data e a hora de todas as mensagens da conversa. */
  datas: { mostrar: string; esconder: string };
  /** O menu (hambúrguer) do cabeçalho do chat. */
  menu: {
    abrir: string;
    /** A palavra (e o X) que fecham o menu, na primeira faixa do próprio cartão do menu. */
    fechar: string;
    nova: string;
    historico: string;
    apagarTudo: string;
    /** A pergunta antes de apagar todo o histórico. */
    confirmar: string;
    confirmarSim: string;
    confirmarNao: string;
  };
  /** O histórico de conversas deste aparelho. */
  historico: {
    titulo: string;
    voltar: string;
    vazio: string;
    /** O título de uma conversa sem palavras com valor. */
    semTitulo: string;
    umaMensagem: string;
    /** {n} */
    mensagens: string;
    abrir: string;
    renomear: string;
    guardarTitulo: string;
    cancelar: string;
    apagar: string;
    /** O que se diz depois de apagar todo o histórico. */
    apagado: string;
  };
  /** As mensagens escritas enquanto o assistente ainda trabalha noutra: ficam em fila, com o loading, até ele as ver. */
  fila: { espera: string };
  /** O balão do chat fechado: quem responde («I.A.» — ou o nome de quem da equipa responde) e a palavra que vem a seguir. */
  previa: { ia: string; resposta: string };
  pensar: {
    aPensar: string;
    pensou: string;
    /** «durante {s} s» */
    durante: string;
    mostrar: string;
    esconder: string;
    /** O título do cartão do raciocínio, quando aberto. */
    raciocinio: string;
    /** O rótulo da consulta feita na web, no passo da pesquisa. */
    consulta: string;
    /** O rótulo acessível da lista de fontes do passo da pesquisa. */
    fontes: string;
    /** O que a bola de uma fonte diz a quem lê com leitor de ecrã: {n}, {titulo} */
    verFonte: string;
    /** O que a ligação de uma fonte diz: abrir a página de origem. */
    abrirFonte: string;
    /** O termo pesquisado leva ao Google com a pesquisa já feita. */
    abrirPesquisa: string;
    passos: {
      perceberTitulo: string;
      /** {caminho} */
      perceberDescricao: string;
      decidirTitulo: string;
      /** {consulta} */
      decidirPesquisa: string;
      decidirEquipa: string;
      decidirNao: string;
      decidirLimite: string;
      decidirFalhou: string;
      pesquisarTitulo: string;
      /** {consulta} */
      pesquisarAtiva: string;
      pesquisarUma: string;
      /** {n} */
      pesquisarVarias: string;
      pesquisarNada: string;
      orientarTitulo: string;
      orientarUma: string;
      /** {n} */
      orientarVarias: string;
      escreverTitulo: string;
      escreverAtiva: string;
      escreverFeita: string;
      prontasTitulo: string;
      prontasDescricao: string;
    };
  };
  avaliar: {
    pergunta: string;
    boa: string;
    ma: string;
    quaoBoa: string;
    niveis: { 3: string; 4: string; 5: string };
    porque: string;
    motivos: Record<string, string>;
    /** A pergunta que vive DENTRO da caixa de texto de uma boa avaliação (o comentário é opcional). */
    perguntaBoa: string;
    /** E a de uma má avaliação. */
    perguntaMa: string;
    enviar: string;
    /** O que o botão diz enquanto envia (com o carregamento ao lado). */
    aEnviar: string;
    cancelar: string;
    aviso: string;
    obrigado: string;
    /** {sentido} */
    avaliada: string;
    alterar: string;
    erro: string;
  };
  formulario: {
    enviar: string;
    /** O que o botão diz enquanto envia (com o carregamento ao lado). */
    aEnviar: string;
    enviado: string;
    opcional: string;
    sim: string;
    nao: string;
    obrigatorio: string;
    invalido: string;
    aviso: string;
    erro: string;
  };
};

export const textosPadrao: TextosDoAssistente = {
  estado: {
    ia: "A falar com o modelo de IA",
    humano: "A falar com um humano",
    offline: "Ninguém online de momento",
  },
  datas: { mostrar: "Mostrar a data e a hora das mensagens", esconder: "Esconder a data e a hora das mensagens" },
  menu: {
    abrir: "Menu do chat",
    fechar: "Fechar",
    nova: "Nova conversa",
    historico: "Histórico de conversas",
    apagarTudo: "Apagar todo o histórico",
    confirmar: "Apagar todas as conversas guardadas neste aparelho?",
    confirmarSim: "Apagar",
    confirmarNao: "Cancelar",
  },
  historico: {
    titulo: "Histórico de conversas",
    voltar: "Voltar à conversa",
    vazio: "Ainda não há conversas no histórico.",
    semTitulo: "Conversa nova",
    umaMensagem: "1 mensagem",
    mensagens: "{n} mensagens",
    abrir: "Abrir a conversa",
    renomear: "Mudar o título",
    guardarTitulo: "Guardar o título",
    cancelar: "Cancelar",
    apagar: "Apagar esta conversa",
    apagado: "O histórico foi apagado.",
  },
  fila: { espera: "À espera da resposta anterior" },
  previa: { ia: "I.A.", resposta: "Resposta:" },
  pensar: {
    aPensar: "A pensar…",
    pensou: "Pensou",
    durante: "durante {s} s",
    mostrar: "Mostrar o raciocínio",
    esconder: "Esconder o raciocínio",
    raciocinio: "Raciocínio",
    consulta: "Pesquisa",
    fontes: "Fontes",
    verFonte: "Ver a fonte {n} no raciocínio: {titulo}",
    abrirFonte: "Abrir a fonte",
    abrirPesquisa: "Pesquisar no Google",
    passos: {
      perceberTitulo: "Perceber a pergunta",
      perceberDescricao: "Li a mensagem e a página onde a pessoa está ({caminho}).",
      decidirTitulo: "Decidir se é preciso pesquisar",
      decidirPesquisa: "É sobre factos de fora da empresa: pesquisar «{consulta}».",
      decidirEquipa: "A equipa já tem uma resposta para esta pergunta: não é preciso pesquisar.",
      decidirNao: "É sobre a empresa: respondo com o conhecimento da equipa.",
      decidirLimite: "Já se fizeram muitas pesquisas deste endereço: respondo sem pesquisar.",
      decidirFalhou: "A decisão não chegou a tempo: respondo sem pesquisar.",
      pesquisarTitulo: "Pesquisar na web",
      pesquisarAtiva: "A procurar «{consulta}»…",
      pesquisarUma: "Encontrei 1 fonte útil.",
      pesquisarVarias: "Encontrei {n} fontes úteis.",
      pesquisarNada: "A pesquisa não trouxe fontes úteis.",
      orientarTitulo: "Aplicar as orientações da equipa",
      orientarUma: "Segui 1 orientação da equipa para perguntas como esta.",
      orientarVarias: "Segui {n} orientações da equipa para perguntas como esta.",
      escreverTitulo: "Escrever a resposta",
      escreverAtiva: "A escrever a resposta…",
      escreverFeita: "Escrevi a resposta com o conhecimento da empresa e, quando houve, as fontes.",
      prontasTitulo: "Usar as respostas da equipa",
      prontasDescricao: "A IA não estava disponível: escolhi a resposta pronta mais próxima.",
    },
  },
  avaliar: {
    pergunta: "Esta resposta ajudou?",
    boa: "Boa",
    ma: "Má",
    quaoBoa: "Quão boa foi?",
    niveis: { 3: "Boa", 4: "Muito boa", 5: "Excelente" },
    porque: "O que correu mal? (opcional)",
    motivos: {
      "nao-respondeu": "Não respondeu à pergunta",
      errada: "Informação errada",
      incompleta: "Incompleta",
      confusa: "Confusa ou mal escrita",
      longa: "Demasiado longa",
      insistente: "Demasiado insistente",
      outro: "Outro",
    },
    perguntaBoa: "Diga-nos a sua avaliação: quão boa foi?",
    perguntaMa: "Diga-nos a sua avaliação: o que correu mal?",
    enviar: "Enviar avaliação",
    aEnviar: "A enviar…",
    cancelar: "Cancelar",
    aviso: "Ao enviar, a equipa vê esta pergunta, esta resposta e o raciocínio.",
    obrigado: "Obrigado pela avaliação.",
    avaliada: "Avaliada: {sentido}",
    alterar: "Alterar",
    erro: "Não foi possível enviar. Tente de novo.",
  },
  formulario: {
    enviar: "Enviar respostas",
    aEnviar: "A enviar…",
    enviado: "Respostas enviadas",
    opcional: "(opcional)",
    sim: "Sim",
    nao: "Não",
    obrigatorio: "Responda a esta pergunta.",
    invalido: "Confira esta resposta.",
    aviso: "A equipa vê estas respostas.",
    erro: "Não foi possível enviar. Tente de novo.",
  },
};

type Parcial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? Parcial<T[K]> : T[K] };
export type TextosParciais = Parcial<TextosDoAssistente>;

/** Junta os textos de um projecto (parciais, em qualquer profundidade) por cima dos textos por omissão. */
export function juntarTextos(base: TextosDoAssistente, extra: TextosParciais | undefined): TextosDoAssistente {
  if (!extra) return base;
  const unir = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a;
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null && !Array.isArray(a)) {
      const saida: Record<string, unknown> = { ...(a as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b as Record<string, unknown>)) saida[k] = unir(saida[k], v);
      return saida;
    }
    return b;
  };
  return unir(base, extra) as TextosDoAssistente;
}
