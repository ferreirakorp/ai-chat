import { describe, expect, it, vi } from "vitest";
import { descreverErro, foiFalhaDeRede, repetirSeARedeFalhar } from "./rede";

describe("repetirSeARedeFalhar", () => {
  it("devolve logo o resultado quando o pedido corre bem", async () => {
    const pedir = vi.fn(async () => "ok");
    expect(await repetirSeARedeFalhar(pedir)).toBe("ok");
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("repete uma vez quando a rede falha", async () => {
    const pedir = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce("ok");
    expect(await repetirSeARedeFalhar(pedir)).toBe("ok");
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("só repete uma vez: à segunda falha o erro sobe", async () => {
    const pedir = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(repetirSeARedeFalhar(pedir)).rejects.toThrow("fetch failed");
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("não repete outros erros (tempo esgotado, estado de erro)", async () => {
    const pedir = vi.fn(async () => {
      throw new DOMException("tempo", "TimeoutError");
    });
    await expect(repetirSeARedeFalhar(pedir)).rejects.toThrow("tempo");
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("não repete um pedido já cancelado", async () => {
    const cancelado = AbortSignal.abort();
    const pedir = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(repetirSeARedeFalhar(pedir, cancelado)).rejects.toThrow();
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});

describe("foiFalhaDeRede e descreverErro", () => {
  it("só um TypeError conta como falha de rede", () => {
    expect(foiFalhaDeRede(new TypeError("fetch failed"))).toBe(true);
    expect(foiFalhaDeRede(new Error("estado 500"))).toBe(false);
    expect(foiFalhaDeRede("x")).toBe(false);
  });

  it("escreve o nome do erro e, havendo, o código da causa (sem texto da conversa)", () => {
    const erro = new TypeError("fetch failed", { cause: { code: "EAI_AGAIN" } });
    expect(descreverErro(erro)).toBe("TypeError (EAI_AGAIN)");
    expect(descreverErro(new Error("x"))).toBe("Error");
    expect(descreverErro(42)).toBe("erro");
  });
});
