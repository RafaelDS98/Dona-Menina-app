import { Router } from 'express';
import { copyFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { createReadStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { unlinkSync } from 'fs';
import db from '../database/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

const router = Router();

// POST /api/backup/gerar
router.post('/gerar', async (req, res) => {
  const backupDir = join(DATA_DIR, 'backups');
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const dbSource = join(DATA_DIR, 'dona_menina.db');
  const dbCopy = join(backupDir, `backup_dona_menina_${timestamp}.db`);
  const gzFile = join(backupDir, `backup_dona_menina_${timestamp}.db.gz`);

  copyFileSync(dbSource, dbCopy);

  await pipeline(
    createReadStream(dbCopy),
    createGzip(),
    createWriteStream(gzFile)
  );

  unlinkSync(dbCopy);

  const stats = statSync(gzFile);
  const tamanhoKb = Math.round(stats.size / 1024);

  db.prepare('INSERT INTO backup_log (arquivo, tamanho_kb) VALUES (?, ?)').run(gzFile, tamanhoKb);

  res.json({ ok: true, data: { arquivo: gzFile, tamanho_kb: tamanhoKb } });
});

// GET /api/backup/historico
router.get('/historico', (req, res) => {
  const logs = db.prepare('SELECT * FROM backup_log ORDER BY created_at DESC').all();
  res.json({ ok: true, data: logs });
});

// GET /api/backup/status
router.get('/status', (req, res) => {
  const ultimo = db.prepare('SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 1').get();
  const intervalo = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'backup_intervalo_dias'").get();
  const intervaloDias = Number(intervalo?.valor || 7);

  let vencido = true;
  let diasDesdeBackup = null;
  if (ultimo) {
    const diff = Date.now() - new Date(ultimo.created_at).getTime();
    diasDesdeBackup = Math.floor(diff / (1000 * 60 * 60 * 24));
    vencido = diasDesdeBackup >= intervaloDias;
  }

  res.json({
    ok: true,
    data: {
      ultimo_backup: ultimo?.created_at || null,
      dias_desde_backup: diasDesdeBackup,
      vencido,
      intervalo_dias: intervaloDias,
    },
  });
});

export default router;
