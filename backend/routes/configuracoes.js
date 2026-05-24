import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM configuracoes').all();
  const config = {};
  for (const row of rows) {
    config[row.chave] = row.valor;
  }
  res.json({ ok: true, data: config });
});

router.put('/', (req, res) => {
  const updates = req.body;
  const upsert = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?');

  const updateAll = db.transaction(() => {
    for (const [chave, valor] of Object.entries(updates)) {
      upsert.run(chave, String(valor), String(valor));
    }
  });

  updateAll();
  const rows = db.prepare('SELECT * FROM configuracoes').all();
  const config = {};
  for (const row of rows) {
    config[row.chave] = row.valor;
  }
  res.json({ ok: true, data: config });
});

export default router;
