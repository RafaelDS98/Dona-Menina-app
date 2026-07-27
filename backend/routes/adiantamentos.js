import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

/*
 * ADIANTAMENTOS — sinais pagos antecipadamente pelas clientes.
 * O valor entra no caixa no dia do registro (aparece no fechamento) e vira
 * abatimento 'pago_antecipado' quando aplicado à comanda (via POST /atendimentos
 * com adiantamento_ids). Status: aberto | usado | devolvido.
 */

const FORMAS_VALIDAS = ['pix', 'credito', 'debito', 'especie'];

function valorValido(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

router.get('/', async (req, res) => {
  try {
    const { cliente_id, status, data_inicio, data_fim } = req.query;
    const cond = [];
    const params = [];
    let i = 1;
    if (cliente_id) { cond.push(`a.cliente_id = $${i++}`); params.push(cliente_id); }
    if (status) { cond.push(`a.status = $${i++}`); params.push(status); }
    if (data_inicio && data_fim) { cond.push(`a.data BETWEEN $${i++} AND $${i++}`); params.push(data_inicio, data_fim); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const result = await pool.query(`
      SELECT a.*, c.nome as cliente_nome
      FROM adiantamentos a LEFT JOIN clientes c ON c.id = a.cliente_id
      ${where} ORDER BY a.data DESC, a.id DESC
    `, params);
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { cliente_id, valor, forma, data, observacao } = req.body || {};
    if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id e obrigatorio' });
    if (!valorValido(valor)) return res.status(400).json({ ok: false, error: 'Valor invalido — informe um numero maior que zero' });
    if (!FORMAS_VALIDAS.includes(forma)) return res.status(400).json({ ok: false, error: `Forma invalida. Use: ${FORMAS_VALIDAS.join(', ')}` });
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ ok: false, error: 'data e obrigatoria (YYYY-MM-DD)' });

    const cli = await pool.query('SELECT id FROM clientes WHERE id = $1 AND ativa = 1', [cliente_id]);
    if (!cli.rows[0]) return res.status(404).json({ ok: false, error: 'Cliente nao encontrada' });

    const valorFinal = Math.round(Number(valor) * 100) / 100;
    const result = await pool.query(
      `INSERT INTO adiantamentos (cliente_id, valor, forma, data, observacao) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [cliente_id, valorFinal, forma, data, observacao || null]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Marca um adiantamento aberto como devolvido (cliente desistiu, valor devolvido)
router.put('/:id/devolver', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE adiantamentos SET status='devolvido' WHERE id=$1 AND status='aberto' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Adiantamento nao encontrado ou ja utilizado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Exclui apenas adiantamentos ainda abertos (lancamento errado)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM adiantamentos WHERE id=$1 AND status='aberto' RETURNING id`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Adiantamento nao encontrado ou ja utilizado (nao pode ser excluido)' });
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
