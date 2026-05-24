import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

function normalizarForma(forma) {
  const mapa = { dinheiro: 'Dinheiro', credito: 'Crédito', debito: 'Débito', pix: 'Pix', desconto_taxa: 'Desconto taxa' };
  return mapa[forma?.toLowerCase()] || forma;
}

router.get('/', async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ ok: false, error: 'data e obrigatoria (YYYY-MM-DD)' });

    const atdResult = await pool.query(`
      SELECT a.id, a.data_hora, c.nome as cliente, a.cancelado, a.status
      FROM atendimentos a LEFT JOIN clientes c ON c.id=a.cliente_id
      WHERE DATE(a.data_hora)=$1 AND a.cancelado=0 AND a.status='concluida' ORDER BY a.id ASC
    `, [data]);

    const atendimentosDetalhados = [];
    for (const [idx, atd] of atdResult.rows.entries()) {
      const itensResult = await pool.query(`
        SELECT ai.id, ai.tipo, ai.descricao, ai.preco_cobrado, ai.observacao
        FROM atendimento_itens ai WHERE ai.atendimento_id=$1 ORDER BY ai.id
      `, [atd.id]);

      const itensDetalhados = [];
      for (const item of itensResult.rows) {
        const colResult = await pool.query(`
          SELECT col.nome FROM atendimento_item_colaboradoras aic
          JOIN colaboradoras col ON col.id=aic.colaboradora_id WHERE aic.atendimento_item_id=$1
        `, [item.id]);
        itensDetalhados.push({ ...item, colaboradoras: colResult.rows.map(c => c.nome) });
      }

      const pagResult = await pool.query('SELECT forma, valor FROM atendimento_pagamentos WHERE atendimento_id=$1 ORDER BY forma', [atd.id]);
      atendimentosDetalhados.push({
        numero: idx + 1,
        cliente: atd.cliente || 'Sem cliente',
        itens: itensDetalhados,
        pagamentos: pagResult.rows,
        valor_total: itensDetalhados.reduce((s, i) => s + Number(i.preco_cobrado), 0),
      });
    }

    const totaisPorForma = {};
    atendimentosDetalhados.forEach(atd => {
      atd.pagamentos.forEach(pag => {
        const forma = normalizarForma(pag.forma);
        totaisPorForma[forma] = (totaisPorForma[forma] || 0) + Number(pag.valor);
      });
    });
    const totalDia = Object.values(totaisPorForma).reduce((s, v) => s + v, 0);

    res.json({ ok: true, data: {
      data,
      data_formatada: new Date(data + 'T00:00').toLocaleDateString('pt-BR'),
      atendimentos: atendimentosDetalhados,
      totais_por_forma: totaisPorForma,
      total_dia: Math.round(totalDia * 100) / 100,
    }});
  } catch (e) {
    console.error('Erro fechamento:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
