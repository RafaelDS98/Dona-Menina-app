import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

// Categorias
router.get('/categorias', (req, res) => {
  const categorias = db.prepare('SELECT * FROM servico_categorias ORDER BY nome').all();
  res.json({ ok: true, data: categorias });
});

router.post('/categorias', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });

  try {
    const result = db.prepare('INSERT INTO servico_categorias (nome) VALUES (?)').run(nome);
    const cat = db.prepare('SELECT * FROM servico_categorias WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ok: true, data: cat });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ ok: false, error: 'Categoria ja existe' });
    }
    throw err;
  }
});

// Servicos
router.get('/', (req, res) => {
  const { categoria_id } = req.query;
  let servicos;
  if (categoria_id) {
    servicos = db.prepare(`
      SELECT s.*, sc.nome as categoria_nome
      FROM servicos s LEFT JOIN servico_categorias sc ON sc.id = s.categoria_id
      WHERE s.categoria_id = ? ORDER BY s.nome
    `).all(categoria_id);
  } else {
    servicos = db.prepare(`
      SELECT s.*, sc.nome as categoria_nome
      FROM servicos s LEFT JOIN servico_categorias sc ON sc.id = s.categoria_id
      ORDER BY sc.nome, s.nome
    `).all();
  }
  res.json({ ok: true, data: servicos });
});

router.get('/:id', (req, res) => {
  const servico = db.prepare(`
    SELECT s.*, sc.nome as categoria_nome
    FROM servicos s LEFT JOIN servico_categorias sc ON sc.id = s.categoria_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!servico) return res.status(404).json({ ok: false, error: 'Servico nao encontrado' });
  res.json({ ok: true, data: servico });
});

router.post('/', (req, res) => {
  const { nome, categoria_id, preco, tempo_min, consome_kit_mao, consome_kit_pe } = req.body;
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
  if (!preco || preco <= 0) return res.status(400).json({ ok: false, error: 'Preco deve ser maior que zero' });

  const result = db.prepare(`
    INSERT INTO servicos (nome, categoria_id, preco, tempo_min, consome_kit_mao, consome_kit_pe)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nome, categoria_id || null, preco, tempo_min || null, consome_kit_mao ? 1 : 0, consome_kit_pe ? 1 : 0);

  const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: servico });
});

router.put('/:id', (req, res) => {
  const { nome, categoria_id, preco, tempo_min, consome_kit_mao, consome_kit_pe } = req.body;
  if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });

  db.prepare(`
    UPDATE servicos SET nome = ?, categoria_id = ?, preco = ?, tempo_min = ?,
    consome_kit_mao = ?, consome_kit_pe = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(nome, categoria_id || null, preco, tempo_min || null, consome_kit_mao ? 1 : 0, consome_kit_pe ? 1 : 0, req.params.id);

  const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: servico });
});

router.patch('/:id/status', (req, res) => {
  const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(req.params.id);
  if (!servico) return res.status(404).json({ ok: false, error: 'Servico nao encontrado' });

  db.prepare(`
    UPDATE servicos SET ativo = ?, updated_at = datetime('now','localtime') WHERE id = ?
  `).run(servico.ativo ? 0 : 1, req.params.id);

  const updated = db.prepare('SELECT * FROM servicos WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: updated });
});

router.delete('/:id', (req, res) => {
  const emUso = db.prepare('SELECT id FROM atendimento_itens WHERE servico_id = ? LIMIT 1').get(req.params.id);
  if (emUso) {
    return res.status(409).json({ ok: false, error: 'Servico possui historico de atendimentos e nao pode ser excluido. Use Desativar.' });
  }
  db.prepare('DELETE FROM servicos WHERE id = ?').run(req.params.id);
  res.json({ ok: true, data: null });
});

export default router;
