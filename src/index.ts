// O que o navegador (e o layout do projecto) importa do assistente: `<AssistenteIA dados={…} />`.
export { AssistenteIA, type PropsDoAssistenteIA } from "./AssistenteIA";
export { PassosDoRaciocinio } from "./cliente/PassosDoRaciocinio";
export type { AnexosDoAssistente, ItemDoMenuExtra } from "./cliente/extensoes";
export {
  transporteNdjson,
  type EventoDoTransporte,
  type MensagemRemota,
  type PedidoDeResposta,
  type TransporteDoAssistente,
} from "./cliente/transporte";
export { ATRASO_PADRAO_MS, useDepoisDaHero } from "./cliente/useDepoisDaHero";
export {
  perfilPadrao,
  textosPadrao,
  type ConteudoDoAssistente,
  type PerfilDaEmpresa,
  type TextosParciais,
} from "./nucleo/conteudo";
export { exemploDeConteudo } from "./nucleo/exemplo";
