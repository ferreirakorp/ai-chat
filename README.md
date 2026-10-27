# ai-chat

A drop-in AI chat assistant for React and Next.js. One component on the page, one route on the server, and it brings the rest:
streaming answers, visible reasoning, web search with numbered sources, conversation history, ratings, JSON forms and an admin
panel. Free, MIT licensed, no UI kit required (no shadcn, Radix or lucide).

The brain runs on [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/), but the chat only talks to a small HTTP
protocol, so you can plug in your own backend.

> The interface strings are in Portuguese by default and every one of them can be replaced with the `textos` prop (translate it
> to any language). Full documentation in Portuguese: [LEIAME.md](./LEIAME.md).

## What you get

- Floating chat bubble that appears after the hero, with suggested questions and live status (AI / human / offline).
- Streamed answers with a live "thinking" trace, search steps and numbered source chips.
- Rich replies: bold, lists, safe links, one-click question chips, 3D buttons, clickable phone/email/map links.
- Conversation history stored on the visitor's device only (`localStorage`), with AI-generated titles.
- Per-answer ratings, and forms the AI can ask for (choice, multiple, yes/no, scale, text, number, email, phone).
- Opt-in saving of conversations for your team, with "stop and delete".
- Admin components: conversations with reasoning, ratings, team guidance for the AI, form answers with stats, CSV/JSON export.
- Mobile keyboard handling, reduced-motion support, no external fonts, no drop shadows.
- 268 tests, strict TypeScript.

## Install

Copy the folder (shadcn style) or install from GitHub and let your bundler compile the source.

```bash
npm i github:ferreirakorp/ai-chat
```

Next.js needs to transpile it:

```ts
// next.config.ts
export default { transpilePackages: ["ai-chat"] };
```

Peer dependencies: `react` and `react-dom` 18 or newer. `next` is optional.

## Use it

1. Add the server route, for example `src/app/api/assistente/[[...rota]]/route.ts`:

```ts
import { configuracaoDaIa, criarAssistente, limitadorEmMemoria, repositorioMemoria } from "ai-chat/servidor";
import { perfilPadrao } from "ai-chat/nucleo/conteudo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assistente = criarAssistente({
  ia: configuracaoDaIa(process.env), // CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN (Workers AI permission only)
  repositorio: repositorioMemoria(), // or repositorioPg(yourSqlExecutor), schema in sql/001_assistente.sql
  limite: limitadorEmMemoria(),
  contexto: async () => ({
    perfil: { ...perfilPadrao("Acme"), descricao: "a bike shop in Lisbon", paginas: ["/", "/shop", "/contact"] },
    estilo: "Friendly, short sentences.",
    conhecimento: "Opening hours: 9h to 18h. Repairs take two working days.",
    perguntasDaEquipa: ["What are your opening hours?"],
  }),
});
export const { GET, POST, DELETE } = assistente.rotas;
```

2. Put the component in your layout:

```tsx
import { AssistenteIA, exemploDeConteudo } from "ai-chat";
import "ai-chat/estilos/tema-padrao.css";

<AssistenteIA dados={exemploDeConteudo} />;
```

3. Environment variables (never commit them): `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`.

## Make it yours

- **Theme**: the CSS only reads `--aia-*` variables (`--aia-azul`, `--aia-amarelo`, `--aia-cinza`, `--aia-branco`, `--aia-tipo`, ...).
  Copy `src/estilos/tema-padrao.css` and map them to your colors and font.
- **Texts and language**: `textos` prop. **Content** (name, avatar, suggested questions, ready answers): `dados`, shaped like `exemploDeConteudo`.
- **Your own brain**: pass `transporte` (how a question is asked, returns an async stream of events), `cartao` (render project
  cards inside answers), `anexos` (file attachments) and `itensDoMenu`. The chat then draws everything the same way.
- **Props worth knowing**: `endpoint`, `paginas`, `avatar`, `Ligacao` (e.g. `next/link`), `seletorDaHero`, `atrasoMs`, `chaveDeSessao`,
  `modeloDaPesquisa`.

## HTTP protocol

`POST {endpoint}` streams NDJSON events (`{t}`, `{passo}`, `{fontes}`, `{cartoes}`, `{fim}`, `{erro}`), plus `/estado`, `/titulo`,
`/conversa`, `/avaliacao` and `/formulario`. Same-origin only, JSON only, size and rate limits on every route, `Cache-Control: no-store`.
Details in [LEIAME.md](./LEIAME.md).

## Privacy

Conversations are saved for your team only after the visitor says "Autorizo", can be deleted by them at any time, and IP addresses
are not stored. The history lives in the visitor's `localStorage`.

## Develop

```bash
npm install
npm test
npm run typecheck
```

## License

MIT. See [LICENSE](./LICENSE).
