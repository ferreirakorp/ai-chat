# Assistente IA — um componente, uma chamada

Um assistente de conversa para qualquer site React/Next, com a IA da Cloudflare, e tudo o que isso pede à volta. Vive em `src/assistente-ia/`; copia-se a pasta para um projecto novo.

**O que traz**

- **Chat** em baixo à direita: só aparece depois de a pessoa passar a hero; chama a atenção com uma bolinha amarela e um balão (que não são
  mensagens); perguntas sugeridas numa faixa que desliza; clicar fora do chat fecha-o (no PC). Sem faixa azul no topo: só a fotografia do
  assistente (com a bolinha de estado em cima dela), o nome, o estado ao vivo, o menu e o X, sobre um esbatido branco por onde a conversa passa.
- **Estado ao vivo** («A falar com o modelo de IA», «A falar com um humano», «Ninguém online de momento»): a bolinha na fotografia é verde com
  alguém online e amarela («ausente») sem ninguém; o texto diz com quem se fala. O servidor responde ao `POST {endpoint}/estado` com o modo; o
  projecto decide com `estado: () => "ia" | "humano" | "offline"` (por omissão: `ia` com IA configurada, `offline` sem ela). Se a IA falhar, o chat
  diz logo «offline» até ela voltar.
- **Datas**: um botão «i» redondo à frente do estado liga (e desliga) a data e a hora de TODAS as mensagens («23 de out. · 17:58» e, de outro ano,
  «23/10/2025 · 17:58»); sem ele, puxar a conversa para a esquerda mostra a da pessoa e para a direita a fotografia e a da IA (dedo ou rato).
- **Menu (hambúrguer)**: Nova conversa, Histórico de conversas e Apagar todo o histórico (com confirmação). **Histórico**: as conversas ficam
  neste aparelho (`localStorage`; nada vai para o servidor), cada uma com um título que a IA dá depois da primeira resposta (`POST {endpoint}/titulo`,
  modelo leve) ou, sem IA, feito das palavras de que a pessoa falou; a pessoa muda-o com o lápis (e esse nunca é trocado). Abrir uma conversa
  continua-a; cada uma pode ser apagada.
- **Raciocínio**: «A pensar…» ao vivo com o ícone do que faz (cérebro, globo ao pesquisar, lápis ao escrever) e um chevron para esconder as
  frases; depois «Pensou durante N s» com a **cadeia de pensamento** num dropdown (passos reais, a pesquisa feita e as fontes com todos os
  detalhes). As fontes aparecem no texto como **bolas numeradas** (e o texto tirado da pesquisa, a tracejado); clicar numa abre o raciocínio nela.
- **Respostas**: uma frase por parágrafo, negrito, listas (**numeradas** para assuntos diferentes, com pontos para pormenores de um só), ligações
  seguras e **botões 3D** (`[[botao: Rótulo | destino]]`, que nunca ficam à vista como código). O botão «Falar com a equipa» NÃO vem por defeito:
  só se a pessoa pede ou a IA não sabe responder (instruções + um botão que já apareceu não volta, salvo se a pessoa pedir contacto).
- **Uma pergunta nunca fica sem resposta**: um verificador (ao carregar e de 4 em 4 s) vê se a última mensagem é da pessoa e não há resposta a
  caminho; se for assim, gera-a (IA e, se falhar ou não houver IA, as perguntas prontas da equipa em JSON). Com o chat fechado a resposta
  continua e aparece em resumo no balão, com a bolinha a avisar.
- **Avaliação** de cada resposta: boa (e quão boa) ou má (e porquê); a pergunta vive dentro da caixa de texto e escrever já dá direito a enviar.
  Depois de enviar há 5 s para mudar de ideia (um lápis com os segundos).
- **Formulários em JSON**: a IA pede informação com campos a sério (escolha, múltipla, sim/não, escala, texto, número, e-mail, telefone); as
  respostas ficam estruturadas (uma linha por pergunta respondida).
