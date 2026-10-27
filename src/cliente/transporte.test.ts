import { afterEach, describe, expect, it, vi } from "vitest";
import { transporteNdjson, type EventoDoTransporte } from "./transporte";

const ndjson = (linhas: string[], estado = 200) =>
  new Response(linhas.join("\n") + "\n", { status: estado, headers: { "Content-Type": "application/x-ndjson" } });

async function ler(iteravel: AsyncIterable<EventoDoTransporte>): Promise<EventoDoTransporte[]> {
  const eventos: EventoDoTransporte[] = [];
  for await (const e of iteravel) eventos.push(e);
  return eventos;
}

const pedido = {
  historico: [{ papel: "user" as const, texto: "Olá" }],
  caminho: "/",
  conversa: "c-1",
  sinal: new AbortController().signal,
};

afterEach(() => vi.unstubAllGlobals());

describe("o transporte NDJSON do módulo", () => {
  it("lê os eventos do fluxo, linha a linha, e ignora o que não conhece", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ndjson(['{"semPesquisa":"nao"}', "lixo", '{"t":"Olá"}', '{"t":" mundo"}', '{"fim":true}'])),
    );
    const eventos = await ler(transporteNdjson("/api/assistente").perguntar(pedido));
    expect(eventos).toEqual([{ semPesquisa: "nao" }, { t: "Olá" }, { t: " mundo" }, { fim: true }]);
  });

  it("faz o POST com o histórico, o caminho e a conversa", async () => {
    const pedir = vi.fn<typeof fetch>(async () => ndjson(['{"fim":true}']));
    vi.stubGlobal("fetch", pedir);
    await ler(transporteNdjson("/api/assistente").perguntar(pedido));
    const [url, opcoes] = pedir.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assistente");
    expect(opcoes.method).toBe("POST");
    expect(JSON.parse(String(opcoes.body))).toEqual({ mensagens: pedido.historico, caminho: "/", conversa: "c-1" });
  });

  it("diz «limite» quando o servidor responde 429 e «indisponivel» quando não responde em NDJSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 429 })),
    );
    expect(await ler(transporteNdjson("/x").perguntar(pedido))).toEqual([{ erro: "limite" }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } })),
    );
    expect(await ler(transporteNdjson("/x").perguntar(pedido))).toEqual([{ erro: "indisponivel" }]);
  });
});
