import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

router.get('/', (req, res) => {
  const { ativas } = req.query;
  let promocoes;
  if (ativas === 'true') {
    const hoje = new Date().toISOString().split('T')[0];
    promocoes = db.prepare(`
      SELECT * FROM promocoes WHERE ativa = 1 AND data_inicio <= ? AND data_fim >= ? ORDER BY nome
    `).all(hoje, hoje);
  } else {
    promocoes = db.prepare('SELECT * FROM promocoes ORDER BY data_fim DESC').all();
  }

  // Attach services for each promotion
  const result = promocoes.map(p => {
    const servicos = db.prepare(`
      SELECT s.id, s.nome, s.preco FROM promocao_servicos ps
      JOIN servicos s ON s.id = ps.servico_id WHERE ps.promocao_id = ?
    `).all(p.id);
    return { ...p, servicos };
  });

  res.json({ ok: true, data: result });
});

router.get('/:id', (req, res) => {
  const promo = db.prepare('SELECT * FROM promocoes WHERE id = ?').get(req.params.id);
  if (!promo) return res.status(404).json({ ok: false, error: 'Promocao nao encontrada' });

  const servicos = db.prepare(`
    SELECT s.id, s.nome, s.preco FROM promocao_servicos ps
    JOIN servicos s ON s.id = ps.servico_id WHERE ps.promocao_id = ?
  `).all(promo.id);

  res.json({ ok: true, data: { ...promo, servicos } });
});

router.post('/', (req, res) => {
  const { nome, descricao, preco, data_inicio, data_fim, servico_ids } = req.body;
  if (!nome || !preco || !data_inicio || !data_fim) {
    return res.status(400).json({ ok: false, error: 'nome, preco, data_inicio e data_fim sao obrigatorios' });
  }

  const createPromo = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO promocoes (nome, descricao, preco, data_inicio, data_fim) VALUES (?, ?, ?, ?, ?)'
    ).run(nome, descricao || null, preco, data_inicio, data_fim);

    if (servico_ids && servico_ids.length > 0) {
      const insert = db.prepare('INSERT INTO promocao_servicos (promocao_id, servico_id) VALUES (?, ?)');
      for (const sid of servico_ids) {
        insert.run(result.lastInsertRowid, sid);
      }
    }
    return result.lastInsertRowid;
  });

  const id = createPromo();
  const promo = db.prepare('SELECT * FROM promocoes WHERE id = ?').get(id);
  res.status(201).json({ ok: true, data: promo });
});

router.put('/:id', (req, res) => {
  const { nome, descricao, preco, data_inicio, data_fim, ativa, servico_ids } = req.body;

  const updatePromo = db.transaction(() => {
    db.prepare(`
      UPDATE promocoes SET nome = ?, descricao = ?, preco = ?, data_inicio = ?, data_fim = ?, ativa = ?
      WHERE id = ?
    `).run(nome, descricao || null, preco, data_inicio, data_fim, ativa !== undefined ? ativa : 1, req.params.id);

    if (servico_ids) {
      db.prepare('DELETE FROM promocao_servicos WHERE promocao_id = ?').run(req.params.id);
      const insert = db.prepare('INSERT INTO promocao_servicos (promocao_id, servico_id) VALUES (?, ?)');
      for (const sid of servico_ids) {
        insert.run(req.params.id, sid);
      }
    }
  });

  updatePromo();
  const promo = db.prepare('SELECT * FROM promocoes WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: promo });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM promocoes WHERE id = ?').run(req.params.id);
  res.json({ ok: true, data: null });
});

export default router;