- **Conversas** só guardadas na equipa com autorização expressa («Autorizo» / o X vermelho), com o lixo para «Parar e apagar».
- **Painel**: conversas com o raciocínio, avaliações com medidas, **orientações** que a equipa escreve para a IA, respostas dos formulários com
  estatísticas e exportação CSV/JSON.
- **Teclado (telemóvel)**: igual ao Modo IA do Google. O meta viewport leva `interactive-widget=resizes-content` (o teclado encolhe a área da página; o módulo põe-no sozinho se o projecto não o disser, mas o certo é dizê-lo de origem: no Next, `viewport.interactiveWidget`) e o painel está colado ao topo e ao fundo dela: a escrita fica encostada ao teclado, sem espaço por baixo, e a conversa NÃO se mexe (fica por baixo da escrita, a esbater-se). No iPhone (que não encolhe a área) o painel segue o `visualViewport`. Ao escrever uma avaliação, as perguntas prontas e a escrita das mensagens escondem-se. `?aia-debug=1` na morada escreve no painel o que o navegador diz.
- **Hero**: o botão e o balão só se vêem fora da hero: saem a animar ao voltar a ela e regressam ao sair (o chat aberto não se fecha).
- **Balão do chat fechado**: com o assistente a trabalhar o botão azul só mostra o loading dos quadrados (e o lápis a escrever a resposta final; nada pisca) e depois, no balão, «I.A. Resposta:» (ou o nome de quem da equipa responde, via `/estado` → `{ modo: "humano", nome }`) com o princípio da resposta final em duas linhas (o fim esbate-se); sai 2,5 s depois e a bolinha vermelha (parada) fica a avisar.

## Usar num projecto novo

1. **Copiar** a pasta `assistente-ia/` para `src/`. Só precisa de `react` (o `next` é opcional). Nada fora da pasta é importado por ela.
2. **Base de dados**: correr `sql/001_assistente.sql` (Postgres 13+; idempotente). Sem base de dados, `repositorioMemoria()` serve para experimentar.
3. **Uma rota** (Next) — `src/app/api/assistente/[[...rota]]/route.ts`:

   ```ts
   import { configuracaoDaIa, criarAssistente, limitadorEmMemoria, repositorioPg } from "@/assistente-ia/servidor";
   import { perfilPadrao } from "@/assistente-ia/nucleo/conteudo";

   export const runtime = "nodejs";
   export const dynamic = "force-dynamic";

   const assistente = criarAssistente({
     ia: configuracaoDaIa(process.env), // CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN (só com a permissão «Workers AI»)
     repositorio: repositorioPg(meuExecutorSql), // ou repositorioMemoria()
     limite: limitadorEmMemoria(), // ou uma função do projecto (Postgres, Redis…): (chave, regra) => ({ permitido, repetirEmSegundos })
     contexto: async () => ({
       perfil: {
         ...perfilPadrao("Acme, Lda"),
         descricao: "uma loja de bicicletas em Lisboa",
         paginas: ["/", "/loja", "/contactos"],
       },
       estilo: "…a personalidade do assistente…",
       conhecimento: "…os factos da empresa, em texto…",
       perguntasDaEquipa: ["Qual é o horário?"],
     }),
     // opcional: com quem se fala agora ("ia" | "humano" | "offline")
     // estado: () => (equipaOnline() ? "humano" : "ia"),
   });
   export const { GET, POST, DELETE } = assistente.rotas;
   ```

4. **Uma chamada** no layout:

   ```tsx
   import { AssistenteIA, exemploDeConteudo } from "@/assistente-ia";
   <AssistenteIA dados={conteudo} />; // `conteudo` tem o formato de `exemploDeConteudo`
   ```

   Props opcionais: `textos` (traduz/muda o estado, o menu, o histórico, o raciocínio, a avaliação e os formulários), `endpoint`, `paginas`, `avatar`
   (um elemento), `Ligacao` (por exemplo `next/link`), `seletorDaHero`, `atrasoMs`, `chaveDeSessao` (também dá nome ao histórico:
   `{chave}-historico`). Um **componente de servidor não pode passar funções** a um de cliente: quem precisa de `Ligacao` ou de um avatar
   próprio embrulha `<AssistenteIA>` num componente de cliente.

