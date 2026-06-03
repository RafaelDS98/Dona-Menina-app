import pg from 'pg';
const { Pool, types } = pg;

// Retornar timestamps como strings (compatibilidade com frontend)
types.setTypeParser(1114, str => str); // TIMESTAMP
types.setTypeParser(1184, str => str); // TIMESTAMPTZ
types.setTypeParser(1082, str => str); // DATE

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initSchema() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'colaboradoras'
      )
    `);

    if (!res.rows[0].exists) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS colaboradoras (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          funcao TEXT,
          comissao_padrao REAL NOT NULL DEFAULT 0,
          ativa INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS servico_categorias (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS servicos (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          categoria_id INTEGER REFERENCES servico_categorias(id),
          preco REAL NOT NULL,
          tempo_min INTEGER,
          ativo INTEGER NOT NULL DEFAULT 1,
          consome_kit_mao INTEGER NOT NULL DEFAULT 0,
          consome_kit_pe INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS clientes (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          telefone TEXT,
          data_nascimento TEXT,
          observacoes TEXT,
          ativa INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS atendimentos (
          id SERIAL PRIMARY KEY,
          cliente_id INTEGER NOT NULL REFERENCES clientes(id),
          data_hora TEXT NOT NULL,
          valor_total REAL NOT NULL DEFAULT 0,
          observacao TEXT,
          cancelado INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'concluida',
          taxa_agendamento_valor REAL,
          taxa_agendamento_forma TEXT,
          taxa_lancada_manualmente INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS agendamentos (
          id SERIAL PRIMARY KEY,
          cliente_id INTEGER NOT NULL REFERENCES clientes(id),
          colaboradora_id INTEGER REFERENCES colaboradoras(id),
          data_hora TEXT NOT NULL,
          servico_id INTEGER REFERENCES servicos(id),
          status TEXT NOT NULL DEFAULT 'agendado',
          observacao TEXT,
          atendimento_id INTEGER REFERENCES atendimentos(id),
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS atendimento_pagamentos (
          id SERIAL PRIMARY KEY,
          atendimento_id INTEGER NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
          forma TEXT NOT NULL,
          valor REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS estoque_lojinha (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          marca TEXT,
          preco_custo REAL,
          preco_venda REAL NOT NULL,
          quantidade INTEGER NOT NULL DEFAULT 0,
          alerta_minimo INTEGER NOT NULL DEFAULT 3,
          ativo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS estoque_freezer (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          marca TEXT,
          preco_custo REAL,
          preco_venda REAL NOT NULL,
          quantidade INTEGER NOT NULL DEFAULT 0,
          alerta_minimo INTEGER NOT NULL DEFAULT 3,
          ativo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS atendimento_itens (
          id SERIAL PRIMARY KEY,
          atendimento_id INTEGER NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
          tipo TEXT NOT NULL DEFAULT 'servico',
          servico_id INTEGER REFERENCES servicos(id),
          produto_id INTEGER REFERENCES estoque_lojinha(id),
          freezer_id INTEGER REFERENCES estoque_freezer(id),
          promocao_id INTEGER,
          descricao TEXT,
          preco_cobrado REAL NOT NULL,
          observacao TEXT
        );

        CREATE TABLE IF NOT EXISTS atendimento_item_colaboradoras (
          id SERIAL PRIMARY KEY,
          atendimento_item_id INTEGER NOT NULL REFERENCES atendimento_itens(id) ON DELETE CASCADE,
          colaboradora_id INTEGER NOT NULL REFERENCES colaboradoras(id),
          percentual_comissao REAL NOT NULL,
          valor_comissao REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS estoque_kits (
          id SERIAL PRIMARY KEY,
          tipo TEXT NOT NULL UNIQUE,
          quantidade INTEGER NOT NULL DEFAULT 0,
          alerta_atencao INTEGER NOT NULL DEFAULT 15,
          alerta_urgente INTEGER NOT NULL DEFAULT 10,
          alerta_critico INTEGER NOT NULL DEFAULT 5,
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS saidas (
          id SERIAL PRIMARY KEY,
          data TEXT NOT NULL,
          descricao TEXT NOT NULL,
          marca TEXT,
          valor_unit REAL NOT NULL,
          quantidade INTEGER NOT NULL DEFAULT 1,
          valor_total REAL NOT NULL,
          fornecedor TEXT,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS promocoes (
          id SERIAL PRIMARY KEY,
          nome TEXT NOT NULL,
          descricao TEXT,
          preco REAL NOT NULL,
          data_inicio TEXT NOT NULL,
          data_fim TEXT NOT NULL,
          ativa INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS promocao_servicos (
          id SERIAL PRIMARY KEY,
          promocao_id INTEGER NOT NULL REFERENCES promocoes(id) ON DELETE CASCADE,
          servico_id INTEGER NOT NULL REFERENCES servicos(id)
        );

        CREATE TABLE IF NOT EXISTS backup_log (
          id SERIAL PRIMARY KEY,
          arquivo TEXT NOT NULL,
          tamanho_kb INTEGER,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS configuracoes (
          chave TEXT PRIMARY KEY,
          valor TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_agendamentos_data_hora ON agendamentos(data_hora);
        CREATE INDEX IF NOT EXISTS idx_atendimentos_data_hora ON atendimentos(data_hora);
        CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente ON atendimentos(cliente_id);
      `);

      // Seed
      await client.query(`
        INSERT INTO colaboradoras (nome, funcao, comissao_padrao, ativa) VALUES
          ('Elis', 'Nail designer', 50.0, 1),
          ('Tarcia', 'Lash designer / Esteticista', 40.0, 1),
          ('Paula', 'Cabeleireira / Trancista', 45.0, 1);

        INSERT INTO servico_categorias (nome) VALUES
          ('Unhas'), ('Cilios'), ('Cabelo'), ('Estetica'), ('Sobrancelha');

        INSERT INTO servicos (nome, categoria_id, preco, tempo_min, ativo, consome_kit_mao, consome_kit_pe) VALUES
          ('Manicure simples',     1, 35.00, 45, 1, 1, 0),
          ('Manicure em gel',      1, 60.00, 60, 1, 1, 0),
          ('Pedicure simples',     1, 40.00, 50, 1, 0, 1),
          ('Pedicure spa',         1, 55.00, 60, 1, 0, 1),
          ('Mao e pe combo',       1, 70.00, 90, 1, 1, 1),
          ('Lash lifting',         2, 80.00, 60, 1, 0, 0),
          ('Extensao de cilios',   2, 120.00, 90, 1, 0, 0),
          ('Manutencao cilios',    2, 70.00, 45, 1, 0, 0),
          ('Escova modelada',      3, 50.00, 40, 1, 0, 0),
          ('Hidratacao capilar',   3, 70.00, 50, 1, 0, 0),
          ('Trancas box braids',   3, 150.00, 180, 1, 0, 0),
          ('Trancas twist',        3, 120.00, 150, 1, 0, 0),
          ('Limpeza de pele',      4, 90.00, 60, 1, 0, 0),
          ('Design de sobrancelha', 5, 30.00, 20, 1, 0, 0),
          ('Henna sobrancelha',    5, 45.00, 30, 1, 0, 0);

        INSERT INTO clientes (nome, telefone, data_nascimento, observacoes, ativa) VALUES
          ('Ana Clara Souza',  '(91) 98765-4321', '1995-03-15', 'Prefere horario pela manha', 1),
          ('Beatriz Mendes',   '(91) 99876-5432', '1988-07-22', NULL, 1),
          ('Camila Rodrigues', '(91) 97654-3210', '1992-11-08', 'Alergia a esmalte com formol', 1),
          ('Daniela Ferreira', '(91) 98543-2109', '1990-01-30', NULL, 1),
          ('Elisa Nascimento', '(91) 99432-1098', '1985-06-14', 'Cliente VIP - sempre pontual', 1),
          ('Fernanda Lima',    '(91) 98321-0987', '1998-09-03', NULL, 1),
          ('Gabriela Santos',  '(91) 97210-9876', '1993-12-25', 'Faz manicure e pedicure juntas', 1),
          ('Helena Costa',     '(91) 96109-8765', '1987-04-18', NULL, 1),
          ('Isabela Martins',  '(91) 95098-7654', '2000-08-07', 'Estudante - prefere sabados', 1),
          ('Julia Almeida',    '(91) 94987-6543', '1996-03-28', NULL, 1);

        INSERT INTO estoque_kits (tipo, quantidade, alerta_atencao, alerta_urgente, alerta_critico) VALUES
          ('mao', 20, 15, 10, 5), ('pe', 18, 15, 10, 5);

        INSERT INTO estoque_lojinha (nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo, ativo) VALUES
          ('Oleo de cutilas', 'Risque', 8.50, 18.00, 12, 3, 1),
          ('Creme hidratante maos', 'Natura', 15.00, 32.00, 8, 3, 1);

        INSERT INTO configuracoes (chave, valor) VALUES
          ('salao_nome', 'Dona Menina Beauty Bar'),
          ('salao_endereco', 'Av. Pedro Alvares Cabral, 1329, Belem/PA'),
          ('salao_telefone', '(91) 99999-0000'),
          ('horario_abertura', '09:00'),
          ('horario_fechamento', '19:00'),
          ('backup_intervalo_dias', '7'),
          ('backup_pasta', './backups');
      `);

      console.log('Banco PostgreSQL inicializado com sucesso!');
    } else {
      console.log('Banco PostgreSQL existente — conectado!');
      // Migracoes incrementais
      await client.query(`ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS cortesia INTEGER NOT NULL DEFAULT 0`);
      await client.query(`ALTER TABLE atendimento_itens ADD COLUMN IF NOT EXISTS cortesia INTEGER NOT NULL DEFAULT 0`);
    }
  } catch (e) {
    console.error('Erro ao inicializar banco:', e);
    throw e;
  } finally {
    client.release();
  }
}

export default pool;
