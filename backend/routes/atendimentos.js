import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();
const FORMAS_PAGAMENTO = ['pix', 'credito', 'debito', 'especie', 'taxa', 'desconto_taxa', 'pago_antecipado'];

router.get('/', async (req, res) => {
  try {
    const { data, cliente_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE a.cancelado = 0';
    const params = [];
    let idx = 1;
    if (data) { where += ` AND DATE(a.data_hora) = $${idx++}`; params.push(data); }
    if (cliente_id) { where += ` AND a.cliente_id = $${idx++}`; params.push(cliente_id); }

    const cntResult = await pool.query(`SELECT COUNT(*) as cnt FROM atendimentos a ${where}`, params);
    const total = parseInt(cntResult.rows[0].cnt);

    const atdResult = await pool.query(`
      SELECT a.*, c.nome as cliente_nome FROM atendimentos a
      LEFT JOIN clientes c ON c.id = a.cliente_id
      ${where} ORDER BY a.data_hora DESC LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, Number(limit), offset]);

    const items = [];
    for (const a of atdResult.rows) {
      const itensResult = await pool.query('SELECT * FROM atendimento_itens WHERE atendimento_id = $1', [a.id]);
      const itens = [];
      for (const item of itensResult.rows) {
        const colabResult = await pool.query(`
          SELECT aic.*, col.nome as colaboradora_nome FROM atendimento_item_colaboradoras aic
          LEFT JOIN colaboradoras col ON col.id = aic.colaboradora_id WHERE aic.atendimento_item_id = $1
        `, [item.id]);
        itens.push({ ...item, colaboradoras: colabResult.rows });
      }
      const pagResult = await pool.query('SELECT * FROM atendimento_pagamentos WHERE atendimento_id = $1', [a.id]);
      items.push({ ...a, itens, pagamentos: pagResult.rows });
    }
    res.json({ ok: true, data: { items, total, page: Number(page), limit: Number(limit) } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const atdResult = await pool.query(`
      SELECT a.*, c.nome as cliente_nome FROM atendimentos a
      LEFT JOIN clientes c ON c.id = a.cliente_id WHERE a.id = $1
    `, [req.params.id]);
    if (!atdResult.rows[0]) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado' });
    const atd = atdResult.rows[0];
    const itensResult = await pool.query('SELECT * FROM atendimento_itens WHERE atendimento_id = $1', [atd.id]);
    const itens = [];
    for (const item of itensResult.rows) {
      const colabResult = await pool.query(`
        SELECT aic.*, col.nome as colaboradora_nome FROM atendimento_item_colaboradoras aic
        LEFT JOIN colaboradoras col ON col.id = aic.colaboradora_id WHERE aic.atendimento_item_id = $1
      `, [item.id]);
      itens.push({ ...item, colaboradoras: colabResult.rows });
    }
    const pagResult = await pool.query('SELECT * FROM atendimento_pagamentos WHERE atendimento_id = $1', [atd.id]);
    res.json({ ok: true, data: { ...atd, itens, pagamentos: pagResult.rows } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  const { cliente_id, data_hora, observacao, pagamentos, itens, agendamento_id, cortesia } = req.body;
  if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id e obrigatorio' });
  if (!data_hora) return res.status(400).json({ ok: false, error: 'data_hora e obrigatorio' });
  if (!itens?.length) return res.status(400).json({ ok: false, error: 'Pelo menos 1 item e obrigatorio' });

  // Cortesia: não valida pagamentos, total cobrado = 0
  if (!cortesia) {
    if (!pagamentos?.length) return res.status(400).json({ ok: false, error: 'Pelo menos 1 pagamento e obrigatorio' });
    for (const pag of pagamentos) {
      if (!FORMAS_PAGAMENTO.includes(pag.forma)) return res.status(400).json({ ok: false, error: `Forma invalida: ${pag.forma}` });
    }
    const somaItens = itens.reduce((s, i) => s + Number(i.preco_cobrado), 0);
    const somaDesconto = (pagamentos || []).filter(p => p.forma === 'desconto_taxa' || p.forma === 'pago_antecipado').reduce((s, p) => s + Number(p.valor), 0);
    const somaPagamentos = (pagamentos || []).filter(p => p.forma !== 'desconto_taxa' && p.forma !== 'pago_antecipado').reduce((s, p) => s + Number(p.valor), 0);
    const totalEsperado = somaItens - somaDesconto;
    if (Math.abs(totalEsperado - somaPagamentos) > 0.01)
      return res.status(400).json({ ok: false, error: `Soma dos pagamentos (${somaPagamentos.toFixed(2)}) diferente do total (${totalEsperado.toFixed(2)})` });
  }

  const somaItens = itens.reduce((s, i) => s + Number(i.preco_cobrado), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atdResult = await client.query(
      'INSERT INTO atendimentos (cliente_id, data_hora, valor_total, observacao, cortesia) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [cliente_id, data_hora, cortesia ? 0 : somaItens, observacao || null, cortesia ? 1 : 0]
    );
    const atendimentoId = atdResult.rows[0].id;

    if (!cortesia && pagamentos?.length) {
      for (const pag of pagamentos) {
        await client.query('INSERT INTO atendimento_pagamentos (atendimento_id, forma, valor) VALUES ($1, $2, $3)', [atendimentoId, pag.forma, pag.valor]);
      }
    }

    for (const item of itens) {
      const itemResult = await client.query(`
        INSERT INTO atendimento_itens (atendimento_id, tipo, servico_id, produto_id, freezer_id, promocao_id, descricao, preco_cobrado, observacao, cortesia)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
      `, [atendimentoId, item.tipo, item.servico_id || null, item.produto_id || null, item.freezer_id || null, item.promocao_id || null, item.descricao || null, item.preco_cobrado, item.observacao || null, cortesia ? 1 : 0]);
      const itemId = itemResult.rows[0].id;

      if (item.colaboradoras) {
        for (const colab of item.colaboradoras) {
          const colabData = await client.query('SELECT comissao_padrao FROM colaboradoras WHERE id = $1', [colab.colaboradora_id]);
          const comissaoPadrao = colabData.rows[0]?.comissao_padrao || 0;
          // Comissão calculada sobre preço real mesmo em cortesia
          const valorComissao = item.preco_cobrado * (comissaoPadrao / 100) * (colab.percentual_comissao / 100);
          await client.query(
            'INSERT INTO atendimento_item_colaboradoras (atendimento_item_id, colaboradora_id, percentual_comissao, valor_comissao) VALUES ($1, $2, $3, $4)',
            [itemId, colab.colaboradora_id, colab.percentual_comissao, Math.round(valorComissao * 100) / 100]
          );
        }
      }

      if (item.tipo === 'servico' && item.servico_id) {
        const sv = await client.query('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = $1', [item.servico_id]);
        if (sv.rows[0]?.consome_kit_mao) await client.query(`UPDATE estoque_kits SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='mao'`);
        if (sv.rows[0]?.consome_kit_pe) await client.query(`UPDATE estoque_kits SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='pe'`);
      }
      if (item.tipo === 'produto' && item.produto_id) await client.query(`UPDATE estoque_lojinha SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [item.produto_id]);
      if (item.tipo === 'freezer' && item.freezer_id) await client.query(`UPDATE estoque_freezer SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [item.freezer_id]);
    }

    if (agendamento_id) {
      await client.query(`UPDATE agendamentos SET status='concluido', atendimento_id=$1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2`, [atendimentoId, agendamento_id]);
    }

    await client.query('COMMIT');
    const created = await pool.query('SELECT * FROM atendimentos WHERE id = $1', [atendimentoId]);
    res.status(201).json({ ok: true, data: created.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { cliente_id, data_hora, observacao, pagamentos, itens, cortesia } = req.body;
  const atdResult = await pool.query('SELECT * FROM atendimentos WHERE id = $1 AND cancelado = 0', [req.params.id]);
  if (!atdResult.rows[0]) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado' });
  const atd = atdResult.rows[0];
  if (!cliente_id || !data_hora || !itens?.length) return res.status(400).json({ ok: false, error: 'Dados incompletos' });

  const somaItens = itens.reduce((s, i) => s + Number(i.preco_cobrado), 0);

  if (!cortesia) {
    if (!pagamentos?.length) return res.status(400).json({ ok: false, error: 'Pelo menos 1 pagamento e obrigatorio' });
    const somaDesconto = pagamentos.filter(p => p.forma === 'desconto_taxa' || p.forma === 'pago_antecipado').reduce((s, p) => s + Number(p.valor), 0);
    const somaPagamentos = pagamentos.filter(p => p.forma !== 'desconto_taxa' && p.forma !== 'pago_antecipado').reduce((s, p) => s + Number(p.valor), 0);
    if (Math.abs((somaItens - somaDesconto) - somaPagamentos) > 0.01)
      return res.status(400).json({ ok: false, error: 'Soma dos pagamentos diferente do total' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itensAntigos = await client.query('SELECT * FROM atendimento_itens WHERE atendimento_id = $1', [atd.id]);
    for (const item of itensAntigos.rows) {
      if (item.tipo === 'servico' && item.servico_id) {
        const sv = await client.query('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = $1', [item.servico_id]);
        if (sv.rows[0]?.consome_kit_mao) await client.query(`UPDATE estoque_kits SET quantidade=quantidade+1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='mao'`);
        if (sv.rows[0]?.consome_kit_pe) await client.query(`UPDATE estoque_kits SET quantidade=quantidade+1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='pe'`);
      }
      if (item.tipo === 'produto' && item.produto_id) await client.query(`UPDATE estoque_lojinha SET quantidade=quantidade+1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [item.produto_id]);
      if (item.tipo === 'freezer' && item.freezer_id) await client.query(`UPDATE estoque_freezer SET quantidade=quantidade+1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [item.freezer_id]);
    }
    await client.query('DELETE FROM atendimento_pagamentos WHERE atendimento_id = $1', [atd.id]);
    await client.query('DELETE FROM atendimento_itens WHERE atendimento_id = $1', [atd.id]);
    await client.query('UPDATE atendimentos SET cliente_id=$1, data_hora=$2, valor_total=$3, observacao=$4, cortesia=$5 WHERE id=$6',
      [cliente_id, data_hora, cortesia ? 0 : somaItens, observacao || null, cortesia ? 1 : 0, atd.id]);

    if (!cortesia && pagamentos?.length) {
      for (const pag of pagamentos) {
        await client.query('INSERT INTO atendimento_pagamentos (atendimento_id, forma, valor) VALUES ($1, $2, $3)', [atd.id, pag.forma, pag.valor]);
      }
    }

    for (const item of itens) {
      const itemResult = await client.query(`
        INSERT INTO atendimento_itens (atendimento_id, tipo, servico_id, produto_id, freezer_id, promocao_id, descricao, preco_cobrado, observacao, cortesia)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
      `, [atd.id, item.tipo, item.servico_id || null, item.produto_id || null, item.freezer_id || null, item.promocao_id || null, item.descricao || null, item.preco_cobrado, item.observacao || null, cortesia ? 1 : 0]);
      const itemId = itemResult.rows[0].id;
      if (item.colaboradoras) {
        for (const colab of item.colaboradoras) {
          const cd = await client.query('SELECT comissao_padrao FROM colaboradoras WHERE id = $1', [colab.colaboradora_id]);
          const valorComissao = item.preco_cobrado * ((cd.rows[0]?.comissao_padrao || 0) / 100) * (colab.percentual_comissao / 100);
          await client.query('INSERT INTO atendimento_item_colaboradoras (atendimento_item_id, colaboradora_id, percentual_comissao, valor_comissao) VALUES ($1,$2,$3,$4)',
            [itemId, colab.colaboradora_id, colab.percentual_comissao, Math.round(valorComissao * 100) / 100]);
        }
      }
      if (item.tipo === 'servico' && item.servico_id) {
        const sv = await client.query('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = $1', [item.servico_id]);
        if (sv.rows[0]?.consome_kit_mao) await client.query(`UPDATE estoque_kits SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='mao'`);
        if (sv.rows[0]?.consome_kit_pe) await client.query(`UPDATE estoque_kits SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='pe'`);
      }
      if (item.tipo === 'produto' && item.produto_id) await client.query(`UPDATE estoque_lojinha SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [item.produto_id]);
      if (item.tipo === 'freezer' && item.freezer_id) await client.query(`UPDATE estoque_freezer SET quantidade=GREATEST(0,quantidade-1), updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1`, [item.freezer_id]);
    }
    await client.query('COMMIT');
    const updated = await pool.query('SELECT a.*, c.nome as cliente_nome FROM atendimentos a LEFT JOIN clientes c ON c.id=a.cliente_id WHERE a.id=$1', [atd.id]);
    res.json({ ok: true, data: updated.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const atdResult = await pool.query('SELECT * FROM atendimentos WHERE id = $1', [req.params.id]);
  if (!atdResult.rows[0]) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado' });
  const atd = atdResult.rows[0];
  const agora = new Date();
  const today = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  if (atd.data_hora.split('T')[0] !== today)
    return res.status(400).json({ ok: false, error: 'Cancelamento permitido apenas para atendimentos do dia atual' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itens = await client.query('SELECT * FROM atendimento_itens WHERE atendimento_id = $1', [atd.id]);
    for (const item of itens.rows) {
      if (item.tipo === 'servico' && item.servico_id) {
        const sv = await client.query('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = $1', [item.servico_id]);
        if (sv.rows[0]?.consome_kit_mao) await client.query(`UPDATE estoque_kits SET quantidade=quantidade+1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='mao'`);
        if (sv.rows[0]?.consome_kit_pe) await client.query(`UPDATE estoque_kits SET quantidade=quantidade+1, updated_at=TO_CHAR(NOW(),'YYYY-MM-DD HH24:MI:SS') WHERE tipo='pe'`);
      }
      if (item.tipo === 'produto' && item.produto_id) await client.query(`UPDATE estoque_lojinha SET quantidade=quantidade+1 WHERE id=$1`, [item.produto_id]);
      if (item.tipo === 'freezer' && item.freezer_id) await client.query(`UPDATE estoque_freezer SET quantidade=quantidade+1 WHERE id=$1`, [item.freezer_id]);
    }
    await client.query('UPDATE atendimentos SET cancelado=1 WHERE id=$1', [atd.id]);
    await client.query('COMMIT');
    res.json({ ok: true, data: null });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

export default router;

