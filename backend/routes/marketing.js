import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

// GET /api/clientes/para-disparo?filtro=todas|recentes|inativas|aniversariantes
router.get('/disparo', (req, res) => {
  const { filtro = 'todas' } = req.query;
  const hoje = new Date();
  const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

  let query;
  const params = [];

  switch (filtro) {
    case 'recentes': {
      const trintaDias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = `
        SELECT DISTINCT c.id, c.nome, c.telefone, MAX(a.data_hora) as ultima_visita
        FROM clientes c JOIN atendimentos a ON a.cliente_id = c.id
        WHERE c.ativa = 1 AND c.telefone IS NOT NULL AND c.telefone != ''
        AND a.cancelado = 0 AND DATE(a.data_hora) >= ?
        GROUP BY c.id ORDER BY c.nome
      `;
      params.push(trintaDias);
      break;
    }
    case 'inativas': {
      const sessentaDias = new Date(hoje.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = `
        SELECT c.id, c.nome, c.telefone, MAX(a.data_hora) as ultima_visita
        FROM clientes c LEFT JOIN atendimentos a ON a.cliente_id = c.id AND a.cancelado = 0
        WHERE c.ativa = 1 AND c.telefone IS NOT NULL AND c.telefone != ''
        GROUP BY c.id HAVING ultima_visita IS NULL OR DATE(ultima_visita) < ?
        ORDER BY c.nome
      `;
      params.push(sessentaDias);
      break;
    }
    case 'aniversariantes':
      query = `
        SELECT c.id, c.nome, c.telefone, c.data_nascimento,
          (SELECT MAX(a.data_hora) FROM atendimentos a WHERE a.cliente_id = c.id AND a.cancelado = 0) as ultima_visita
        FROM clientes c
        WHERE c.ativa = 1 AND c.telefone IS NOT NULL AND c.telefone != ''
        AND SUBSTR(c.data_nascimento, 6, 2) = ?
        ORDER BY c.nome
      `;
      params.push(mesAtual);
      break;
    default:
      query = `
        SELECT c.id, c.nome, c.telefone,
          (SELECT MAX(a.data_hora) FROM atendimentos a WHERE a.cliente_id = c.id AND a.cancelado = 0) as ultima_visita
        FROM clientes c
        WHERE c.ativa = 1 AND c.telefone IS NOT NULL AND c.telefone != ''
        ORDER BY c.nome
      `;
  }

  const clientes = db.prepare(query).all(...params);

  const result = clientes.map(c => ({
    ...c,
    telefone_limpo: c.telefone ? '55' + c.telefone.replace(/\D/g, '') : null,
  }));

  res.json({ ok: true, data: result });
});

export default router;
