import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/resumo', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    if (!data_inicio || !data_fim) return res.status(400).json({ ok: false, error: 'data_inicio e data_fim sao obrigatorios' });
    const receita = await pool.query(`
      SELECT COUNT(*) as total_atendimentos, COALESCE(SUM(valor_total),0) as faturamento_bruto
      FROM atendimentos WHERE cancelado=0 AND status='concluida' AND DATE(data_hora) BETWEEN $1 AND $2
    `, [data_inicio, data_fim]);
    const despesas = await pool.query(`
      SELECT COALESCE(SUM(valor_total),0) as total_saidas FROM saidas WHERE DATE(data) BETWEEN $1 AND $2
    `, [data_inicio, data_fim]);
    const r = receita.rows[0];
    res.json({ ok: true, data: {
      total_atendimentos: parseInt(r.total_atendimentos),
      faturamento_bruto: parseFloat(r.faturamento_bruto),
      total_saidas: parseFloat(despesas.rows[0].total_saidas),
      saldo: parseFloat(r.faturamento_bruto) - parseFloat(despesas.rows[0].total_saidas),
    }});
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/por-servico', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const result = await pool.query(`
      SELECT ai.descricao as servico, COUNT(*) as quantidade, SUM(ai.preco_cobrado) as valor_total
      FROM atendimento_itens ai JOIN atendimentos a ON a.id=ai.atendimento_id
      WHERE a.cancelado=0 AND ai.tipo='servico' AND DATE(a.data_hora) BETWEEN $1 AND $2
      GROUP BY ai.descricao ORDER BY quantidade DESC
    `, [data_inicio, data_fim]);
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/por-forma-pagamento', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const result = await pool.query(`
      SELECT ap.forma, SUM(ap.valor) as valor_total
      FROM atendimento_pagamentos ap JOIN atendimentos a ON a.id=ap.atendimento_id
      WHERE a.cancelado=0 AND DATE(a.data_hora) BETWEEN $1 AND $2 AND ap.forma != 'desconto_taxa'
      GROUP BY ap.forma
    `, [data_inicio, data_fim]);
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/por-colaboradora', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const result = await pool.query(`
      SELECT col.nome as colaboradora, COUNT(DISTINCT a.id) as total_atendimentos, SUM(ai.preco_cobrado) as faturamento
      FROM atendimento_item_colaboradoras aic
      JOIN colaboradoras col ON col.id=aic.colaboradora_id
      JOIN atendimento_itens ai ON ai.id=aic.atendimento_item_id
      JOIN atendimentos a ON a.id=ai.atendimento_id
      WHERE a.cancelado=0 AND DATE(a.data_hora) BETWEEN $1 AND $2
      GROUP BY col.nome ORDER BY faturamento DESC
    `, [data_inicio, data_fim]);
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/saidas', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    const result = await pool.query(
      'SELECT * FROM saidas WHERE DATE(data) BETWEEN $1 AND $2 ORDER BY data DESC, id DESC',
      [data_inicio, data_fim]
    );
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/saidas', async (req, res) => {
  try {
    const { data, descricao, marca, valor_unit, quantidade, fornecedor } = req.body;
    if (!data || !descricao || !valor_unit) return res.status(400).json({ ok: false, error: 'data, descricao e valor_unit sao obrigatorios' });
    const qty = quantidade || 1;
    const total = Number(valor_unit) * Number(qty);
    const result = await pool.query(
      'INSERT INTO saidas (data, descricao, marca, valor_unit, quantidade, valor_total, fornecedor) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [data, descricao, marca || null, valor_unit, qty, total, fornecedor || null]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/saidas/:id', async (req, res) => {
  try {
    const { data, descricao, marca, valor_unit, quantidade, fornecedor } = req.body;
    if (!data || !descricao || !valor_unit) return res.status(400).json({ ok: false, error: 'data, descricao e valor_unit sao obrigatorios' });
    const qty = Number(quantidade) || 1;
    const total = Number(valor_unit) * qty;
    const result = await pool.query(
      'UPDATE saidas SET data=$1, descricao=$2, marca=$3, valor_unit=$4, quantidade=$5, valor_total=$6, fornecedor=$7 WHERE id=$8 RETURNING *',
      [data, descricao, marca || null, valor_unit, qty, total, fornecedor || null, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ ok: false, error: 'Saida nao encontrada' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/saidas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM saidas WHERE id=$1', [req.params.id]);
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
