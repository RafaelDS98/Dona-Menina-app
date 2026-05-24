import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

// GET /api/clientes — listar clientes ativos (com busca opcional)
router.get('/', (req, res) => {
  const { q } = req.query;
  let clientes;
  if (q) {
    const term = `%${q}%`;
    clientes = db.prepare(
      `SELECT * FROM clientes WHERE ativa = 1 AND (nome LIKE ? OR telefone LIKE ?) ORDER BY nome`
    ).all(term, term);
  } else {
    clientes = db.prepare('SELECT * FROM clientes WHERE ativa = 1 ORDER BY nome').all();
  }
  res.json({ ok: true, data: clientes });
});

// GET /api/clientes/:id
router.get('/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente nao encontrada' });
  res.json({ ok: true, data: cliente });
});

// GET /api/clientes/:id/historico
router.get('/:id/historico', (req, res) => {
  const atendimentos = db.prepare(`
    SELECT a.* FROM atendimentos a
    WHERE a.cliente_id = ? AND a.cancelado = 0
    ORDER BY a.data_hora DESC
  `).all(req.params.id);

  const result = atendimentos.map(atd => {
    const itens = db.prepare(`
      SELECT ai.*, GROUP_CONCAT(aic.colaboradora_id) as colab_ids
      FROM atendimento_itens ai
      LEFT JOIN atendimento_item_colaboradoras aic ON aic.atendimento_item_id = ai.id
      WHERE ai.atendimento_id = ?
      GROUP BY ai.id
    `).all(atd.id);
    const pagamentos = db.prepare(
      'SELECT * FROM atendimento_pagamentos WHERE atendimento_id = ?'
    ).all(atd.id);
    return { ...atd, itens, pagamentos };
  });

  res.json({ ok: true, data: result });
});

// GET /api/clientes/:id/resumo
router.get('/:id/resumo', (req, res) => {
  const id = req.params.id;
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_atendimentos,
      COALESCE(SUM(valor_total), 0) as total_gasto,
      MAX(data_hora) as ultima_visita
    FROM atendimentos
    WHERE cliente_id = ? AND cancelado = 0
  `).get(id);

  const servicoFrequente = db.prepare(`
    SELECT ai.descricao, COUNT(*) as cnt
    FROM atendimento_itens ai
    JOIN atendimentos a ON a.id = ai.atendimento_id
    WHERE a.cliente_id = ? AND a.cancelado = 0 AND ai.tipo = 'servico'
    GROUP BY ai.descricao
    ORDER BY cnt DESC
    LIMIT 1
  `).get(id);

  let diasDesdeUltimaVisita = null;
  if (stats.ultima_visita) {
    const diff = Date.now() - new Date(stats.ultima_visita).getTime();
    diasDesdeUltimaVisita = Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  res.json({
    ok: true,
    data: {
      total_atendimentos: stats.total_atendimentos,
      total_gasto: stats.total_gasto,
      servico_mais_frequente: servicoFrequente?.descricao || null,
      ultima_visita: stats.ultima_visita,
      dias_desde_ultima_visita: diasDesdeUltimaVisita,
    },
  });
});

// GET /api/clientes/verificar-telefone?telefone=XX
router.get('/verificar-telefone', (req, res) => {
  const { telefone } = req.query;
  if (!telefone || telefone.trim().length < 8) {
    return res.json({ ok: true, data: null });
  }
  // Normaliza: remove tudo que não for número
  const soNumeros = telefone.replace(/\D/g, '');
  const clientes = db.prepare('SELECT * FROM clientes WHERE ativa = 1 AND telefone IS NOT NULL').all();
  const encontrada = clientes.find(c => c.telefone && c.telefone.replace(/\D/g, '') === soNumeros);
  res.json({ ok: true, data: encontrada || null });
});

// POST /api/clientes
router.post('/', (req, res) => {
  const { nome, telefone, data_nascimento, observacoes } = req.body;
  if (!nome || nome.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Nome deve ter pelo menos 2 caracteres' });
  }

  // Verifica telefone duplicado
  if (telefone && telefone.trim()) {
    const soNumeros = telefone.replace(/\D/g, '');
    const clientes = db.prepare('SELECT * FROM clientes WHERE ativa = 1 AND telefone IS NOT NULL').all();
    const existente = clientes.find(c => c.telefone && c.telefone.replace(/\D/g, '') === soNumeros);
    if (existente) {
      return res.status(409).json({
        ok: false,
        error: `Este telefone já está cadastrado para "${existente.nome}"`,
        data: existente,
      });
    }
  }

  const result = db.prepare(
    'INSERT INTO clientes (nome, telefone, data_nascimento, observacoes) VALUES (?, ?, ?, ?)'
  ).run(nome.trim(), telefone || null, data_nascimento || null, observacoes || null);

  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: cliente });
});

// PUT /api/clientes/:id
router.put('/:id', (req, res) => {
  const { nome, telefone, data_nascimento, observacoes } = req.body;
  if (!nome || nome.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Nome deve ter pelo menos 2 caracteres' });
  }

  db.prepare(`
    UPDATE clientes SET nome = ?, telefone = ?, data_nascimento = ?, observacoes = ?,
    updated_at = datetime('now','localtime') WHERE id = ?
  `).run(nome.trim(), telefone || null, data_nascimento || null, observacoes || null, req.params.id);

  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: cliente });
});

// DELETE /api/clientes/:id — soft delete if has atendimentos, hard delete if not
router.delete('/:id', (req, res) => {
  const hasAtendimentos = db.prepare(
    'SELECT COUNT(*) as cnt FROM atendimentos WHERE cliente_id = ?'
  ).get(req.params.id);

  if (hasAtendimentos.cnt > 0) {
    db.prepare('UPDATE clientes SET ativa = 0, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(req.params.id);
  } else {
    db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  }

  res.json({ ok: true, data: null });
});

export default router;
