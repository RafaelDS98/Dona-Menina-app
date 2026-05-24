import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM colaboradoras ORDER BY ativa DESC, nome');
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM colaboradoras WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nome, funcao, comissao_padrao } = req.body;
    if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
    const comissao = Number(comissao_padrao);
    if (isNaN(comissao) || comissao < 0 || comissao > 100)
      return res.status(400).json({ ok: false, error: 'Comissao deve ser entre 0 e 100' });
    const result = await pool.query(
      'INSERT INTO colaboradoras (nome, funcao, comissao_padrao) VALUES ($1, $2, $3) RETURNING *',
      [nome, funcao || null, comissao]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nome, funcao, comissao_padrao } = req.body;
    if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
    const result = await pool.query(
      `UPDATE colaboradoras SET nome=$1, funcao=$2, comissao_padrao=$3,
       updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$4 RETURNING *`,
      [nome, funcao || null, Number(comissao_padrao), req.params.id]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const colab = await pool.query('SELECT * FROM colaboradoras WHERE id = $1', [req.params.id]);
    if (!colab.rows[0]) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });
    const result = await pool.query(
      `UPDATE colaboradoras SET ativa=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2 RETURNING *`,
      [colab.rows[0].ativa ? 0 : 1, req.params.id]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const colab = await pool.query('SELECT * FROM colaboradoras WHERE id = $1', [req.params.id]);
    if (!colab.rows[0]) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });
    const hist = await pool.query('SELECT COUNT(*) as cnt FROM atendimento_item_colaboradoras WHERE colaboradora_id = $1', [req.params.id]);
    if (parseInt(hist.rows[0].cnt) > 0) {
      await pool.query(`UPDATE colaboradoras SET ativa=0, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [req.params.id]);
      return res.json({ ok: true, data: { desativada: true }, message: 'Colaboradora desativada pois possui historico' });
    }
    await pool.query('DELETE FROM colaboradoras WHERE id = $1', [req.params.id]);
    res.json({ ok: true, data: { excluida: true } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
