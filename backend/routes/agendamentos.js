import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, data_inicio, data_fim } = req.query;
    let result;
    const base = `
      SELECT ag.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
        col.nome as colaboradora_nome, s.nome as servico_nome, s.tempo_min
      FROM agendamentos ag
      LEFT JOIN clientes c ON c.id = ag.cliente_id
      LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
      LEFT JOIN servicos s ON s.id = ag.servico_id
    `;
    if (data) {
      result = await pool.query(`${base} WHERE DATE(ag.data_hora) = $1 ORDER BY ag.data_hora`, [data]);
    } else if (data_inicio && data_fim) {
      result = await pool.query(`${base} WHERE DATE(ag.data_hora) BETWEEN $1 AND $2 ORDER BY ag.data_hora`, [data_inicio, data_fim]);
    } else {
      result = await pool.query(`${base} ORDER BY ag.data_hora DESC LIMIT 50`);
    }
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ag.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
        col.nome as colaboradora_nome, s.nome as servico_nome, s.tempo_min, s.preco as servico_preco
      FROM agendamentos ag
      LEFT JOIN clientes c ON c.id = ag.cliente_id
      LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
      LEFT JOIN servicos s ON s.id = ag.servico_id
      WHERE ag.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Agendamento nao encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { cliente_id, colaboradora_id, data_hora, servico_id, observacao } = req.body;
    if (!cliente_id || !data_hora) return res.status(400).json({ ok: false, error: 'cliente_id e data_hora sao obrigatorios' });
    const result = await pool.query(`
      INSERT INTO agendamentos (cliente_id, colaboradora_id, data_hora, servico_id, observacao)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [cliente_id, colaboradora_id || null, data_hora, servico_id || null, observacao || null]);
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { cliente_id, colaboradora_id, data_hora, servico_id, status, observacao } = req.body;
    // status ausente no body = mantem o status atual (nao rebaixa 'concluido' para 'agendado')
    const result = await pool.query(`
      UPDATE agendamentos SET cliente_id=$1, colaboradora_id=$2, data_hora=$3, servico_id=$4,
      status=COALESCE($5, status), observacao=$6, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$7 RETURNING *
    `, [cliente_id, colaboradora_id || null, data_hora, servico_id || null, status || null, observacao || null, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Agendamento nao encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ ok: false, error: 'status e obrigatorio' });
    const result = await pool.query(
      `UPDATE agendamentos SET status=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Agendamento nao encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM agendamentos WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Agendamento nao encontrado' });
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
