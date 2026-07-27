import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    // Aceita ?q= e ?busca= (telas diferentes usavam nomes diferentes)
    const q = req.query.q || req.query.busca;
    let result;
    if (q) {
      const term = `%${q}%`;
      result = await pool.query(
        'SELECT * FROM clientes WHERE ativa = 1 AND (nome ILIKE $1 OR telefone ILIKE $2) ORDER BY nome',
        [term, term]
      );
    } else {
      result = await pool.query('SELECT * FROM clientes WHERE ativa = 1 ORDER BY nome');
    }
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/verificar-telefone', async (req, res) => {
  try {
    const { telefone } = req.query;
    if (!telefone || telefone.trim().length < 8) return res.json({ ok: true, data: null });
    const soNumeros = telefone.replace(/\D/g, '');
    // Comparacao direto no banco (sem carregar a tabela inteira)
    const result = await pool.query(
      `SELECT * FROM clientes WHERE ativa = 1 AND telefone IS NOT NULL AND regexp_replace(telefone, '\\D', '', 'g') = $1 LIMIT 1`,
      [soNumeros]
    );
    res.json({ ok: true, data: result.rows[0] || null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Cliente nao encontrada' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id/historico', async (req, res) => {
  try {
    const atdResult = await pool.query(
      'SELECT a.* FROM atendimentos a WHERE a.cliente_id = $1 AND a.cancelado = 0 ORDER BY a.data_hora DESC',
      [req.params.id]
    );
    const result = [];
    for (const atd of atdResult.rows) {
      const itensResult = await pool.query(`
        SELECT ai.*, STRING_AGG(aic.colaboradora_id::text, ',') as colab_ids
        FROM atendimento_itens ai
        LEFT JOIN atendimento_item_colaboradoras aic ON aic.atendimento_item_id = ai.id
        WHERE ai.atendimento_id = $1 GROUP BY ai.id
      `, [atd.id]);
      const pagResult = await pool.query('SELECT * FROM atendimento_pagamentos WHERE atendimento_id = $1', [atd.id]);
      result.push({ ...atd, itens: itensResult.rows, pagamentos: pagResult.rows });
    }
    res.json({ ok: true, data: result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id/resumo', async (req, res) => {
  try {
    const id = req.params.id;
    const stats = await pool.query(`
      SELECT COUNT(*) as total_atendimentos, COALESCE(SUM(valor_total), 0) as total_gasto, MAX(data_hora) as ultima_visita
      FROM atendimentos WHERE cliente_id = $1 AND cancelado = 0
    `, [id]);
    const sf = await pool.query(`
      SELECT ai.descricao, COUNT(*) as cnt FROM atendimento_itens ai
      JOIN atendimentos a ON a.id = ai.atendimento_id
      WHERE a.cliente_id = $1 AND a.cancelado = 0 AND ai.tipo = 'servico'
      GROUP BY ai.descricao ORDER BY cnt DESC LIMIT 1
    `, [id]);
    const s = stats.rows[0];
    let diasDesdeUltimaVisita = null;
    if (s.ultima_visita) {
      const diff = Date.now() - new Date(s.ultima_visita).getTime();
      diasDesdeUltimaVisita = Math.floor(diff / (1000 * 60 * 60 * 24));
    }
    res.json({ ok: true, data: {
      total_atendimentos: parseInt(s.total_atendimentos),
      total_gasto: parseFloat(s.total_gasto),
      servico_mais_frequente: sf.rows[0]?.descricao || null,
      ultima_visita: s.ultima_visita,
      dias_desde_ultima_visita: diasDesdeUltimaVisita,
    }});
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nome, telefone, data_nascimento, observacoes } = req.body;
    if (!nome || nome.trim().length < 2)
      return res.status(400).json({ ok: false, error: 'Nome deve ter pelo menos 2 caracteres' });
    if (telefone && telefone.trim()) {
      const soNumeros = telefone.replace(/\D/g, '');
      const dup = await pool.query(
        `SELECT * FROM clientes WHERE ativa = 1 AND telefone IS NOT NULL AND regexp_replace(telefone, '\\D', '', 'g') = $1 LIMIT 1`,
        [soNumeros]
      );
      const existente = dup.rows[0];
      if (existente) return res.status(409).json({ ok: false, error: `Este telefone já está cadastrado para "${existente.nome}"`, data: existente });
    }
    const result = await pool.query(
      'INSERT INTO clientes (nome, telefone, data_nascimento, observacoes) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome.trim(), telefone || null, data_nascimento || null, observacoes || null]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nome, telefone, data_nascimento, observacoes } = req.body;
    if (!nome || nome.trim().length < 2)
      return res.status(400).json({ ok: false, error: 'Nome deve ter pelo menos 2 caracteres' });
    const result = await pool.query(
      `UPDATE clientes SET nome=$1, telefone=$2, data_nascimento=$3, observacoes=$4,
       updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$5 RETURNING *`,
      [nome.trim(), telefone || null, data_nascimento || null, observacoes || null, req.params.id]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const cnt = await pool.query('SELECT COUNT(*) as cnt FROM atendimentos WHERE cliente_id = $1', [req.params.id]);
    if (parseInt(cnt.rows[0].cnt) > 0) {
      await pool.query(`UPDATE clientes SET ativa=0, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [req.params.id]);
    } else {
      await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    }
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
