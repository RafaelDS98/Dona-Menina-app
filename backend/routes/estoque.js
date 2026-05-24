import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

function calcKitStatus(kit) {
  if (kit.quantidade > kit.alerta_atencao) return 'ok';
  if (kit.quantidade > kit.alerta_urgente) return 'atencao';
  if (kit.quantidade > kit.alerta_critico) return 'urgente';
  return 'critico';
}

router.get('/kits', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estoque_kits');
    res.json({ ok: true, data: result.rows.map(k => ({ ...k, status: calcKitStatus(k) })) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/kits/:tipo', async (req, res) => {
  try {
    const { quantidade } = req.body;
    await pool.query(`UPDATE estoque_kits SET quantidade=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo=$2`, [Number(quantidade), req.params.tipo]);
    const result = await pool.query('SELECT * FROM estoque_kits WHERE tipo=$1', [req.params.tipo]);
    const kit = result.rows[0];
    res.json({ ok: true, data: { ...kit, status: calcKitStatus(kit) } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/kits/:tipo/limites', async (req, res) => {
  try {
    const { alerta_atencao, alerta_urgente, alerta_critico } = req.body;
    await pool.query(`UPDATE estoque_kits SET alerta_atencao=$1, alerta_urgente=$2, alerta_critico=$3, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo=$4`,
      [alerta_atencao, alerta_urgente, alerta_critico, req.params.tipo]);
    const result = await pool.query('SELECT * FROM estoque_kits WHERE tipo=$1', [req.params.tipo]);
    const kit = result.rows[0];
    res.json({ ok: true, data: { ...kit, status: calcKitStatus(kit) } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/lojinha', async (req, res) => {
  try {
    const { alerta } = req.query;
    let result;
    if (alerta === 'true') {
      result = await pool.query('SELECT * FROM estoque_lojinha WHERE quantidade <= alerta_minimo ORDER BY nome');
    } else {
      result = await pool.query('SELECT * FROM estoque_lojinha ORDER BY nome');
    }
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/lojinha/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estoque_lojinha WHERE id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Produto nao encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/lojinha', async (req, res) => {
  try {
    const { nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo } = req.body;
    if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
    if (!preco_venda || preco_venda <= 0) return res.status(400).json({ ok: false, error: 'Preco de venda e obrigatorio' });
    const result = await pool.query(
      'INSERT INTO estoque_lojinha (nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [nome, marca || null, preco_custo || null, preco_venda, quantidade || 0, alerta_minimo || 3]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/lojinha/:id', async (req, res) => {
  try {
    const { nome, marca, preco_custo, preco_venda, alerta_minimo } = req.body;
    const result = await pool.query(
      `UPDATE estoque_lojinha SET nome=$1, marca=$2, preco_custo=$3, preco_venda=$4, alerta_minimo=$5, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$6 RETURNING *`,
      [nome, marca || null, preco_custo || null, preco_venda, alerta_minimo || 3, req.params.id]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/lojinha/:id/estoque', async (req, res) => {
  try {
    const { operacao, valor } = req.body;
    const prod = await pool.query('SELECT * FROM estoque_lojinha WHERE id=$1', [req.params.id]);
    if (!prod.rows[0]) return res.status(404).json({ ok: false, error: 'Produto nao encontrado' });
    let newQty;
    if (operacao === 'set') newQty = Number(valor);
    else if (operacao === 'add') newQty = prod.rows[0].quantidade + Number(valor);
    else if (operacao === 'subtract') newQty = Math.max(0, prod.rows[0].quantidade - Number(valor));
    else return res.status(400).json({ ok: false, error: 'operacao deve ser set, add ou subtract' });
    const result = await pool.query(`UPDATE estoque_lojinha SET quantidade=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2 RETURNING *`, [newQty, req.params.id]);
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/lojinha/:id/status', async (req, res) => {
  try {
    const prod = await pool.query('SELECT * FROM estoque_lojinha WHERE id=$1', [req.params.id]);
    if (!prod.rows[0]) return res.status(404).json({ ok: false, error: 'Produto nao encontrado' });
    const result = await pool.query(`UPDATE estoque_lojinha SET ativo=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2 RETURNING *`, [prod.rows[0].ativo ? 0 : 1, req.params.id]);
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/lojinha/:id', async (req, res) => {
  try {
    const emUso = await pool.query('SELECT id FROM atendimento_itens WHERE produto_id=$1 LIMIT 1', [req.params.id]);
    if (emUso.rows[0]) return res.status(409).json({ ok: false, error: 'Produto possui historico e nao pode ser excluido. Use Desativar.' });
    await pool.query('DELETE FROM estoque_lojinha WHERE id=$1', [req.params.id]);
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/freezer', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estoque_freezer ORDER BY nome');
    res.json({ ok: true, data: result.rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/freezer/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estoque_freezer WHERE id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Item nao encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/freezer', async (req, res) => {
  try {
    const { nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo } = req.body;
    if (!nome) return res.status(400).json({ ok: false, error: 'Nome e obrigatorio' });
    if (!preco_venda || preco_venda <= 0) return res.status(400).json({ ok: false, error: 'Preco de venda e obrigatorio' });
    const result = await pool.query(
      'INSERT INTO estoque_freezer (nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [nome, marca || null, preco_custo || null, preco_venda, quantidade || 0, alerta_minimo || 3]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/freezer/:id', async (req, res) => {
  try {
    const { nome, marca, preco_custo, preco_venda, alerta_minimo } = req.body;
    const result = await pool.query(
      `UPDATE estoque_freezer SET nome=$1, marca=$2, preco_custo=$3, preco_venda=$4, alerta_minimo=$5, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$6 RETURNING *`,
      [nome, marca || null, preco_custo || null, preco_venda, alerta_minimo || 3, req.params.id]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/freezer/:id/estoque', async (req, res) => {
  try {
    const { operacao, valor } = req.body;
    const prod = await pool.query('SELECT * FROM estoque_freezer WHERE id=$1', [req.params.id]);
    if (!prod.rows[0]) return res.status(404).json({ ok: false, error: 'Item nao encontrado' });
    let newQty;
    if (operacao === 'set') newQty = Number(valor);
    else if (operacao === 'add') newQty = prod.rows[0].quantidade + Number(valor);
    else if (operacao === 'subtract') newQty = Math.max(0, prod.rows[0].quantidade - Number(valor));
    else return res.status(400).json({ ok: false, error: 'operacao deve ser set, add ou subtract' });
    const result = await pool.query(`UPDATE estoque_freezer SET quantidade=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2 RETURNING *`, [newQty, req.params.id]);
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.patch('/freezer/:id/status', async (req, res) => {
  try {
    const prod = await pool.query('SELECT * FROM estoque_freezer WHERE id=$1', [req.params.id]);
    if (!prod.rows[0]) return res.status(404).json({ ok: false, error: 'Item nao encontrado' });
    const result = await pool.query(`UPDATE estoque_freezer SET ativo=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2 RETURNING *`, [prod.rows[0].ativo ? 0 : 1, req.params.id]);
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/freezer/:id', async (req, res) => {
  try {
    const emUso = await pool.query('SELECT id FROM atendimento_itens WHERE freezer_id=$1 LIMIT 1', [req.params.id]);
    if (emUso.rows[0]) return res.status(409).json({ ok: false, error: 'Item possui historico e nao pode ser excluido. Use Desativar.' });
    await pool.query('DELETE FROM estoque_freezer WHERE id=$1', [req.params.id]);
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