5. **Cores**: o CSS é autónomo e lê `--aia-azul`, `--aia-amarelo`, `--aia-cinza` e `--aia-tipo` (têm valores por omissão). Sem sombras projectadas:
   só o relevo 3D dos botões e as bordas; ao pairar os botões ficam azuis em 3D (o X e o apagar, vermelhos em 3D).
6. **Painel** (opcional): `@/assistente-ia/admin` traz `RaciocinioLido`, `PassosDoRaciocinio`, `AvaliacaoLida`, `RespostasLidas`,
   `MedidasDasAvaliacoes` e `EstatisticasDasPerguntas`; os dados vêm de `assistente.repositorio` (`listarConversas`, `lerConversa`,
   `listarAvaliacoes`, `lerAvaliacao`, `resumoDasAvaliacoes`, `marcarAvaliacao`, `listarOrientacoes`, `guardarOrientacao`,
   `alternarOrientacao`, `apagarOrientacao`, `listarFormularios`, `lerFormulario`, `respostasParaAnalise`). Depois de mudar orientações
   chame `assistente.esquecerOrientacoes()`. A autenticação, as permissões e a auditoria são do projecto. Exportação:
   `respostasParaCsv(await repositorio.respostasParaAnalise())` (`nucleo/formulario.ts`).

## Pontos de extensão — o cérebro, os cartões e o tema são do projecto

O chat não precisa do servidor do módulo: um projecto com o seu próprio cérebro (ferramentas, reservas, controlo da página…) liga-se por props e
o chat desenha o resto igual. Tudo é opcional:

