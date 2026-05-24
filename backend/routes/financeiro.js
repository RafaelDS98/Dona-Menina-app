import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

// GET /api/financeiro/resumo?data_inicio=&data_fim=
router.get('/resumo', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  if (!data_inicio || !data_fim) {
    return res.status(400).json({ ok: false, error: 'data_inicio e data_fim sao obrigatorios' });
  }

  const receita = db.prepare(`
    SELECT COUNT(*) as total_atendimentos, COALESCE(SUM(valor_total), 0) as faturamento_bruto
    FROM atendimentos WHERE cancelado = 0 AND status = 'concluida' AND DATE(data_hora) BETWEEN ? AND ?
  `).get(data_inicio, data_fim);

  const despesas = db.prepare(`
    SELECT COALESCE(SUM(valor_total), 0) as total_saidas
    FROM saidas WHERE DATE(data) BETWEEN ? AND ?
  `).get(data_inicio, data_fim);

  res.json({
    ok: true,
    data: {
      total_atendimentos: receita.total_atendimentos,
      faturamento_bruto: receita.faturamento_bruto, // TODO: exibir apenas para perfil Administrador (a implementar futuramente)
      total_saidas: despesas.total_saidas,
      saldo: receita.faturamento_bruto - despesas.total_saidas, // TODO: exibir apenas para perfil Administrador (a implementar futuramente)
    },
  });
});

// GET /api/financeiro/por-servico?data_inicio=&data_fim=
router.get('/por-servico', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  const result = db.prepare(`
    SELECT ai.descricao as servico, COUNT(*) as quantidade, SUM(ai.preco_cobrado) as valor_total
    FROM atendimento_itens ai
    JOIN atendimentos a ON a.id = ai.atendimento_id
    WHERE a.cancelado = 0 AND ai.tipo = 'servico' AND DATE(a.data_hora) BETWEEN ? AND ?
    GROUP BY ai.descricao ORDER BY quantidade DESC
  `).all(data_inicio, data_fim);
  res.json({ ok: true, data: result });
});

// GET /api/financeiro/por-forma-pagamento?data_inicio=&data_fim=
router.get('/por-forma-pagamento', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  const result = db.prepare(`
    SELECT ap.forma, SUM(ap.valor) as valor_total
    FROM atendimento_pagamentos ap
    JOIN atendimentos a ON a.id = ap.atendimento_id
    WHERE a.cancelado = 0 AND DATE(a.data_hora) BETWEEN ? AND ?
    AND ap.forma != 'desconto_taxa'
    GROUP BY ap.forma
  `).all(data_inicio, data_fim);
  res.json({ ok: true, data: result });
});

// GET /api/financeiro/saidas?data_inicio=&data_fim=
router.get('/saidas', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let saidas;
  if (data_inicio && data_fim) {
    saidas = db.prepare('SELECT * FROM saidas WHERE DATE(data) BETWEEN ? AND ? ORDER BY data DESC').all(data_inicio, data_fim);
  } else {
    saidas = db.prepare('SELECT * FROM saidas ORDER BY data DESC LIMIT 50').all();
  }
  res.json({ ok: true, data: saidas });
});

// POST /api/financeiro/saidas
router.post('/saidas', (req, res) => {
  const { data, descricao, marca, valor_unit, quantidade, fornecedor } = req.body;
  if (!data || !descricao || !valor_unit) {
    return res.status(400).json({ ok: false, error: 'data, descricao e valor_unit sao obrigatorios' });
  }
  const qty = quantidade || 1;
  const valorTotal = valor_unit * qty;

  const result = db.prepare(`
    INSERT INTO saidas (data, descricao, marca, valor_unit, quantidade, valor_total, fornecedor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data, descricao, marca || null, valor_unit, qty, valorTotal, fornecedor || null);

  const saida = db.prepare('SELECT * FROM saidas WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: saida });
});

// PUT /api/financeiro/saidas/:id
router.put('/saidas/:id', (req, res) => {
  const { data, descricao, marca, valor_unit, quantidade, fornecedor } = req.body;
  const qty = quantidade || 1;
  const valorTotal = valor_unit * qty;

  db.prepare(`
    UPDATE saidas SET data = ?, descricao = ?, marca = ?, valor_unit = ?, quantidade = ?,
    valor_total = ?, fornecedor = ? WHERE id = ?
  `).run(data, descricao, marca || null, valor_unit, qty, valorTotal, fornecedor || null, req.params.id);

  const saida = db.prepare('SELECT * FROM saidas WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: saida });
});

// DELETE /api/financeiro/saidas/:id
router.delete('/saidas/:id', (req, res) => {
  db.prepare('DELETE FROM saidas WHERE id = ?').run(req.params.id);
  res.json({ ok: true, data: null });
});

export default router;
