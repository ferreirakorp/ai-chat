import { describe, expect, it, vi } from "vitest";
import { configuracaoDaIa, fluxoDoAssistente } from "./fluxo-ia";

const CONTA = "0123456789abcdef0123456789abcdef";
const TOKEN = "t".repeat(40);

describe("configuracaoDaIa", () => {
  it("precisa da conta e do token; sem eles não há IA (o chat usa as perguntas prontas)", () => {
    expect(configuracaoDaIa({})).toBeNull();
    expect(configuracaoDaIa({ CLOUDFLARE_ACCOUNT_ID: CONTA })).toBeNull();
    expect(configuracaoDaIa({ CLOUDFLARE_AI_TOKEN: TOKEN })).toBeNull();
    expect(configuracaoDaIa({ CLOUDFLARE_ACCOUNT_ID: "nao-e-um-id", CLOUDFLARE_AI_TOKEN: TOKEN })).toBeNull();
  });

  it("usa os modelos por omissão, ou os de CHAT_MODELOS (só os que parecem modelos da Cloudflare)", () => {
    const base = { CLOUDFLARE_ACCOUNT_ID: CONTA, CLOUDFLARE_AI_TOKEN: TOKEN };
    expect(configuracaoDaIa(base)?.modelos[0]).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(
      configuracaoDaIa({ ...base, CHAT_MODELOS: "@cf/meta/llama-3.1-8b-instruct, ../../etc/passwd" })?.modelos,
    ).toEqual(["@cf/meta/llama-3.1-8b-instruct"]);
  });

  it("CHAT_IA=desligada desliga a IA", () => {
    expect(
      configuracaoDaIa({ CLOUDFLARE_ACCOUNT_ID: CONTA, CLOUDFLARE_AI_TOKEN: TOKEN, CHAT_IA: "desligada" }),
    ).toBeNull();
  });
});

function corpoDe(pedacos: string[], falhaNoFim = false): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controlo) {
      if (i < pedacos.length) controlo.enqueue(codificador.encode(pedacos[i++]!));
      else if (falhaNoFim) controlo.error(new Error("rede"));
      else controlo.close();
    },
  });
}

async function lerTudo(fluxo: ReadableStream<Uint8Array>): Promise<Array<Record<string, unknown>>> {
  const leitor = fluxo.getReader();
  const descodificador = new TextDecoder();
  let texto = "";
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    texto += descodificador.decode(value, { stream: true });
  }
  return texto
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const delta = (t: string) => `data: {"choices":[{"delta":{"content":${JSON.stringify(t)}}}]}\n\n`;

describe("fluxoDoAssistente", () => {
  it("passa o texto à medida que chega, mesmo com linhas partidas ao meio e letras acentuadas", async () => {
    const cancelar = vi.fn();
    const linha = delta("Olá, ");
    const corpo = corpoDe([linha.slice(0, 20), linha.slice(20), delta("mundo é bom"), "data: [DONE]\n\n"]);
    const eventos = await lerTudo(fluxoDoAssistente(corpo, cancelar));
    expect(eventos).toEqual([{ t: "Olá, " }, { t: "mundo é bom" }, { fim: true }]);
    expect(cancelar).toHaveBeenCalled();
  });

  it("ignora as linhas sem texto e fecha com o fim quando o fluxo acaba sem [DONE]", async () => {
    const corpo = corpoDe(['data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n', delta("Sim.")]);
    expect(await lerTudo(fluxoDoAssistente(corpo, () => {}))).toEqual([{ t: "Sim." }, { fim: true }]);
  });

  it("diz «vazio» quando a IA fecha sem dizer nada", async () => {
    const corpo = corpoDe(["data: [DONE]\n\n"]);
    expect(await lerTudo(fluxoDoAssistente(corpo, () => {}))).toEqual([{ erro: "vazio" }]);
  });

  it("diz «cortado» quando a ligação cai a meio da resposta", async () => {
    const corpo = corpoDe([delta("Começo")], true);
    expect(await lerTudo(fluxoDoAssistente(corpo, () => {}))).toEqual([{ t: "Começo" }, { erro: "cortado" }]);
  });
});
