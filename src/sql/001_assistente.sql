-- Assistente IA: o esquema completo (idempotente: pode correr-se mais do que uma vez). Postgres 13 ou mais recente (usa gen_random_uuid()).
--
--   chat_conversa    as conversas que o visitante AUTORIZOU guardar (nunca se guarda o endereço IP)
--   chat_mensagem    as mensagens dessas conversas, com as fontes e o raciocínio da resposta
--   chat_avaliacao   a avaliação de uma resposta (boa e quão boa / má e porquê); funciona sem conversa guardada
--   chat_orientacao  instruções da equipa para a IA seguir em perguntas de um certo tipo
--   chat_formulario  um formulário (perguntas em JSON) que a IA fez e o visitante preencheu
--   chat_resposta    uma linha por pergunta respondida (é o que o painel analisa e exporta)

CREATE TABLE IF NOT EXISTS chat_conversa (
  id uuid PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultima_em timestamptz NOT NULL DEFAULT now(),
  -- o momento em que o visitante disse «autorizo»
  consentimento_em timestamptz NOT NULL DEFAULT now(),
  pagina text NOT NULL DEFAULT '/',
  mensagens integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chat_conversa_ultima_idx ON chat_conversa (ultima_em DESC);

CREATE TABLE IF NOT EXISTS chat_mensagem (
  id bigserial PRIMARY KEY,
  conversa_id uuid NOT NULL REFERENCES chat_conversa (id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('user', 'assistant')),
  texto text NOT NULL,
  -- as fontes da pesquisa na web, quando a resposta teve (lista de {titulo, url})
  fontes jsonb,
  -- o raciocínio da resposta: {passos:[{chave,titulo,descricao,estado,fontes?}], segundos}
  raciocinio jsonb,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE chat_mensagem ADD COLUMN IF NOT EXISTS raciocinio jsonb;
CREATE INDEX IF NOT EXISTS chat_mensagem_conversa_idx ON chat_mensagem (conversa_id, enviado_em, id);

-- Sem chave estrangeira para a conversa: o visitante pode avaliar sem autorizar guardar a conversa. Quem apaga a conversa (apagarConversa)
-- apaga também as avaliações e os formulários com o mesmo conversa_id.
CREATE TABLE IF NOT EXISTS chat_avaliacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL,
  mensagem_ref integer NOT NULL,
  sentido text NOT NULL CHECK (sentido IN ('boa', 'ma')),
  nota smallint NOT NULL CHECK (nota BETWEEN 1 AND 5),
  motivos text[] NOT NULL DEFAULT '{}',
  comentario text NOT NULL DEFAULT '',
  pergunta text NOT NULL,
  resposta text NOT NULL,
  raciocinio jsonb,
  fontes jsonb,
  pagina text NOT NULL DEFAULT '/',
  estado text NOT NULL DEFAULT 'nova' CHECK (estado IN ('nova', 'revista')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, mensagem_ref)
);
CREATE INDEX IF NOT EXISTS chat_avaliacao_criado_idx ON chat_avaliacao (criado_em DESC);
CREATE INDEX IF NOT EXISTS chat_avaliacao_estado_idx ON chat_avaliacao (estado, sentido);

CREATE TABLE IF NOT EXISTS chat_orientacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  palavras text[] NOT NULL,
  instrucao text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  -- a avaliação a partir da qual a equipa a escreveu (se foi o caso)
  avaliacao_id uuid REFERENCES chat_avaliacao (id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_orientacao_ativa_idx ON chat_orientacao (ativa);

CREATE TABLE IF NOT EXISTS chat_formulario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL,
  mensagem_ref integer NOT NULL,
  -- o identificador que a IA deu ao formulário e o título
  formulario_ref text NOT NULL,
  titulo text NOT NULL DEFAULT '',
  -- o esquema tal como foi mostrado: {id, titulo, campos:[…]}
  esquema jsonb NOT NULL,
  pagina text NOT NULL DEFAULT '/',
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, mensagem_ref)
);
CREATE INDEX IF NOT EXISTS chat_formulario_criado_idx ON chat_formulario (criado_em DESC);

CREATE TABLE IF NOT EXISTS chat_resposta (
  id bigserial PRIMARY KEY,
  formulario_id uuid NOT NULL REFERENCES chat_formulario (id) ON DELETE CASCADE,
  campo text NOT NULL,
  rotulo text NOT NULL,
  tipo text NOT NULL,
  -- a resposta tal como se lê
  texto text NOT NULL,
  -- para numero, escala e sim-nao (1 = sim, 0 = não)
  numero double precision,
  -- as opções escolhidas (escolha, multipla, sim-nao)
  opcoes text[] NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_resposta_formulario_idx ON chat_resposta (formulario_id);
CREATE INDEX IF NOT EXISTS chat_resposta_rotulo_idx ON chat_resposta (rotulo);
