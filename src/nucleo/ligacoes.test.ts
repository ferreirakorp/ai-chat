import { describe, expect, it } from "vitest";
import { tipoDaLigacao } from "./ligacoes";

describe("o tipo de uma ligação", () => {
  it("uma página do site, um telefone e um e-mail", () => {
    expect(tipoDaLigacao("/contactos", true)).toBe("pagina");
    expect(tipoDaLigacao("/sobre#equipa")).toBe("pagina");
    expect(tipoDaLigacao("tel:+351000000000")).toBe("telefone");
    expect(tipoDaLigacao("mailto:geral@exemplo.pt")).toBe("email");
  });

  it("um vídeo pelo domínio ou pela extensão", () => {
    expect(tipoDaLigacao("https://www.youtube.com/watch?v=abc")).toBe("video");
    expect(tipoDaLigacao("https://youtu.be/abc")).toBe("video");
    expect(tipoDaLigacao("https://vimeo.com/123")).toBe("video");
    expect(tipoDaLigacao("https://exemplo.pt/media/apresentacao.mp4")).toBe("video");
  });

  it("um mapa, o WhatsApp, um documento e uma imagem", () => {
    expect(tipoDaLigacao("https://www.google.com/maps/place/Luanda")).toBe("mapa");
    expect(tipoDaLigacao("https://maps.app.goo.gl/abc")).toBe("mapa");
    expect(tipoDaLigacao("https://wa.me/351000000000")).toBe("whatsapp");
    expect(tipoDaLigacao("https://api.whatsapp.com/send?phone=1")).toBe("whatsapp");
    expect(tipoDaLigacao("https://exemplo.pt/relatorio.PDF")).toBe("documento");
    expect(tipoDaLigacao("https://exemplo.pt/foto.jpg")).toBe("imagem");
  });

  it("o resto da web é o globo (e o google.com sem /maps também)", () => {
    expect(tipoDaLigacao("https://pt.wikipedia.org/wiki/Angola")).toBe("web");
    expect(tipoDaLigacao("https://www.google.com/search?q=angola")).toBe("web");
    expect(tipoDaLigacao("isto-nao-e-um-endereco")).toBe("web");
  });
});
