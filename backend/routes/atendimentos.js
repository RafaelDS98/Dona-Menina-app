import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();
const FORMAS_PAGAMENTO = ['pix', 'credito', 'debito', 'especie', 'taxa', 'desconto_taxa', 'pago_antecipado'];
const ABATIMENTOS = ['desconto_taxa', 'pago_antecipado'];

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const numOk = (v) => Number.isFinite(Number(v));

// Data de "hoje" no fuso do salao (evita virada de dia as 21h com servidor em UTC)
function hojeLocal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: process.env.SALAO_TZ || 'America/Belem' });
}

// Valida itens e pagamentos: numeros finitos, formas conhecidas, abatimento <= itens
function validarComanda({ itens, pagamentos, cortesia }) {
  for (const i of itens) {
    if (!numOk(i.preco_cobrado) || Number(i.preco_cobrado) < 0)
      return `Preco invalido no item "${i.descricao || ''}" — use numero com ponto (ex.: 60.00)`;
  }
  const somaItens = round2(itens.reduce((s, i) => s + Number(i.preco_cobrado), 0));
  if (cortesia) return null;

  if (!pagamentos?.length) return 'Pelo menos 1 pagamento e obrigatorio';
  for (const pag of pagamentos) {
    if (!FORMAS_PAGAMENTO.includes(pag.forma)) return `Forma invalida: ${pag.forma}`;
    if (!numOk(pag.valor) || Number(pag.valor) <= 0) return `Valor invalido no pagamento (${pag.forma})`;
  }
  const somaDesconto = round2(pagamentos.filter(p => ABATIMENTOS.includes(p.forma)).reduce((s, p) => s + Number(p.valor), 0));
  const somaPagamentos = round2(pagamentos.filter(p => !ABATIMENTOS.includes(p.forma)).reduce((s, p) => s + Number(p.valor), 0));
  if (somaDesconto > somaItens + 0.01)
    return `Abatimentos (${somaDesconto.toFixed(2)}) maiores que o total dos itens (${somaItens.toFixed(2)})`;
  const totalEsperado = round2(somaItens - somaDesconto);
  if (Math.abs(totalEsperado - somaPagamentos) > 0.01)
    return `Soma dos pagamentos (${somaPagamentos.toFixed(2)}) diferente do total (${totalEsperado.toFixed(2)})`;
  return null;
}

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
  const { cliente_id, data_hora, observacao, pagamentos, itens, agendamento_id, cortesia, adiantamento_ids } = req.body;
  if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id e obrigatorio' });
  if (!data_hora) return res.status(400).json({ ok: false, error: 'data_hora e obrigatorio' });
  if (!itens?.length) return res.status(400).json({ ok: false, error: 'Pelo menos 1 item e obrigatorio' });

  const erro = validarComanda({ itens, pagamentos, cortesia });
  if (erro) return res.status(400).json({ ok: false, error: erro });

  const somaItens = round2(itens.reduce((s, i) => s + Number(i.preco_cobrado), 0));
  const somaAntecipado = cortesia ? 0 : round2((pagamentos || []).filter(p => p.forma === 'pago_antecipado').reduce((s, p) => s + Number(p.valor), 0));
  const idsAdiantamento = Array.isArray(adiantamento_ids) ? adiantamento_ids.map(Number).filter(Number.isFinite) : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Antecipado exige vinculo com adiantamentos abertos da propria cliente
    if (somaAntecipado > 0) {
      if (!idsAdiantamento.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Pagamento antecipado sem vinculo: registre o sinal em Financeiro > Adiantamentos e aplique-o na comanda' });
      }
      const ads = await client.query(
        `SELECT id, valor FROM adiantamentos WHERE id = ANY($1) AND cliente_id = $2 AND status = 'aberto' FOR UPDATE`,
        [idsAdiantamento, cliente_id]
      );
      if (ads.rows.length !== idsAdiantamento.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Adiantamento invalido, ja utilizado ou de outra cliente' });
      }
      const somaAds = round2(ads.rows.reduce((s, a) => s + Number(a.valor), 0));
      if (Math.abs(somaAds - somaAntecipado) > 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: `Valor antecipado (${somaAntecipado.toFixed(2)}) diferente dos adiantamentos aplicados (${somaAds.toFixed(2)})` });
      }
    } else if (idsAdiantamento.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Adiantamentos aplicados sem a linha de pagamento antecipado correspondente' });
    }

    const atdResult = await client.query(
      'INSERT INTO atendimentos (cliente_id, data_hora, valor_total, observacao, cortesia) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [cliente_id, data_hora, cortesia ? 0 : somaItens, observacao || null, cortesia ? 1 : 0]
    );
    const atendimentoId = atdResult.rows[0].id;

    if (idsAdiantamento.length) {
      await client.query(
        `UPDATE adiantamentos SET status='usado', atendimento_id=$1 WHERE id = ANY($2)`,
        [atendimentoId, idsAdiantamento]
      );
    }

    if (!cortesia && pagamentos?.length) {
      for (const pag of pagamentos) {
        await client.query('INSERT INTO atendimento_pagamentos (atendimento_id, forma, valor) VALUES ($1, $2, $3)', [atendimentoId, pag.forma, round2(pag.valor)]);
      }
    }

    for (const item of itens) {
      const itemResult = await client.query(`
        INSERT INTO atendimento_itens (atendimento_id, tipo, servico_id, produto_id, freezer_id, promocao_id, descricao, preco_cobrado, observacao, cortesia)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
      `, [atendimentoId, item.tipo, item.servico_id || null, item.produto_id || null, item.freezer_id || null, item.promocao_id || null, item.descricao || null, round2(item.preco_cobrado), item.observacao || null, cortesia ? 1 : 0]);
      const itemId = itemResult.rows[0].id;

      if (item.colaboradoras) {
        for (const colab of item.colaboradoras) {
          const colabData = await client.query('SELECT comissao_padrao FROM colaboradoras WHERE id = $1', [colab.colaboradora_id]);
          const comissaoPadrao = colabData.rows[0]?.comissao_padrao || 0;
          // Comissão calculada sobre preço real mesmo em cortesia
          const valorComissao = item.preco_cobrado * (comissaoPadrao / 100) * (colab.percentual_comissao / 100);
          await client.query(
            'INSERT INTO atendimento_item_colaboradoras (atendimento_item_id, colaboradora_id, percentual_comissao, valor_comissao) VALUES ($1, $2, $3, $4)',
            [itemId, colab.colaboradora_id, colab.percentual_comissao, round2(valorComissao)]
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
  const { cliente_id, data_hora, observacao, pagamentos, itens } = req.body;
  const atdResult = await pool.query('SELECT * FROM atendimentos WHERE id = $1 AND cancelado = 0', [req.params.id]);
  if (!atdResult.rows[0]) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado' });
  const atd = atdResult.rows[0];
  if (!cliente_id || !data_hora || !itens?.length) return res.status(400).json({ ok: false, error: 'Dados incompletos' });

  // Preserva cortesia do banco quando o frontend nao envia o campo
  const cortesia = req.body.cortesia === undefined ? Number(atd.cortesia) === 1 : !!req.body.cortesia;

  const erro = validarComanda({ itens, pagamentos, cortesia });
  if (erro) return res.status(400).json({ ok: false, error: erro });

  const somaItens = round2(itens.reduce((s, i) => s + Number(i.preco_cobrado), 0));

  // Antecipado na edicao: nao pode EXCEDER o que ja estava vinculado/lancado nesta comanda
  const novoAntecipado = cortesia ? 0 : round2((pagamentos || []).filter(p => p.forma === 'pago_antecipado').reduce((s, p) => s + Number(p.valor), 0));
  if (novoAntecipado > 0) {
    const prev = await pool.query(`SELECT COALESCE(SUM(valor),0) as v FROM atendimento_pagamentos WHERE atendimento_id=$1 AND forma='pago_antecipado'`, [atd.id]);
    const vinc = await pool.query(`SELECT COALESCE(SUM(valor),0) as v FROM adiantamentos WHERE atendimento_id=$1 AND status='usado'`, [atd.id]);
    const limite = Math.max(Number(prev.rows[0].v), Number(vinc.rows[0].v));
    if (novoAntecipado > limite + 0.01)
      return res.status(400).json({ ok: false, error: `Pagamento antecipado (${novoAntecipado.toFixed(2)}) maior que o adiantamento vinculado a esta comanda (${limite.toFixed(2)}). Registre novos sinais em Financeiro > Adiantamentos.` });
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
        await client.query('INSERT INTO atendimento_pagamentos (atendimento_id, forma, valor) VALUES ($1, $2, $3)', [atd.id, pag.forma, round2(pag.valor)]);
      }
    }

    for (const item of itens) {
      const itemResult = await client.query(`
        INSERT INTO atendimento_itens (atendimento_id, tipo, servico_id, produto_id, freezer_id, promocao_id, descricao, preco_cobrado, observacao, cortesia)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
      `, [atd.id, item.tipo, item.servico_id || null, item.produto_id || null, item.freezer_id || null, item.promocao_id || null, item.descricao || null, round2(item.preco_cobrado), item.observacao || null, cortesia ? 1 : 0]);
      const itemId = itemResult.rows[0].id;
      if (item.colaboradoras) {
        for (const colab of item.colaboradoras) {
          const cd = await client.query('SELECT comissao_padrao FROM colaboradoras WHERE id = $1', [colab.colaboradora_id]);
          const valorComissao = item.preco_cobrado * ((cd.rows[0]?.comissao_padrao || 0) / 100) * (colab.percentual_comissao / 100);
          await client.query('INSERT INTO atendimento_item_colaboradoras (atendimento_item_id, colaboradora_id, percentual_comissao, valor_comissao) VALUES ($1,$2,$3,$4)',
            [itemId, colab.colaboradora_id, colab.percentual_comissao, round2(valorComissao)]);
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
  // cancelado=0 no WHERE: cancelar duas vezes nao devolve estoque em dobro
  const atdResult = await pool.query('SELECT * FROM atendimentos WHERE id = $1 AND cancelado = 0', [req.params.id]);
  if (!atdResult.rows[0]) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado ou ja cancelado' });
  const atd = atdResult.rows[0];
  if (atd.data_hora.split('T')[0] !== hojeLocal())
    return res.status(400).json({ ok: false, error: 'Cancelamento permitido apenas para atendimentos do dia atual' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Garante exclusividade do cancelamento (protege contra duplo clique simultaneo)
    const lock = await client.query('UPDATE atendimentos SET cancelado=1 WHERE id=$1 AND cancelado=0 RETURNING id', [atd.id]);
    if (!lock.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Atendimento ja cancelado' });
    }
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
    // Reabre adiantamentos que estavam vinculados a esta comanda
    await client.query(`UPDATE adiantamentos SET status='aberto', atendimento_id=NULL WHERE atendimento_id=$1 AND status='usado'`, [atd.id]);
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
