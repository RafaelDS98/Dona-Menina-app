import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

const round2 = (v) => Math.round(Number(v) * 100) / 100;

function validarSaida({ data, descricao, valor_unit, quantidade }) {
  if (!data || !descricao) return 'data e descricao sao obrigatorios';
  const vu = Number(valor_unit);
  if (!Number.isFinite(vu) || vu <= 0) return 'valor_unit invalido — informe um numero maior que zero (use ponto para centavos)';
  const qty = quantidade === undefined || quantidade === null || quantidade === '' ? 1 : Number(quantidade);
  if (!Number.isInteger(qty) || qty < 1) return 'quantidade invalida — informe um numero inteiro maior que zero';
  return null;
}

function exigirDatas(req, res) {
  const { data_inicio, data_fim } = req.query;
  if (!data_inicio || !data_fim) {
    res.status(400).json({ ok: false, error: 'data_inicio e data_fim sao obrigatorios' });
    return null;
  }
  return { data_inicio, data_fim };
}

router.get('/resumo', async (req, res) => {
  try {
    const datas = exigirDatas(req, res);
    if (!datas) return;
    const receita = await pool.query(`
      SELECT COUNT(*) as total_atendimentos, COALESCE(SUM(valor_total),0) as faturamento_bruto
      FROM atendimentos WHERE cancelado=0 AND status='concluida' AND DATE(data_hora) BETWEEN $1 AND $2
    `, [datas.data_inicio, datas.data_fim]);
    const despesas = await pool.query(`
      SELECT COALESCE(SUM(valor_total),0) as total_saidas FROM saidas WHERE DATE(data) BETWEEN $1 AND $2
    `, [datas.data_inicio, datas.data_fim]);
    const r = receita.rows[0];
    res.json({ ok: true, data: {
      total_atendimentos: parseInt(r.total_atendimentos),
      faturamento_bruto: round2(r.faturamento_bruto),
      total_saidas: round2(despesas.rows[0].total_saidas),
      saldo: round2(Number(r.faturamento_bruto) - Number(despesas.rows[0].total_saidas)),
    }});
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/por-servico', async (req, res) => {
  try {
    const datas = exigirDatas(req, res);
    if (!datas) return;
    // Mesma base do /resumo: só atendimentos concluidos e itens que nao sao cortesia
    const result = await pool.query(`
      SELECT ai.descricao as servico, COUNT(*) as quantidade, ROUND(SUM(ai.preco_cobrado)::numeric, 2) as valor_total
      FROM atendimento_itens ai JOIN atendimentos a ON a.id=ai.atendimento_id
      WHERE a.cancelado=0 AND a.status='concluida' AND ai.cortesia=0 AND ai.tipo='servico'
        AND DATE(a.data_hora) BETWEEN $1 AND $2
      GROUP BY ai.descricao ORDER BY quantidade DESC
    `, [datas.data_inicio, datas.data_fim]);
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/por-forma-pagamento', async (req, res) => {
  try {
    const datas = exigirDatas(req, res);
    if (!datas) return;
    const result = await pool.query(`
      SELECT ap.forma, ROUND(SUM(ap.valor)::numeric, 2) as valor_total
      FROM atendimento_pagamentos ap JOIN atendimentos a ON a.id=ap.atendimento_id
      WHERE a.cancelado=0 AND DATE(a.data_hora) BETWEEN $1 AND $2
        AND ap.forma != 'desconto_taxa' AND ap.forma != 'pago_antecipado'
      GROUP BY ap.forma
    `, [datas.data_inicio, datas.data_fim]);
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/por-colaboradora', async (req, res) => {
  try {
    const datas = exigirDatas(req, res);
    if (!datas) return;
    const result = await pool.query(`
      SELECT col.nome as colaboradora, COUNT(DISTINCT a.id) as total_atendimentos, ROUND(SUM(ai.preco_cobrado)::numeric, 2) as faturamento
      FROM atendimento_item_colaboradoras aic
      JOIN colaboradoras col ON col.id=aic.colaboradora_id
      JOIN atendimento_itens ai ON ai.id=aic.atendimento_item_id
      JOIN atendimentos a ON a.id=ai.atendimento_id
      WHERE a.cancelado=0 AND a.status='concluida' AND ai.cortesia=0
        AND DATE(a.data_hora) BETWEEN $1 AND $2
      GROUP BY col.nome ORDER BY faturamento DESC
    `, [datas.data_inicio, datas.data_fim]);
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/saidas', async (req, res) => {
  try {
    const datas = exigirDatas(req, res);
    if (!datas) return;
    const result = await pool.query(
      'SELECT * FROM saidas WHERE DATE(data) BETWEEN $1 AND $2 ORDER BY data DESC, id DESC',
      [datas.data_inicio, datas.data_fim]
    );
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/saidas', async (req, res) => {
  try {
    const { data, descricao, marca, valor_unit, quantidade, fornecedor } = req.body;
    const erro = validarSaida(req.body);
    if (erro) return res.status(400).json({ ok: false, error: erro });
    const qty = quantidade === undefined || quantidade === null || quantidade === '' ? 1 : Number(quantidade);
    const total = round2(Number(valor_unit) * qty);
    const result = await pool.query(
      'INSERT INTO saidas (data, descricao, marca, valor_unit, quantidade, valor_total, fornecedor) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [data, descricao, marca || null, round2(valor_unit), qty, total, fornecedor || null]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/saidas/:id', async (req, res) => {
  try {
    const { data, descricao, marca, valor_unit, quantidade, fornecedor } = req.body;
    const erro = validarSaida(req.body);
    if (erro) return res.status(400).json({ ok: false, error: erro });
    const qty = quantidade === undefined || quantidade === null || quantidade === '' ? 1 : Number(quantidade);
    const total = round2(Number(valor_unit) * qty);
    const result = await pool.query(
      'UPDATE saidas SET data=$1, descricao=$2, marca=$3, valor_unit=$4, quantidade=$5, valor_total=$6, fornecedor=$7 WHERE id=$8 RETURNING *',
      [data, descricao, marca || null, round2(valor_unit), qty, total, fornecedor || null, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ ok: false, error: 'Saida nao encontrada' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/saidas/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM saidas WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ ok: false, error: 'Saida nao encontrada' });
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
