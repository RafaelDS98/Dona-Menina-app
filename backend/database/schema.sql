-- Dona Menina Beauty Bar — Schema DDL
-- Corrigido conforme validação arquitetural do plano

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Colaboradoras
CREATE TABLE IF NOT EXISTS colaboradoras (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL,
  funcao          TEXT,
  comissao_padrao REAL    NOT NULL DEFAULT 0,
  ativa           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Categorias de servico
CREATE TABLE IF NOT EXISTS servico_categorias (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT    NOT NULL UNIQUE
);

-- Catalogo de servicos
CREATE TABLE IF NOT EXISTS servicos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL,
  categoria_id    INTEGER REFERENCES servico_categorias(id),
  preco           REAL    NOT NULL,
  tempo_min       INTEGER,
  ativo           INTEGER NOT NULL DEFAULT 1,
  consome_kit_mao INTEGER NOT NULL DEFAULT 0,
  consome_kit_pe  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Clientes (com coluna ativa para soft delete)
CREATE TABLE IF NOT EXISTS clientes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL,
  telefone        TEXT,
  data_nascimento TEXT,
  observacoes     TEXT,
  ativa           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Agendamentos (com updated_at)
CREATE TABLE IF NOT EXISTS agendamentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
  colaboradora_id INTEGER REFERENCES colaboradoras(id),
  data_hora       TEXT    NOT NULL,
  servico_id      INTEGER REFERENCES servicos(id),
  status          TEXT    NOT NULL DEFAULT 'agendado',
  observacao      TEXT,
  atendimento_id  INTEGER REFERENCES atendimentos(id),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Atendimentos (com coluna cancelado para soft delete)
CREATE TABLE IF NOT EXISTS atendimentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
  data_hora       TEXT    NOT NULL,
  valor_total     REAL    NOT NULL DEFAULT 0,
  observacao      TEXT,
  cancelado                INTEGER NOT NULL DEFAULT 0,
  status                   TEXT    NOT NULL DEFAULT 'concluida',
  taxa_agendamento_valor   REAL,
  taxa_agendamento_forma   TEXT,
  taxa_lancada_manualmente INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Pagamentos do atendimento
CREATE TABLE IF NOT EXISTS atendimento_pagamentos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  forma          TEXT    NOT NULL,
  valor          REAL    NOT NULL
);

-- Itens do atendimento
CREATE TABLE IF NOT EXISTS atendimento_itens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  tipo           TEXT    NOT NULL DEFAULT 'servico',
  servico_id     INTEGER REFERENCES servicos(id),
  produto_id     INTEGER REFERENCES estoque_lojinha(id),
  freezer_id     INTEGER REFERENCES estoque_freezer(id),
  promocao_id    INTEGER REFERENCES promocoes(id),
  descricao      TEXT,
  preco_cobrado  REAL    NOT NULL,
  observacao     TEXT
);

-- Colaboradoras por item de atendimento
CREATE TABLE IF NOT EXISTS atendimento_item_colaboradoras (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_item_id INTEGER NOT NULL REFERENCES atendimento_itens(id) ON DELETE CASCADE,
  colaboradora_id     INTEGER NOT NULL REFERENCES colaboradoras(id),
  percentual_comissao REAL    NOT NULL,
  valor_comissao      REAL    NOT NULL
);

-- Estoque: kits descartaveis
CREATE TABLE IF NOT EXISTS estoque_kits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo           TEXT    NOT NULL UNIQUE,
  quantidade     INTEGER NOT NULL DEFAULT 0,
  alerta_atencao INTEGER NOT NULL DEFAULT 15,
  alerta_urgente INTEGER NOT NULL DEFAULT 10,
  alerta_critico INTEGER NOT NULL DEFAULT 5,
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Estoque: produtos da lojinha
CREATE TABLE IF NOT EXISTS estoque_lojinha (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  marca         TEXT,
  preco_custo   REAL,
  preco_venda   REAL    NOT NULL,
  quantidade    INTEGER NOT NULL DEFAULT 0,
  alerta_minimo INTEGER NOT NULL DEFAULT 3,
  ativo         INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Saidas financeiras
CREATE TABLE IF NOT EXISTS saidas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data        TEXT    NOT NULL,
  descricao   TEXT    NOT NULL,
  marca       TEXT,
  valor_unit  REAL    NOT NULL,
  quantidade  INTEGER NOT NULL DEFAULT 1,
  valor_total REAL    NOT NULL,
  fornecedor  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Promocoes e combos
CREATE TABLE IF NOT EXISTS promocoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  descricao   TEXT,
  preco       REAL    NOT NULL,
  data_inicio TEXT    NOT NULL,
  data_fim    TEXT    NOT NULL,
  ativa       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Servicos incluidos em cada promocao
CREATE TABLE IF NOT EXISTS promocao_servicos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  promocao_id INTEGER NOT NULL REFERENCES promocoes(id) ON DELETE CASCADE,
  servico_id  INTEGER NOT NULL REFERENCES servicos(id)
);

-- Log de backups
CREATE TABLE IF NOT EXISTS backup_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo    TEXT    NOT NULL,
  tamanho_kb INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Configuracoes gerais (chave-valor)
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Estoque: itens do freezer
CREATE TABLE IF NOT EXISTS estoque_freezer (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  marca         TEXT,
  preco_custo   REAL,
  preco_venda   REAL    NOT NULL,
  quantidade    INTEGER NOT NULL DEFAULT 0,
  alerta_minimo INTEGER NOT NULL DEFAULT 3,
  ativo         INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_hora ON agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_colaboradora ON agendamentos(colaboradora_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_data_hora ON atendimentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente ON atendimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimento_item_colab ON atendimento_item_colaboradoras(colaboradora_id);
