import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', '..', 'data', 'dona_menina.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const isNewDatabase = !existsSync(DB_PATH);

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

if (isNewDatabase) {
  const schemaPath = process.env.SCHEMA_PATH || join(__dirname, 'schema.sql');
  const seedPath   = process.env.SEED_PATH   || join(__dirname, 'seed.sql');
  db.exec(readFileSync(schemaPath, 'utf-8'));
  db.exec(readFileSync(seedPath,   'utf-8'));
  console.log('Banco inicializado. DB path:', DB_PATH);
} else {
  // Migracoes para bancos existentes
  const migracoes = [
    `ALTER TABLE atendimentos ADD COLUMN status TEXT NOT NULL DEFAULT 'concluida'`,
    `ALTER TABLE atendimentos ADD COLUMN taxa_agendamento_valor REAL`,
    `ALTER TABLE atendimentos ADD COLUMN taxa_agendamento_forma TEXT`,
    `ALTER TABLE atendimentos ADD COLUMN taxa_lancada_manualmente INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL DEFAULT 'manual',
      arquivo TEXT, tamanho INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
    `INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('backup_intervalo_dias', '7')`,
    `CREATE TABLE IF NOT EXISTS estoque_freezer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      marca TEXT,
      preco_custo REAL,
      preco_venda REAL NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 0,
      alerta_minimo INTEGER NOT NULL DEFAULT 3,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `ALTER TABLE atendimento_itens ADD COLUMN freezer_id INTEGER REFERENCES estoque_freezer(id)`,
  ];
  for (const sql of migracoes) {
    try { db.exec(sql); } catch (e) { /* coluna/tabela ja existe, ignorar */ }
  }
  console.log('Banco existente carregado. DB path:', DB_PATH);
}

export default db;
