import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

function calcKitStatus(kit) {
  if (kit.quantidade > kit.alerta_atencao) return 'ok';
  if (kit.quantidade > kit.alerta_urgente) return 'atencao';
  if (kit.quantidade > kit.alerta_critico) return 'urgente';
  return 'critico';
}

// GET /api/estoque/kits
router.get('/kits', (req, res) => {
  const kits = db.prepare('SELECT * FROM estoque_kits').all();
  const result = kits.map(k => ({ ...k, status: calcKitStatus(k) }));
  res.json({ ok: true, data: result });
});

// PATCH /api/estoque/kits/:tipo — update quantity
router.patch('/kits/:tipo', (req, res) => {
  const { quantidade } = req.body;
  db.prepare('UPDATE estoque_kits SET quantidade = ?, updated_at = datetime(\'now\',\'localtime\') WHERE tipo = ?')
    .run(Number(quantidade), req.params.tipo);
  const kit = db.prepare('SELECT * FROM estoque_kits WHERE tipo = ?').get(req.params.tipo);
  res.json({ ok: true, data: { ...kit, status: calcKitStatus(kit) } });
});

// PUT /api/estoque/kits/:tipo/limites — update alert thresholds
router.put('/kits/:tipo/limites', (req, res) => {
  const { alerta_atencao, alerta_urgente, alerta_critico } = req.body;
  db.prepare(`
    UPDATE estoque_kits SET alerta_atencao = ?, alerta_urgente = ?, alerta_critico = ?,
    updated_at = datetime('now','localtime') WHERE tipo = ?
  `).run(alerta_atencao, alerta_urgente, alerta_critico, req.params.tipo);
  const kit = db.prepare('SELECT * FROM estoque_kits WHERE tipo = ?').get(req.params.tipo);
  res.json({ ok: true, data: { ...kit, status: calcKitStatus(kit) } });
});

// GET /api/estoque/lojinha
router.get('/lojinha', (req, res) => {
  const { alerta } = req.query;
  let produtos;
  if (alerta === 'true') {
    produtos = db.prepare('SELECT * FROM estoque_lojinha WHERE quantidade <= alerta_minimo ORDER BY nome').all();
  } else {
    produtos = db.prepare('SELECT * FROM estoque_lojinha ORDER BY nome').all();
  }
  res.json({ ok: true, data: produtos });
});