| Prop               | O que é                                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transporte`       | COMO se pergunta à IA (`cliente/transporte.ts`): `perguntar(pedido)` devolve os eventos (um gerador assíncrono), `carregar()` a conversa que o servidor já tem, `nova()` avisa do «Nova conversa». O `pedido` traz `historico`, `caminho`, `conversa` (o id da conversa no chat), `sinal` e `anexo`. |
| `cartao`           | `(cartao, mensagem) => ReactNode`: desenha um cartão do projecto (reserva, fotografias, objecto…) que a resposta trouxe (`{cartoes:[…]}`). Por baixo do texto, ou no sítio de uma linha `[[cartao]]` (o primeiro é o primeiro cartão).                                                               |
| `anexos`           | Anexar ficheiros (clipe, largar, colar): `enviar(ficheiro, aoProgresso)`, `renderizar(anexo)` e os `rotulos`. O módulo trata do botão e da barra de envio; o projecto diz como enviar e como desenhar.                                                                                               |
| `itensDoMenu`      | Itens do projecto no menu do cabeçalho (uma ligação ou uma acção): por exemplo «Ligar à receção».                                                                                                                                                                                                    |
| `Carregar`         | O loading do projecto no lugar dos nove quadrados (o botão, a fila, as avaliações, os formulários).                                                                                                                                                                                                  |
| `modeloDaPesquisa` | Para onde leva o termo pesquisado na web, com `{q}`: sem isto o termo não é uma ligação.                                                                                                                                                                                                             |
| `semAutorizacao`   | O projecto já guarda as conversas por conta própria: o chat não pergunta «Posso guardar esta conversa?».                                                                                                                                                                                             |
| `seletorDaHero`    | O elemento da hero (o chat só aparece fora dela); `false` desliga a regra (sempre à vista).                                                                                                                                                                                                          |
| `paginas`          | As páginas para onde uma resposta pode ligar; «/ofertas/*» abre todo o ramo.                                                                                                                                                                                                                         |

**Os eventos do transporte** (`EventoDoTransporte`): `{t}` (um pedaço do texto; pode vir de uma vez ou aos poucos), `{passo:{titulo, descricao?, icone?,
consulta?, fontes?}}` (um passo de uma ferramenta do projecto; um passo com o título de um que está a decorrer **actualiza-o** — por exemplo
quando a pesquisa traz as fontes), `{fontes}` (as fontes da resposta, pela ordem dos números `[1]`, `[2]` do texto), `{cartoes}`, `{fim}` e
`{erro:"limite"|"indisponivel"}` (o chat passa às respostas prontas). A conversa que volta (`carregar`) leva `cartoes`, `fontes` e `raciocinio`.

**As marcas do texto** que a IA pode escrever (o chat desenha-as; nunca ficam à vista como código): `**negrito**`, o código entre crases,
`[texto](/pagina)`, `[1]` (citação), `[[pergunta: …]]` (opção de um clique; duas no fim), `[[botao: Rótulo | /destino]]`, `[[cartao]]`
(um cartão do projecto no meio do texto) e `[[formulario]]…[[/formulario]]`. Uma linha só de `[[marca]]` que o chat não conhece não aparece.

**O tema** é do projecto: o CSS do módulo só lê variáveis `--aia-*` (`azul`, `amarelo`, `cinza`, `branco`, `vermelho`, `vermelho-forte`, `verde`,
`azul-bebe`, `azul-bebe-forte`, `silhueta-1…3`, `tipo`) — nenhum #hex nem fonte escrita. `estilos/tema-padrao.css` é um exemplo: cada
projecto escreve o seu a mapear as variáveis para os tokens dele. **Os textos** da interface (`nucleo/conteudo.ts`, `textosPadrao`) mudam-se e
traduzem-se com a prop `textos`; cada texto tem um caminho (`pensar.passos.escreverFeita`) que um projecto com os textos na base usa como chave.

## Estrutura e regras da pasta

```
assistente-ia/
  index.ts            o que o navegador importa: AssistenteIA e tipos
  AssistenteIA.tsx    O componente («use client»)
  cliente/            peças do chat: Pensar, PassosDoRaciocinio, Avaliar, FormularioDoChat, Resposta, MenuDoChat, HistoricoDoChat, Carregar, icones, useDepoisDaHero
  nucleo/             PURO (sem react, sem node, sem BD): tipos, validações, regras, raciocínio, formulários, avaliações, orientações, histórico, datas, resumo
  servidor/           criarAssistente, fluxo da IA, pesquisa na web, limite de taxa, repositórios (Postgres e memória)
  admin/              componentes de leitura do painel e medidas
  estilos/            CSS autónomo
  sql/                esquema da base de dados
```

- `nucleo/` não importa de `cliente/`, `servidor/` nem `admin/`; `servidor/` e `cliente/` só importam de `nucleo/`.
- Sem `import "server-only"` (o módulo não assume o Next): o projecto envolve-o num ficheiro seu com `server-only`.
- O que é **dado** (textos, perguntas, perfil da empresa, páginas) passa por props e pelo `contexto`; nada de um negócio no código do módulo.
- Os textos novos da interface estão em português em `nucleo/conteudo.ts` (`textosPadrao`) e mudam-se com a prop `textos`.
- Não depende de shadcn, Radix nem lucide: os ícones são SVG e CSS próprios (o cérebro segue o desenho do «brain» do Lucide, licença ISC).

## Protocolo HTTP (relativo ao `endpoint`, por omissão `/api/assistente`)

| Pedido                        | O que faz                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST {endpoint}`             | pergunta à IA: `{ mensagens:[{papel,texto}], caminho }` → resposta NDJSON (eventos de `nucleo/fluxo.ts`)              |
| `POST {endpoint}/estado`      | com quem se fala agora: `{ ok:true, modo:"ia"\|"humano"\|"offline" }`                                                 |
| `POST {endpoint}/titulo`      | um título curto para a conversa (histórico): `{ mensagens:[{papel,texto}] }` → `{ ok:true, titulo }`                  |
| `POST {endpoint}/conversa`    | guarda mensagens novas (só depois do «Autorizo»): `{ id, pagina, mensagens:[{papel,texto,fontes?,raciocinio?,em?}] }` |
| `DELETE {endpoint}/conversa`  | «Parar e apagar»: `{ id }` apaga conversa, mensagens, avaliações e formulários dessa conversa                         |
| `POST {endpoint}/avaliacao`   | `AvaliacaoEnviada` (`nucleo/avaliacoes.ts`); substitui a anterior da mesma mensagem                                   |
| `DELETE {endpoint}/avaliacao` | retira: `{ conversa, mensagem }` (o chat já não a usa; fica para outros clientes)                                     |
| `POST {endpoint}/formulario`  | `{ conversa, mensagem, esquema, respostas, pagina }` (`nucleo/formulario.ts`); substitui o anterior da mesma mensagem |

