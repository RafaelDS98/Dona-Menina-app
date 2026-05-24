import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/categorias', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM servico_categorias ORDER BY nome');
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
    const result = await pool.query('INSERT INTO servico_categorias (nome) VALUES ($1) RETURNING *', [nome]);
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ ok: false, error: 'Categoria ja existe' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { categoria_id } = req.query;
    let result;
    if (categoria_id) {
      result = await pool.query(`
        SELECT s.*, sc.nome as categoria_nome FROM servicos s
        LEFT JOIN servico_categorias sc ON sc.id = s.categoria_id
        WHERE s.categoria_id = $1 ORDER BY s.nome
      `, [categoria_id]);
    } else {
      result = await pool.query(`
        SELECT s.*, sc.nome as categoria_nome FROM servicos s
        LEFT JOIN servico_categorias sc ON sc.id = s.categoria_id
        ORDER BY sc.nome, s.nome
      `);
    }
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, sc.nome as categoria_nome FROM servicos s
      LEFT JOIN servico_categorias sc ON sc.id = s.categoria_id WHERE s.id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Servico nao encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nome, categoria_id, preco, tempo_min, consome_kit_mao, consome_kit_pe } = req.body;
    if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
    if (!preco || preco <= 0) return res.status(400).json({ ok: false, error: 'Preco deve ser maior que zero' });
    const result = await pool.query(`
      INSERT INTO servicos (nome, categoria_id, preco, tempo_min, consome_kit_mao, consome_kit_pe)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [nome, categoria_id || null, preco, tempo_min || null, consome_kit_mao ? 1 : 0, consome_kit_pe ? 1 : 0]);
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nome, categoria_id, preco, tempo_min, consome_kit_mao, consome_kit_pe } = req.body;
    if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
    const result = await pool.query(`
      UPDATE servicos SET nome=$1, categoria_id=$2, preco=$3, tempo_min=$4,
      consome_kit_mao=$5, consome_kit_pe=$6, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS')
      WHERE id=$7 RETURNING *
    `, [nome, categoria_id || null, preco, tempo_min || null, consome_kit_mao ? 1 : 0, consome_kit_pe ? 1 : 0, req.params.id]);
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const s = await pool.query('SELECT * FROM servicos WHERE id = $1', [req.params.id]);
    if (!s.rows[0]) return res.status(404).json({ ok: false, error: 'Servico nao encontrado' });
    const result = await pool.query(
      `UPDATE servicos SET ativo=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2 RETURNING *`,
      [s.rows[0].ativo ? 0 : 1, req.params.id]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const emUso = await pool.query('SELECT id FROM atendimento_itens WHERE servico_id = $1 LIMIT 1', [req.params.id]);
    if (emUso.rows[0]) return res.status(409).json({ ok: false, error: 'Servico possui historico e nao pode ser excluido. Use Desativar.' });
    await pool.query('DELETE FROM servicos WHERE id = $1', [req.params.id]);
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