router.get('/lojinha/:id', (req, res) => {
  const produto = db.prepare('SELECT * FROM estoque_lojinha WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ ok: false, error: 'Produto nao encontrado' });
  res.json({ ok: true, data: produto });
});

router.post('/lojinha', (req, res) => {
  const { nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo } = req.body;
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
  if (!preco_venda || preco_venda <= 0) return res.status(400).json({ ok: false, error: 'Preco de venda e obrigatorio' });

  const result = db.prepare(`
    INSERT INTO estoque_lojinha (nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nome, marca || null, preco_custo || null, preco_venda, quantidade || 0, alerta_minimo || 3);

  const produto = db.prepare('SELECT * FROM estoque_lojinha WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: produto });
});

router.put('/lojinha/:id', (req, res) => {
  const { nome, marca, preco_custo, preco_venda, alerta_minimo } = req.body;
  db.prepare(`
    UPDATE estoque_lojinha SET nome = ?, marca = ?, preco_custo = ?, preco_venda = ?, alerta_minimo = ?,
    updated_at = datetime('now','localtime') WHERE id = ?
  `).run(nome, marca || null, preco_custo || null, preco_venda, alerta_minimo || 3, req.params.id);

  const produto = db.prepare('SELECT * FROM estoque_lojinha WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: produto });
});

router.patch('/lojinha/:id/estoque', (req, res) => {
  const { operacao, valor } = req.body;
  const produto = db.prepare('SELECT * FROM estoque_lojinha WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ ok: false, error: 'Produto nao encontrado' });

  let newQty;
  if (operacao === 'set') newQty = Number(valor);
  else if (operacao === 'add') newQty = produto.quantidade + Number(valor);
  else if (operacao === 'subtract') newQty = Math.max(0, produto.quantidade - Number(valor));
  else return res.status(400).json({ ok: false, error: 'operacao deve ser set, add ou subtract' });

  db.prepare('UPDATE estoque_lojinha SET quantidade = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(newQty, req.params.id);
  const updated = db.prepare('SELECT * FROM estoque_lojinha WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: updated });
});

router.patch('/lojinha/:id/status', (req, res) => {
  const produto = db.prepare('SELECT * FROM estoque_lojinha WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ ok: false, error: 'Produto nao encontrado' });

  db.prepare('UPDATE estoque_lojinha SET ativo = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(produto.ativo ? 0 : 1, req.params.id);
  const updated = db.prepare('SELECT * FROM estoque_lojinha WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: updated });
});

router.delete('/lojinha/:id', (req, res) => {
  const emUso = db.prepare('SELECT id FROM atendimento_itens WHERE produto_id = ? LIMIT 1').get(req.params.id);
  if (emUso) return res.status(409).json({ ok: false, error: 'Produto possui historico de atendimentos e nao pode ser excluido. Use Desativar.' });
  db.prepare('DELETE FROM estoque_lojinha WHERE id = ?').run(req.params.id);
  res.json({ ok: true, data: null });
});

// ─── Freezer ────────────────────────────────────────────────────────────────

router.get('/freezer', (req, res) => {
  const produtos = db.prepare('SELECT * FROM estoque_freezer ORDER BY nome').all();
  res.json({ ok: true, data: produtos });
});

router.get('/freezer/:id', (req, res) => {
  const produto = db.prepare('SELECT * FROM estoque_freezer WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ ok: false, error: 'Item nao encontrado' });
  res.json({ ok: true, data: produto });
});

router.post('/freezer', (req, res) => {
  const { nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo } = req.body;
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
  if (!preco_venda || preco_venda <= 0) return res.status(400).json({ ok: false, error: 'Preco de venda e obrigatorio' });
  const result = db.prepare(`
    INSERT INTO estoque_freezer (nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nome, marca || null, preco_custo || null, preco_venda, quantidade || 0, alerta_minimo || 3);
  const produto = db.prepare('SELECT * FROM estoque_freezer WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: produto });
});

router.put('/freezer/:id', (req, res) => {
  const { nome, marca, preco_custo, preco_venda, alerta_minimo } = req.body;
  db.prepare(`
    UPDATE estoque_freezer SET nome = ?, marca = ?, preco_custo = ?, preco_venda = ?, alerta_minimo = ?,
    updated_at = datetime('now','localtime') WHERE id = ?
  `).run(nome, marca || null, preco_custo || null, preco_venda, alerta_minimo || 3, req.params.id);
  const produto = db.prepare('SELECT * FROM estoque_freezer WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: produto });
});

router.patch('/freezer/:id/estoque', (req, res) => {
  const { operacao, valor } = req.body;
  const produto = db.prepare('SELECT * FROM estoque_freezer WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ ok: false, error: 'Item nao encontrado' });
  let newQty;
  if (operacao === 'set') newQty = Number(valor);
  else if (operacao === 'add') newQty = produto.quantidade + Number(valor);
  else if (operacao === 'subtract') newQty = Math.max(0, produto.quantidade - Number(valor));
  else return res.status(400).json({ ok: false, error: 'operacao deve ser set, add ou subtract' });
  db.prepare('UPDATE estoque_freezer SET quantidade = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(newQty, req.params.id);
  const updated = db.prepare('SELECT * FROM estoque_freezer WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: updated });
});

router.patch('/freezer/:id/status', (req, res) => {
  const produto = db.prepare('SELECT * FROM estoque_freezer WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ ok: false, error: 'Item nao encontrado' });
  db.prepare('UPDATE estoque_freezer SET ativo = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(produto.ativo ? 0 : 1, req.params.id);
  const updated = db.prepare('SELECT * FROM estoque_freezer WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: updated });
});

router.delete('/freezer/:id', (req, res) => {
  const emUso = db.prepare('SELECT id FROM atendimento_itens WHERE freezer_id = ? LIMIT 1').get(req.params.id);
  if (emUso) return res.status(409).json({ ok: false, error: 'Item possui historico de atendimentos e nao pode ser excluido. Use Desativar.' });
  db.prepare('DELETE FROM estoque_freezer WHERE id = ?').run(req.params.id);
  res.json({ ok: true, data: null });
});

export default router;