Todos: mesmo site (`Origin`), `Content-Type: application/json`, limite de tamanho, limite de taxa por endereço, `Cache-Control: no-store`.
Respostas: `{ ok: true }` ou `{ ok:false, erro }` com 400 (inválido), 403 (origem), 404, 405, 409 (cheia), 413, 415, 429 (limite), 503 (sem IA/BD).

### Eventos do fluxo da IA (NDJSON, uma linha JSON por evento)

`{semPesquisa:"equipa"|"nao"|"limite"|"falhou"}` ou `{pesquisa:"consulta"}` + `{fontes:[{titulo,url,resumo}]}` (sempre, pode vir vazia) →
`{orientacoes:n}` (só se n > 0) → `{t:"texto"}`… → `{fim:true}` ou `{erro:"…"}`. Cada evento é um passo da cadeia de pensamento.

### Formulários (a IA escreve; o chat desenha)

No fim da resposta: `[[formulario]]` + JSON numa linha + `[[/formulario]]`. Esquema: `{ id, titulo, campos: [{ id, tipo, rotulo, opcoes?, min?, max?, obrigatorio?, ajuda? }] }`
com os tipos `escolha`, `multipla`, `sim-nao`, `escala`, `texto`, `numero`, `email`, `telefone` (até 6 campos). O que a IA escreve nunca é
confiado: `lerEsquema` limpa-o e `validarRespostas` valida as respostas do visitante (no navegador e no servidor). Um formulário inválido
desaparece (nunca fica o código à vista). As instruções fixas da IA ensinam este formato (`instrucoesDaIa` em `nucleo/chat.ts`).

## Esquema SQL (`sql/001_assistente.sql`)

`chat_conversa`, `chat_mensagem` (com `raciocinio jsonb`), `chat_avaliacao` (única por `conversa_id`+`mensagem_ref`, sem chave estrangeira para a
conversa: avaliar não obriga a guardar a conversa; apaga-se em `apagarConversa`), `chat_orientacao` (`avaliacao_id` opcional, `ON DELETE SET NULL`),
`chat_formulario` (único por `conversa_id`+`mensagem_ref`) e `chat_resposta` (uma linha por pergunta respondida: `rotulo`, `tipo`, `texto`,
`numero`, `opcoes[]`). Não se guarda o endereço IP. O histórico de conversas do visitante NÃO está na base de dados (é do aparelho).

## Privacidade

- A conversa só é guardada na equipa depois do «Autorizo» e o visitante pode «Parar e apagar» (apaga também as avaliações e os formulários dela);
  «Apagar todo o histórico» apaga as conversas deste aparelho e as cópias que a pessoa tinha autorizado.
- O histórico (títulos incluídos) fica só no `localStorage` do aparelho; o título dado pela IA usa as primeiras mensagens (curtas) da conversa.
- Enviar uma avaliação ou um formulário é um acto expresso (o aviso está na dica do botão de enviar).
- As orientações da equipa nunca ganham às regras fixas da IA.

## Testes

`npx vitest run src/assistente-ia` — o núcleo, o servidor (rotas, fluxo, repositório em memória) e a renderização das peças do chat e do painel.
