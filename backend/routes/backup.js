import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

// No PostgreSQL o backup é feito pelo próprio Railway automaticamente
// Esta rota registra um log manual
router.post('/gerar', async (req, res) => {
  try {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const arquivo = `backup_dona_menina_${timestamp}`;
    const result = await pool.query(
      'INSERT INTO backup_log (arquivo, tamanho_kb) VALUES ($1, $2) RETURNING *',
      [arquivo, 0]
    );
    res.json({ ok: true, data: { arquivo, tamanho_kb: 0, created_at: result.rows[0].created_at } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/historico', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM backup_log ORDER BY created_at DESC');
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/status', async (req, res) => {
  try {
    const ultimo = await pool.query('SELECT * FROM backup_log ORDER BY created_at DESC LIMIT 1');
    const intervalo = await pool.query("SELECT valor FROM configuracoes WHERE chave='backup_intervalo_dias'");
    const intervaloDias = Number(intervalo.rows[0]?.valor || 7);
    let vencido = true;
    let diasDesdeBackup = null;
    if (ultimo.rows[0]) {
      const diff = Date.now() - new Date(ultimo.rows[0].created_at).getTime();
      diasDesdeBackup = Math.floor(diff / (1000 * 60 * 60 * 24));
      vencido = diasDesdeBackup >= intervaloDias;
    }
    res.json({ ok: true, data: {
      ultimo_backup: ultimo.rows[0]?.created_at || null,
      dias_desde_backup: diasDesdeBackup,
      vencido,
      intervalo_dias: intervaloDias,
    }});
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
