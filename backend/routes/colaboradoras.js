import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

router.get('/', (req, res) => {
  const colaboradoras = db.prepare(
    'SELECT * FROM colaboradoras ORDER BY ativa DESC, nome'
  ).all();
  res.json({ ok: true, data: colaboradoras });
});

router.get('/:id', (req, res) => {
  const colab = db.prepare('SELECT * FROM colaboradoras WHERE id = ?').get(req.params.id);
  if (!colab) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });
  res.json({ ok: true, data: colab });
});

router.post('/', (req, res) => {
  const { nome, funcao, comissao_padrao } = req.body;
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
  const comissao = Number(comissao_padrao);
  if (isNaN(comissao) || comissao < 0 || comissao > 100) {
    return res.status(400).json({ ok: false, error: 'Comissao deve ser entre 0 e 100' });
  }

  const result = db.prepare(
    'INSERT INTO colaboradoras (nome, funcao, comissao_padrao) VALUES (?, ?, ?)'
  ).run(nome, funcao || null, comissao);

  const colab = db.prepare('SELECT * FROM colaboradoras WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: colab });
});

router.put('/:id', (req, res) => {
  const { nome, funcao, comissao_padrao } = req.body;
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });

  db.prepare(`
    UPDATE colaboradoras SET nome = ?, funcao = ?, comissao_padrao = ?,
    updated_at = datetime('now','localtime') WHERE id = ?
  `).run(nome, funcao || null, Number(comissao_padrao), req.params.id);

  const colab = db.prepare('SELECT * FROM colaboradoras WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: colab });
});

router.patch('/:id/status', (req, res) => {
  const colab = db.prepare('SELECT * FROM colaboradoras WHERE id = ?').get(req.params.id);
  if (!colab) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });

  db.prepare(`
    UPDATE colaboradoras SET ativa = ?, updated_at = datetime('now','localtime') WHERE id = ?
  `).run(colab.ativa ? 0 : 1, req.params.id);

  const updated = db.prepare('SELECT * FROM colaboradoras WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: updated });
});

router.delete('/:id', (req, res) => {
  const colab = db.prepare('SELECT * FROM colaboradoras WHERE id = ?').get(req.params.id);
  if (!colab) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });

  const temHistorico = db.prepare(
    'SELECT COUNT(*) as cnt FROM atendimento_item_colaboradoras WHERE colaboradora_id = ?'
  ).get(req.params.id);

  if (temHistorico.cnt > 0) {
    // Tem histórico: desativa em vez de excluir para preservar dados
    db.prepare("UPDATE colaboradoras SET ativa = 0, updated_at = datetime('now','localtime') WHERE id = ?").run(req.params.id);
    return res.json({ ok: true, data: { desativada: true }, message: 'Colaboradora desativada pois possui historico de atendimentos' });
  }

  db.prepare('DELETE FROM colaboradoras WHERE id = ?').run(req.params.id);
  res.json({ ok: true, data: { excluida: true } });
});

export default router;
