import { afterEach, describe, expect, it, vi } from "vitest";
import { fornecedorDePesquisa, limparResumo, pesquisarNaWeb, resultadoValido } from "./pesquisa-web";

const paginas = (...chaves: string[]) =>
  new Response(JSON.stringify({ pages: chaves.map((key) => ({ key, title: key, excerpt: `Sobre ${key}.` })) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const redeFalhou = () => new TypeError("fetch failed");

describe("pesquisarNaWeb (Wikipédia)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefere os resultados em português e devolve fontes https", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("//pt.") ? paginas("Luanda", "Angola") : paginas("Luanda_(city)"))),
    );
    const r = await pesquisarNaWeb("Luanda", {});
    expect(r.map((x) => x.titulo)).toEqual(["Luanda", "Angola"]);
    expect(r.every((x) => x.url.startsWith("https://pt.wikipedia.org/wiki/"))).toBe(true);
  });

  it("recorre ao inglês quando o português não encontra nada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("//pt.") ? paginas() : paginas("Luanda"))),
    );
    const r = await pesquisarNaWeb("Luanda founding", {});
    expect(r).toHaveLength(1);
    expect(r[0]?.url).toBe("https://en.wikipedia.org/wiki/Luanda");
  });

  it("repete uma vez quando a rede falha e depois acerta", async () => {
    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("//pt.") && chamadas++ === 0) throw redeFalhou();
        return url.includes("//pt.") ? paginas("Luanda") : paginas();
      }),
    );
    expect((await pesquisarNaWeb("Luanda", {})).map((x) => x.titulo)).toEqual(["Luanda"]);
  });

  it("uma língua com a rede em baixo não estraga a outra", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("//en.")) throw redeFalhou();
        return paginas();
      }),
    );
    expect(await pesquisarNaWeb("sem resultados", {})).toEqual([]);
  });

  it("com tudo em baixo devolve uma lista vazia e regista o aviso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw redeFalhou();
      }),
    );
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await pesquisarNaWeb("Luanda", {})).toEqual([]);
    expect(aviso).toHaveBeenCalledOnce();
  });

  it("não repete um estado de erro do fornecedor", async () => {
    const pedido = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", pedido);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await pesquisarNaWeb("Luanda", {})).toEqual([]);
    expect(pedido).toHaveBeenCalledTimes(2); // uma por língua, nenhuma repetição
  });
});

describe("limparResumo", () => {
  it("tira as etiquetas HTML, normaliza os espaços e corta", () => {
    expect(limparResumo('Um <span class="searchmatch">kwanza</span>  forte &amp; estável')).toBe(
      "Um kwanza forte & estável",
    );
    expect(limparResumo("a".repeat(1000))).toHaveLength(360);
    expect(limparResumo(42)).toBe("");
  });
});

describe("resultadoValido", () => {
  it("só serve com título, resumo e um endereço https", () => {
    expect(resultadoValido("BNA", "https://www.bna.ao/", "Banco central.")).toEqual({
      titulo: "BNA",
      url: "https://www.bna.ao/",
      resumo: "Banco central.",
    });
    expect(resultadoValido("BNA", "http://www.bna.ao/", "x")).toBeNull();
    expect(resultadoValido("BNA", "javascript:alert(1)", "x")).toBeNull();
    expect(resultadoValido("BNA", "https://localhost/", "x")).toBeNull();
    expect(resultadoValido("", "https://www.bna.ao/", "x")).toBeNull();
    expect(resultadoValido("BNA", "https://www.bna.ao/", "<b></b>")).toBeNull();
  });
});

describe("fornecedorDePesquisa", () => {
  it("usa a Tavily, depois a Brave e, sem chaves, a Wikipédia", () => {
    expect(fornecedorDePesquisa({ TAVILY_API_KEY: "tvly-x", BRAVE_API_KEY: "b" })).toBe("tavily");
    expect(fornecedorDePesquisa({ BRAVE_API_KEY: "b" })).toBe("brave");
    expect(fornecedorDePesquisa({})).toBe("wikipedia");
    expect(fornecedorDePesquisa({ TAVILY_API_KEY: "  " })).toBe("wikipedia");
  });
});
