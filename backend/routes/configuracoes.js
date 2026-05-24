import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM configuracoes');
    const config = {};
    for (const row of result.rows) config[row.chave] = row.valor;
    res.json({ ok: true, data: config });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [chave, valor] of Object.entries(req.body)) {
      await client.query(
        'INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
        [chave, String(valor)]
      );
    }
    await client.query('COMMIT');
    const result = await pool.query('SELECT * FROM configuracoes');
    const config = {};
    for (const row of result.rows) config[row.chave] = row.valor;
    res.json({ ok: true, data: config });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: e.message });
  } finally { client.release(); }
});

export default router;
