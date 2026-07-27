import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { ativas } = req.query;
    let promoResult;
    if (ativas === 'true') {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: process.env.SALAO_TZ || 'America/Belem' });
      promoResult = await pool.query('SELECT * FROM promocoes WHERE ativa=1 AND data_inicio<=$1 AND data_fim>=$2 ORDER BY nome', [hoje, hoje]);
    } else {
      promoResult = await pool.query('SELECT * FROM promocoes ORDER BY data_fim DESC');
    }
    const result = [];
    for (const p of promoResult.rows) {
      const servicos = await pool.query(`
        SELECT s.id, s.nome, s.preco FROM promocao_servicos ps
        JOIN servicos s ON s.id=ps.servico_id WHERE ps.promocao_id=$1
      `, [p.id]);
      result.push({ ...p, servicos: servicos.rows });
    }
    res.json({ ok: true, data: result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const promo = await pool.query('SELECT * FROM promocoes WHERE id=$1', [req.params.id]);
    if (!promo.rows[0]) return res.status(404).json({ ok: false, error: 'Promocao nao encontrada' });
    const servicos = await pool.query(`
      SELECT s.id, s.nome, s.preco FROM promocao_servicos ps
      JOIN servicos s ON s.id=ps.servico_id WHERE ps.promocao_id=$1
    `, [req.params.id]);
    res.json({ ok: true, data: { ...promo.rows[0], servicos: servicos.rows } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  const { nome, descricao, preco, data_inicio, data_fim, servico_ids } = req.body;
  if (!nome || !preco || !data_inicio || !data_fim)
    return res.status(400).json({ ok: false, error: 'nome, preco, data_inicio e data_fim sao obrigatorios' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO promocoes (nome, descricao, preco, data_inicio, data_fim) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [nome, descricao || null, preco, data_inicio, data_fim]
    );
    const id = result.rows[0].id;
    if (servico_ids?.length) {
      for (const sid of servico_ids) {
        await client.query('INSERT INTO promocao_servicos (promocao_id, servico_id) VALUES ($1,$2)', [id, sid]);
      }
    }
    await client.query('COMMIT');
    const promo = await pool.query('SELECT * FROM promocoes WHERE id=$1', [id]);
    res.status(201).json({ ok: true, data: promo.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: e.message });
  } finally { client.release(); }
});

router.put('/:id', async (req, res) => {
  const { nome, descricao, preco, data_inicio, data_fim, ativa, servico_ids } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE promocoes SET nome=$1, descricao=$2, preco=$3, data_inicio=$4, data_fim=$5, ativa=$6 WHERE id=$7',
      [nome, descricao || null, preco, data_inicio, data_fim, ativa !== undefined ? ativa : 1, req.params.id]
    );
    if (servico_ids) {
      await client.query('DELETE FROM promocao_servicos WHERE promocao_id=$1', [req.params.id]);
      for (const sid of servico_ids) {
        await client.query('INSERT INTO promocao_servicos (promocao_id, servico_id) VALUES ($1,$2)', [req.params.id, sid]);
      }
    }
    await client.query('COMMIT');
    const promo = await pool.query('SELECT * FROM promocoes WHERE id=$1', [req.params.id]);
    res.json({ ok: true, data: promo.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: e.message });
  } finally { client.release(); }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM promocoes WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Promocao nao encontrada' });
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
