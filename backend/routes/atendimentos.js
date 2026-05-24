import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

const FORMAS_PAGAMENTO = ['pix', 'credito', 'debito', 'especie', 'taxa', 'desconto_taxa'];

// GET /api/atendimentos
router.get('/', (req, res) => {
  const { data, cliente_id, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE a.cancelado = 0';
  const params = [];

  if (data) {
    where += ' AND DATE(a.data_hora) = ?';
    params.push(data);
  }
  if (cliente_id) {
    where += ' AND a.cliente_id = ?';
    params.push(cliente_id);
  }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM atendimentos a ${where}`).get(...params).cnt;
  const atendimentos = db.prepare(`
    SELECT a.*, c.nome as cliente_nome
    FROM atendimentos a LEFT JOIN clientes c ON c.id = a.cliente_id
    ${where} ORDER BY a.data_hora DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  // Enriquecer cada atendimento com itens e pagamentos (evita N chamadas paralelas do frontend)
  const stmtItens = db.prepare('SELECT * FROM atendimento_itens WHERE atendimento_id = ?');
  const stmtColabs = db.prepare(`
    SELECT aic.*, col.nome as colaboradora_nome
    FROM atendimento_item_colaboradoras aic
    LEFT JOIN colaboradoras col ON col.id = aic.colaboradora_id
    WHERE aic.atendimento_item_id = ?
  `);
  const stmtPagamentos = db.prepare('SELECT * FROM atendimento_pagamentos WHERE atendimento_id = ?');

  const items = atendimentos.map(a => {
    const itens = stmtItens.all(a.id).map(item => ({
      ...item,
      colaboradoras: stmtColabs.all(item.id)
    }));
    const pagamentos = stmtPagamentos.all(a.id);
    return { ...a, itens, pagamentos };
  });

  res.json({ ok: true, data: { items, total, page: Number(page), limit: Number(limit) } });
});

// GET /api/atendimentos/:id
router.get('/:id', (req, res) => {
  const atd = db.prepare(`
    SELECT a.*, c.nome as cliente_nome FROM atendimentos a
    LEFT JOIN clientes c ON c.id = a.cliente_id WHERE a.id = ?
  `).get(req.params.id);
  if (!atd) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado' });

  const itens = db.prepare('SELECT * FROM atendimento_itens WHERE atendimento_id = ?').all(atd.id);
  for (const item of itens) {
    item.colaboradoras = db.prepare(`
      SELECT aic.*, col.nome as colaboradora_nome
      FROM atendimento_item_colaboradoras aic
      LEFT JOIN colaboradoras col ON col.id = aic.colaboradora_id
      WHERE aic.atendimento_item_id = ?
    `).all(item.id);
  }

  const pagamentos = db.prepare('SELECT * FROM atendimento_pagamentos WHERE atendimento_id = ?').all(atd.id);

  res.json({ ok: true, data: { ...atd, itens, pagamentos } });
});

// POST /api/atendimentos — criar e fechar atendimento (transacao atomica)
router.post('/', (req, res) => {
  const { cliente_id, data_hora, observacao, pagamentos, itens, agendamento_id } = req.body;

  // Validacoes
  if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id e obrigatorio' });
  if (!data_hora) return res.status(400).json({ ok: false, error: 'data_hora e obrigatorio' });
  if (!pagamentos || pagamentos.length === 0) return res.status(400).json({ ok: false, error: 'Pelo menos 1 pagamento e obrigatorio' });
  if (!itens || itens.length === 0) return res.status(400).json({ ok: false, error: 'Pelo menos 1 item e obrigatorio' });

  const clienteExists = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
  if (!clienteExists) return res.status(400).json({ ok: false, error: 'Cliente nao encontrada' });

  // Validate payment forms
  for (const pag of pagamentos) {
    if (!FORMAS_PAGAMENTO.includes(pag.forma)) {
      return res.status(400).json({ ok: false, error: `Forma de pagamento invalida: ${pag.forma}` });
    }
  }

  // Validate payment sum matches items sum
  // desconto_taxa e um abatimento — subtrai do total esperado
  const somaItens = itens.reduce((s, i) => s + Number(i.preco_cobrado), 0);
  const somaDesconto = pagamentos.filter(p => p.forma === 'desconto_taxa').reduce((s, p) => s + Number(p.valor), 0);
  const somaPagamentos = pagamentos.filter(p => p.forma !== 'desconto_taxa').reduce((s, p) => s + Number(p.valor), 0);
  const totalEsperado = somaItens - somaDesconto;
  if (Math.abs(totalEsperado - somaPagamentos) > 0.01) {
    return res.status(400).json({ ok: false, error: `Soma dos pagamentos (${somaPagamentos.toFixed(2)}) diferente do total esperado (${totalEsperado.toFixed(2)})` });
  }

  // Validate items
  for (const item of itens) {
    if (item.tipo === 'servico' && !item.servico_id) {
      return res.status(400).json({ ok: false, error: 'servico_id obrigatorio para itens do tipo servico' });
    }
    if (item.tipo === 'produto' && !item.produto_id) {
      return res.status(400).json({ ok: false, error: 'produto_id obrigatorio para itens do tipo produto' });
    }
    if (item.tipo === 'freezer' && !item.freezer_id) {
      return res.status(400).json({ ok: false, error: 'freezer_id obrigatorio para itens do tipo freezer' });
    }
    if (item.colaboradoras && item.colaboradoras.length > 0) {
      const somaPerc = item.colaboradoras.reduce((s, c) => s + Number(c.percentual_comissao), 0);
      if (Math.abs(somaPerc - 100) > 0.01) {
        return res.status(400).json({ ok: false, error: `Soma dos percentuais deve ser 100 (atual: ${somaPerc})` });
      }
    }
  }

  // Atomic transaction
  const createAtendimento = db.transaction(() => {
    // 1. Insert atendimento
    const atdResult = db.prepare(
      'INSERT INTO atendimentos (cliente_id, data_hora, valor_total, observacao) VALUES (?, ?, ?, ?)'
    ).run(cliente_id, data_hora, somaItens, observacao || null);
    const atendimentoId = atdResult.lastInsertRowid;

    // 2. Insert pagamentos
    const insertPag = db.prepare('INSERT INTO atendimento_pagamentos (atendimento_id, forma, valor) VALUES (?, ?, ?)');
    for (const pag of pagamentos) {
      insertPag.run(atendimentoId, pag.forma, pag.valor);
    }

    // 3. Insert itens + colaboradoras + stock decrements
    const insertItem = db.prepare(`
      INSERT INTO atendimento_itens (atendimento_id, tipo, servico_id, produto_id, freezer_id, promocao_id, descricao, preco_cobrado, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItemColab = db.prepare(`
      INSERT INTO atendimento_item_colaboradoras (atendimento_item_id, colaboradora_id, percentual_comissao, valor_comissao)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of itens) {
      const itemResult = insertItem.run(
        atendimentoId, item.tipo,
        item.servico_id || null, item.produto_id || null, item.freezer_id || null, item.promocao_id || null,
        item.descricao || null, item.preco_cobrado, item.observacao || null
      );
      const itemId = itemResult.lastInsertRowid;

      // Insert colaboradoras and calculate commissions
      if (item.colaboradoras) {
        for (const colab of item.colaboradoras) {
          const colabData = db.prepare('SELECT comissao_padrao FROM colaboradoras WHERE id = ?').get(colab.colaboradora_id);
          const comissaoPadrao = colabData?.comissao_padrao || 0;
          const valorComissao = item.preco_cobrado * (comissaoPadrao / 100) * (colab.percentual_comissao / 100);
          insertItemColab.run(itemId, colab.colaboradora_id, colab.percentual_comissao, Math.round(valorComissao * 100) / 100);
        }
      }

      // Stock decrements for services
      if (item.tipo === 'servico' && item.servico_id) {
        const servico = db.prepare('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = ?').get(item.servico_id);
        if (servico?.consome_kit_mao) {
          const kit = db.prepare('SELECT quantidade FROM estoque_kits WHERE tipo = ?').get('mao');
          const newQty = Math.max(0, (kit?.quantidade || 0) - 1);
          db.prepare('UPDATE estoque_kits SET quantidade = ?, updated_at = datetime(\'now\',\'localtime\') WHERE tipo = ?').run(newQty, 'mao');
          if (newQty === 0 && kit?.quantidade > 0) console.warn('ALERTA: Kit mao zerado');
        }
        if (servico?.consome_kit_pe) {
          const kit = db.prepare('SELECT quantidade FROM estoque_kits WHERE tipo = ?').get('pe');
          const newQty = Math.max(0, (kit?.quantidade || 0) - 1);
          db.prepare('UPDATE estoque_kits SET quantidade = ?, updated_at = datetime(\'now\',\'localtime\') WHERE tipo = ?').run(newQty, 'pe');
          if (newQty === 0 && kit?.quantidade > 0) console.warn('ALERTA: Kit pe zerado');
        }
      }

      // Stock decrement for products
      if (item.tipo === 'produto' && item.produto_id) {
        const prod = db.prepare('SELECT quantidade FROM estoque_lojinha WHERE id = ?').get(item.produto_id);
        const newQty = Math.max(0, (prod?.quantidade || 0) - 1);
        db.prepare('UPDATE estoque_lojinha SET quantidade = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(newQty, item.produto_id);
      }
      if (item.tipo === 'freezer' && item.freezer_id) {
        const prod = db.prepare('SELECT quantidade FROM estoque_freezer WHERE id = ?').get(item.freezer_id);
        const newQty = Math.max(0, (prod?.quantidade || 0) - 1);
        db.prepare('UPDATE estoque_freezer SET quantidade = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(newQty, item.freezer_id);
      }
    }

    // 5. If from agendamento, update status
    if (agendamento_id) {
      db.prepare(`
        UPDATE agendamentos SET status = 'concluido', atendimento_id = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(atendimentoId, agendamento_id);
    }

    return atendimentoId;
  });

  const atendimentoId = createAtendimento();
  const created = db.prepare('SELECT * FROM atendimentos WHERE id = ?').get(atendimentoId);
  res.status(201).json({ ok: true, data: created });
});

// PUT /api/atendimentos/:id — editar comanda completa
router.put('/:id', (req, res) => {
  const { cliente_id, data_hora, observacao, pagamentos, itens } = req.body;

  const atd = db.prepare('SELECT * FROM atendimentos WHERE id = ? AND cancelado = 0').get(req.params.id);
  if (!atd) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado' });

  if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id e obrigatorio' });
  if (!data_hora) return res.status(400).json({ ok: false, error: 'data_hora e obrigatorio' });
  if (!pagamentos || pagamentos.length === 0) return res.status(400).json({ ok: false, error: 'Pelo menos 1 pagamento e obrigatorio' });
  if (!itens || itens.length === 0) return res.status(400).json({ ok: false, error: 'Pelo menos 1 item e obrigatorio' });

  for (const pag of pagamentos) {
    if (!FORMAS_PAGAMENTO.includes(pag.forma)) {
      return res.status(400).json({ ok: false, error: `Forma de pagamento invalida: ${pag.forma}` });
    }
  }

  const somaItens = itens.reduce((s, i) => s + Number(i.preco_cobrado), 0);
  const somaDesconto = pagamentos.filter(p => p.forma === 'desconto_taxa').reduce((s, p) => s + Number(p.valor), 0);
  const somaPagamentos = pagamentos.filter(p => p.forma !== 'desconto_taxa').reduce((s, p) => s + Number(p.valor), 0);
  const totalEsperado = somaItens - somaDesconto;
  if (Math.abs(totalEsperado - somaPagamentos) > 0.01) {
    return res.status(400).json({ ok: false, error: `Soma dos pagamentos (${somaPagamentos.toFixed(2)}) diferente do total esperado (${totalEsperado.toFixed(2)})` });
  }

  const editarAtendimento = db.transaction(() => {
    // 1. Reverter estoque dos itens antigos
    const itensAntigos = db.prepare('SELECT * FROM atendimento_itens WHERE atendimento_id = ?').all(atd.id);
    for (const item of itensAntigos) {
      if (item.tipo === 'servico' && item.servico_id) {
        const servico = db.prepare('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = ?').get(item.servico_id);
        if (servico?.consome_kit_mao) {
          db.prepare("UPDATE estoque_kits SET quantidade = quantidade + 1, updated_at = datetime('now','localtime') WHERE tipo = ?").run('mao');
        }
        if (servico?.consome_kit_pe) {
          db.prepare("UPDATE estoque_kits SET quantidade = quantidade + 1, updated_at = datetime('now','localtime') WHERE tipo = ?").run('pe');
        }
      }
      if (item.tipo === 'produto' && item.produto_id) {
        db.prepare("UPDATE estoque_lojinha SET quantidade = quantidade + 1, updated_at = datetime('now','localtime') WHERE id = ?").run(item.produto_id);
      }
      if (item.tipo === 'freezer' && item.freezer_id) {
        db.prepare("UPDATE estoque_freezer SET quantidade = quantidade + 1, updated_at = datetime('now','localtime') WHERE id = ?").run(item.freezer_id);
      }
    }

    // 2. Deletar pagamentos e itens antigos (CASCADE cuida das colaboradoras)
    db.prepare('DELETE FROM atendimento_pagamentos WHERE atendimento_id = ?').run(atd.id);
    db.prepare('DELETE FROM atendimento_itens WHERE atendimento_id = ?').run(atd.id);

    // 3. Atualizar cabeçalho
    db.prepare('UPDATE atendimentos SET cliente_id = ?, data_hora = ?, valor_total = ?, observacao = ? WHERE id = ?')
      .run(cliente_id, data_hora, somaItens, observacao || null, atd.id);

    // 4. Inserir novos pagamentos
    const insertPag = db.prepare('INSERT INTO atendimento_pagamentos (atendimento_id, forma, valor) VALUES (?, ?, ?)');
    for (const pag of pagamentos) insertPag.run(atd.id, pag.forma, pag.valor);

    // 5. Inserir novos itens + colaboradoras + estoque
    const insertItem = db.prepare(`
      INSERT INTO atendimento_itens (atendimento_id, tipo, servico_id, produto_id, freezer_id, promocao_id, descricao, preco_cobrado, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItemColab = db.prepare(`
      INSERT INTO atendimento_item_colaboradoras (atendimento_item_id, colaboradora_id, percentual_comissao, valor_comissao)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of itens) {
      const itemResult = insertItem.run(
        atd.id, item.tipo,
        item.servico_id || null, item.produto_id || null, item.freezer_id || null, item.promocao_id || null,
        item.descricao || null, item.preco_cobrado, item.observacao || null
      );
      const itemId = itemResult.lastInsertRowid;

      if (item.colaboradoras) {
        for (const colab of item.colaboradoras) {
          const colabData = db.prepare('SELECT comissao_padrao FROM colaboradoras WHERE id = ?').get(colab.colaboradora_id);
          const comissaoPadrao = colabData?.comissao_padrao || 0;
          const valorComissao = item.preco_cobrado * (comissaoPadrao / 100) * (colab.percentual_comissao / 100);
          insertItemColab.run(itemId, colab.colaboradora_id, colab.percentual_comissao, Math.round(valorComissao * 100) / 100);
        }
      }

      if (item.tipo === 'servico' && item.servico_id) {
        const servico = db.prepare('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = ?').get(item.servico_id);
        if (servico?.consome_kit_mao) {
          const kit = db.prepare('SELECT quantidade FROM estoque_kits WHERE tipo = ?').get('mao');
          db.prepare("UPDATE estoque_kits SET quantidade = ?, updated_at = datetime('now','localtime') WHERE tipo = ?").run(Math.max(0, (kit?.quantidade || 0) - 1), 'mao');
        }
        if (servico?.consome_kit_pe) {
          const kit = db.prepare('SELECT quantidade FROM estoque_kits WHERE tipo = ?').get('pe');
          db.prepare("UPDATE estoque_kits SET quantidade = ?, updated_at = datetime('now','localtime') WHERE tipo = ?").run(Math.max(0, (kit?.quantidade || 0) - 1), 'pe');
        }
      }
      if (item.tipo === 'produto' && item.produto_id) {
        const prod = db.prepare('SELECT quantidade FROM estoque_lojinha WHERE id = ?').get(item.produto_id);
        db.prepare("UPDATE estoque_lojinha SET quantidade = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(Math.max(0, (prod?.quantidade || 0) - 1), item.produto_id);
      }
      if (item.tipo === 'freezer' && item.freezer_id) {
        const prod = db.prepare('SELECT quantidade FROM estoque_freezer WHERE id = ?').get(item.freezer_id);
        db.prepare("UPDATE estoque_freezer SET quantidade = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(Math.max(0, (prod?.quantidade || 0) - 1), item.freezer_id);
      }
    }
  });

  editarAtendimento();
  const updated = db.prepare(`
    SELECT a.*, c.nome as cliente_nome FROM atendimentos a
    LEFT JOIN clientes c ON c.id = a.cliente_id WHERE a.id = ?
  `).get(atd.id);
  res.json({ ok: true, data: updated });
});

// DELETE /api/atendimentos/:id — cancelar (soft delete, apenas se do dia atual)
router.delete('/:id', (req, res) => {
  const atd = db.prepare('SELECT * FROM atendimentos WHERE id = ?').get(req.params.id);
  if (!atd) return res.status(404).json({ ok: false, error: 'Atendimento nao encontrado' });

  const agora = new Date();
  const today = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const atdDate = atd.data_hora.split('T')[0];
  if (atdDate !== today) {
    return res.status(400).json({ ok: false, error: 'Cancelamento permitido apenas para atendimentos do dia atual' });
  }

  // Reverse stock decrements and cancel
  const cancelAtendimento = db.transaction(() => {
    const itens = db.prepare('SELECT * FROM atendimento_itens WHERE atendimento_id = ?').all(atd.id);

    for (const item of itens) {
      if (item.tipo === 'servico' && item.servico_id) {
        const servico = db.prepare('SELECT consome_kit_mao, consome_kit_pe FROM servicos WHERE id = ?').get(item.servico_id);
        if (servico?.consome_kit_mao) {
          db.prepare('UPDATE estoque_kits SET quantidade = quantidade + 1, updated_at = datetime(\'now\',\'localtime\') WHERE tipo = ?').run('mao');
        }
        if (servico?.consome_kit_pe) {
          db.prepare('UPDATE estoque_kits SET quantidade = quantidade + 1, updated_at = datetime(\'now\',\'localtime\') WHERE tipo = ?').run('pe');
        }
      }
      if (item.tipo === 'produto' && item.produto_id) {
        db.prepare('UPDATE estoque_lojinha SET quantidade = quantidade + 1, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(item.produto_id);
      }
      if (item.tipo === 'freezer' && item.freezer_id) {
        db.prepare('UPDATE estoque_freezer SET quantidade = quantidade + 1, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(item.freezer_id);
      }
    }

    db.prepare('UPDATE atendimentos SET cancelado = 1 WHERE id = ?').run(atd.id);
  });

  cancelAtendimento();
  res.json({ ok: true, data: null });
});

export default router;
