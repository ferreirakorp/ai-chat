// Que tipo de coisa é o destino de uma ligação do texto de uma resposta: o chat põe-lhe no fim o ícone certo (telefone, e-mail, globo,
// vídeo, mapa…). Uma página do site é outra coisa (um clicável com preenchimento, sem ícone). Módulo PURO.

export type TipoDeLigacao =
  "pagina" | "telefone" | "email" | "whatsapp" | "video" | "mapa" | "documento" | "imagem" | "web";

const EXTENSAO_DE_VIDEO = /\.(mp4|webm|mov|m4v|avi|mkv)$/i;
const EXTENSAO_DE_DOCUMENTO = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|odt)$/i;
const EXTENSAO_DE_IMAGEM = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const DOMINIOS_DE_VIDEO = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "dailymotion.com",
  "tiktok.com",
  "twitch.tv",
  "loom.com",
];
const DOMINIOS_DE_WHATSAPP = ["wa.me", "whatsapp.com"];
const DOMINIOS_DE_MAPA = ["maps.app.goo.gl", "openstreetmap.org", "waze.com", "maps.apple.com"];

const doDominio = (host: string, dominios: readonly string[]): boolean =>
  dominios.some((d) => host === d || host.endsWith(`.${d}`));

/** O tipo do destino: `tel:` é telefone, `mailto:` é e-mail, e um endereço https lê-se pelo domínio (vídeo, mapa, WhatsApp) ou pela extensão (PDF, imagem…). */
export function tipoDaLigacao(href: string, interna: boolean = false): TipoDeLigacao {
  if (interna || href.startsWith("/")) return "pagina";
  if (/^tel:/i.test(href)) return "telefone";
  if (/^mailto:/i.test(href)) return "email";
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "web";
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const caminho = url.pathname.toLowerCase();
  if (doDominio(host, DOMINIOS_DE_WHATSAPP)) return "whatsapp";
  if (doDominio(host, DOMINIOS_DE_VIDEO) || EXTENSAO_DE_VIDEO.test(caminho)) return "video";
  if (doDominio(host, DOMINIOS_DE_MAPA) || (/(^|\.)google\.[a-z.]+$/.test(host) && caminho.startsWith("/maps")))
    return "mapa";
  if (EXTENSAO_DE_DOCUMENTO.test(caminho)) return "documento";
  if (EXTENSAO_DE_IMAGEM.test(caminho)) return "imagem";
  return "web";
}
