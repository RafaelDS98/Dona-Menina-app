import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/disparo', async (req, res) => {
  try {
    const { filtro = 'todas' } = req.query;
    const hoje = new Date();
    const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
    let result;

    if (filtro === 'recentes') {
      const trintaDias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      result = await pool.query(`
        SELECT DISTINCT c.id, c.nome, c.telefone, MAX(a.data_hora) as ultima_visita
        FROM clientes c JOIN atendimentos a ON a.cliente_id=c.id
        WHERE c.ativa=1 AND c.telefone IS NOT NULL AND c.telefone!=''
        AND a.cancelado=0 AND DATE(a.data_hora)>=$1
        GROUP BY c.id ORDER BY c.nome
      `, [trintaDias]);
    } else if (filtro === 'inativas') {
      const sessentaDias = new Date(hoje.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      result = await pool.query(`
        SELECT c.id, c.nome, c.telefone, MAX(a.data_hora) as ultima_visita
        FROM clientes c LEFT JOIN atendimentos a ON a.cliente_id=c.id AND a.cancelado=0
        WHERE c.ativa=1 AND c.telefone IS NOT NULL AND c.telefone!=''
        GROUP BY c.id HAVING MAX(a.data_hora) IS NULL OR DATE(MAX(a.data_hora)) < $1
        ORDER BY c.nome
      `, [sessentaDias]);
    } else if (filtro === 'aniversariantes') {
      result = await pool.query(`
        SELECT c.id, c.nome, c.telefone, c.data_nascimento,
          (SELECT MAX(a.data_hora) FROM atendimentos a WHERE a.cliente_id=c.id AND a.cancelado=0) as ultima_visita
        FROM clientes c
        WHERE c.ativa=1 AND c.telefone IS NOT NULL AND c.telefone!=''
        AND SUBSTRING(c.data_nascimento FROM 6 FOR 2) = $1
        ORDER BY c.nome
      `, [mesAtual]);
    } else {
      result = await pool.query(`
        SELECT c.id, c.nome, c.telefone,
          (SELECT MAX(a.data_hora) FROM atendimentos a WHERE a.cliente_id=c.id AND a.cancelado=0) as ultima_visita
        FROM clientes c
        WHERE c.ativa=1 AND c.telefone IS NOT NULL AND c.telefone!=''
        ORDER BY c.nome
      `);
    }

    const data = result.rows.map(c => ({
      ...c,
      telefone_limpo: c.telefone ? '55' + c.telefone.replace(/\D/g, '') : null,
    }));
    res.json({ ok: true, data });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
