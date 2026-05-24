import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

// GET /api/agendamentos?data=YYYY-MM-DD or ?data_inicio=&data_fim=
router.get('/', (req, res) => {
  const { data, data_inicio, data_fim } = req.query;

  let agendamentos;
  if (data) {
    agendamentos = db.prepare(`
      SELECT ag.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
        col.nome as colaboradora_nome, s.nome as servico_nome, s.tempo_min
      FROM agendamentos ag
      LEFT JOIN clientes c ON c.id = ag.cliente_id
      LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
      LEFT JOIN servicos s ON s.id = ag.servico_id
      WHERE DATE(ag.data_hora) = ?
      ORDER BY ag.data_hora
    `).all(data);
  } else if (data_inicio && data_fim) {
    agendamentos = db.prepare(`
      SELECT ag.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
        col.nome as colaboradora_nome, s.nome as servico_nome, s.tempo_min
      FROM agendamentos ag
      LEFT JOIN clientes c ON c.id = ag.cliente_id
      LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
      LEFT JOIN servicos s ON s.id = ag.servico_id
      WHERE DATE(ag.data_hora) BETWEEN ? AND ?
      ORDER BY ag.data_hora
    `).all(data_inicio, data_fim);
  } else {
    agendamentos = db.prepare(`
      SELECT ag.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
        col.nome as colaboradora_nome, s.nome as servico_nome, s.tempo_min
      FROM agendamentos ag
      LEFT JOIN clientes c ON c.id = ag.cliente_id
      LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
      LEFT JOIN servicos s ON s.id = ag.servico_id
      ORDER BY ag.data_hora DESC LIMIT 50
    `).all();
  }

  res.json({ ok: true, data: agendamentos });
});

router.get('/:id', (req, res) => {
  const ag = db.prepare(`
    SELECT ag.*, c.nome as cliente_nome, c.telefone as cliente_telefone,
      col.nome as colaboradora_nome, s.nome as servico_nome, s.tempo_min, s.preco as servico_preco
    FROM agendamentos ag
    LEFT JOIN clientes c ON c.id = ag.cliente_id
    LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
    LEFT JOIN servicos s ON s.id = ag.servico_id
    WHERE ag.id = ?
  `).get(req.params.id);
  if (!ag) return res.status(404).json({ ok: false, error: 'Agendamento nao encontrado' });
  res.json({ ok: true, data: ag });
});

router.post('/', (req, res) => {
  const { cliente_id, colaboradora_id, servico_id, data_hora, observacao } = req.body;
  if (!cliente_id || !data_hora) {
    return res.status(400).json({ ok: false, error: 'cliente_id e data_hora sao obrigatorios' });
  }

  // Conflict detection per collaborator
  if (colaboradora_id && servico_id) {
    const servico = db.prepare('SELECT tempo_min FROM servicos WHERE id = ?').get(servico_id);
    const duracao = servico?.tempo_min || 60;
    const inicio = new Date(data_hora);
    const fim = new Date(inicio.getTime() + duracao * 60000);

    const conflitos = db.prepare(`
      SELECT ag.id FROM agendamentos ag
      LEFT JOIN servicos s ON s.id = ag.servico_id
      WHERE ag.colaboradora_id = ? AND ag.status NOT IN ('cancelado')
      AND datetime(ag.data_hora) < ? AND datetime(ag.data_hora, '+' || COALESCE(s.tempo_min, 60) || ' minutes') > ?
    `).all(colaboradora_id, fim.toISOString(), inicio.toISOString());

    if (conflitos.length > 0) {
      return res.status(400).json({ ok: false, error: 'Conflito de horario com outro agendamento desta colaboradora' });
    }
  }

  const result = db.prepare(`
    INSERT INTO agendamentos (cliente_id, colaboradora_id, servico_id, data_hora, observacao)
    VALUES (?, ?, ?, ?, ?)
  `).run(cliente_id, colaboradora_id || null, servico_id || null, data_hora, observacao || null);

  const ag = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, data: ag });
});

router.put('/:id', (req, res) => {
  const { cliente_id, colaboradora_id, servico_id, data_hora, observacao } = req.body;

  db.prepare(`
    UPDATE agendamentos SET cliente_id = ?, colaboradora_id = ?, servico_id = ?,
    data_hora = ?, observacao = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(cliente_id, colaboradora_id || null, servico_id || null, data_hora, observacao || null, req.params.id);

  const ag = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: ag });
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['agendado', 'confirmado', 'concluido', 'faltou', 'cancelado'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ ok: false, error: `Status invalido. Usar: ${validStatuses.join(', ')}` });
  }

  db.prepare(`
    UPDATE agendamentos SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?
  `).run(status, req.params.id);

  const ag = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(req.params.id);
  res.json({ ok: true, data: ag });
});

export default router;
