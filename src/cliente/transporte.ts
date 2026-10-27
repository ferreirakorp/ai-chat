import { lerEventoDoFluxo, type EventoDoFluxo, type FontePesquisada } from "../nucleo/fluxo";
import type { MensagemDoChat } from "../nucleo/chat";
import type { Raciocinio } from "../nucleo/pensar";

// O transporte: COMO se pergunta à IA. O do módulo faz um POST em `{endpoint}` com o histórico e lê a resposta em NDJSON. Um projecto com
// outro protocolo (um servidor com ferramentas, conversa no servidor, controlo da página…) traz o seu e traduz tudo para os eventos do
// módulo — o texto a chegar (`t`), os passos (`passo`), as fontes, os cartões do projecto — e o chat desenha o resto igual.

/** Os eventos do fluxo do módulo e os cartões do projecto (objectos, fotografias, reservas…), que se juntam à resposta. */
export type EventoDoTransporte = EventoDoFluxo | { cartoes: unknown[] };

export type PedidoDeResposta = {
  /** A conversa até agora (as mensagens em texto simples; a última é a da pessoa). */
  historico: MensagemDoChat[];
  caminho: string;
  /** O identificador desta conversa no navegador (muda em «Nova conversa» e ao abrir outra do histórico): um servidor que guarda a conversa por conta própria sabe assim se continua a mesma. */
  conversa: string;
  sinal: AbortSignal;
  /** O anexo da última mensagem da pessoa (o que `anexos.enviar` devolveu), se levou um. */
  anexo?: unknown;
};

/** Uma mensagem que o servidor já tinha da conversa (quem recarrega a página ou volta de outro separador). */
export type MensagemRemota = {
  de: "bot" | "eu";
  texto: string;
  em: number;
  cartoes?: unknown[];
  anexo?: unknown;
  /** As fontes que a resposta citou ([1], [2]…) e o raciocínio que a levou lá, se o servidor os guardou. */
  fontes?: FontePesquisada[];
  raciocinio?: Raciocinio;
};

export type TransporteDoAssistente = {
  /** Pergunta à IA e devolve a resposta aos poucos. `{ erro: "limite" }` diz que se chegou ao limite de mensagens. */
  perguntar: (pedido: PedidoDeResposta) => AsyncIterable<EventoDoTransporte>;
  /** A conversa que o servidor já tem (só se pede na primeira vez que se abre o chat sem conversa neste separador). */
  carregar?: () => Promise<MensagemRemota[]>;
  /** «Nova conversa»: avisa o servidor. */
  nova?: () => Promise<void>;
};

/**
 * O transporte do módulo: `POST {base}` com `{ mensagens, caminho }` e a resposta em NDJSON (ver `nucleo/fluxo.ts`). `cabecalhos` são os
 * cabeçalhos extra que o projecto quer enviar (por exemplo o idioma).
 */
export function transporteNdjson(base: string, cabecalhos: Record<string, string> = {}): TransporteDoAssistente {
  return {
    async *perguntar({ historico, caminho, conversa, sinal }) {
      const resposta = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cabecalhos },
        body: JSON.stringify({ mensagens: historico, caminho, conversa }),
        signal: sinal,
      });
      if (resposta.status === 429) {
        yield { erro: "limite" };
        return;
      }
      if (!resposta.ok || !resposta.body || !(resposta.headers.get("content-type") ?? "").includes("ndjson")) {
        yield { erro: "indisponivel" };
        return;
      }
      const leitor = resposta.body.getReader();
      const descodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += descodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          const evento = lerEventoDoFluxo(linha);
          if (evento) yield evento;
        }
      }
    },
  };
}
