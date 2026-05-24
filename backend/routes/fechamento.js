import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

// GET /api/fechamento?data=YYYY-MM-DD
router.get('/', (req, res) => {
  try {
    const { data } = req.query;

    if (!data) {
      return res.status(400).json({ ok: false, error: 'data e obrigatoria (YYYY-MM-DD)' });
    }

    // Buscar todos os atendimentos do dia
    const atendimentos = db.prepare(`
      SELECT 
        a.id,
        a.data_hora,
        c.nome as cliente,
        a.cancelado,
        a.status
      FROM atendimentos a
      LEFT JOIN clientes c ON c.id = a.cliente_id
      WHERE DATE(a.data_hora) = ? AND a.cancelado = 0 AND a.status = 'concluida'
      ORDER BY a.id ASC
    `).all(data);

    // Para cada atendimento, buscar itens e pagamentos
    const atendimentosDetalhados = atendimentos.map((atd, idx) => {
      const itens = db.prepare(`
        SELECT 
          ai.id,
          ai.tipo,
          ai.descricao,
          ai.preco_cobrado,
          ai.observacao
        FROM atendimento_itens ai
        WHERE ai.atendimento_id = ?
        ORDER BY ai.id
      `).all(atd.id);

      // Para cada item, buscar colaboradoras
      const itensDetalhados = itens.map(item => {
        const colaboradoras = db.prepare(`
          SELECT col.nome
          FROM atendimento_item_colaboradoras aic
          JOIN colaboradoras col ON col.id = aic.colaboradora_id
          WHERE aic.atendimento_item_id = ?
        `).all(item.id);

        return {
          ...item,
          colaboradoras: colaboradoras.map(c => c.nome),
        };
      });

      // Buscar pagamentos
      const pagamentos = db.prepare(`
        SELECT forma, valor
        FROM atendimento_pagamentos
        WHERE atendimento_id = ?
        ORDER BY forma
      `).all(atd.id);

      return {
        numero: idx + 1,
        cliente: atd.cliente || 'Sem cliente',
        itens: itensDetalhados,
        pagamentos,
        valor_total: itensDetalhados.reduce((s, i) => s + Number(i.preco_cobrado), 0),
      };
    });

    // Calcular totais por forma de pagamento
    const totaisPorForma = {};
    atendimentosDetalhados.forEach(atd => {
      atd.pagamentos.forEach(pag => {
        const forma = normalizarForma(pag.forma);
        totaisPorForma[forma] = (totaisPorForma[forma] || 0) + Number(pag.valor);
      });
    });

    const totalDia = Object.values(totaisPorForma).reduce((s, v) => s + v, 0);

    res.json({
      ok: true,
      data: {
        data,
        data_formatada: new Date(data + 'T00:00').toLocaleDateString('pt-BR'),
        atendimentos: atendimentosDetalhados,
        totais_por_forma: totaisPorForma,
        total_dia: Math.round(totalDia * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Erro ao gerar fechamento:', err);
    res.status(500).json({ ok: false, error: 'Erro ao gerar fechamento: ' + err.message });
  }
});

function normalizarForma(forma) {
  const mapa = {
    'dinheiro': 'Dinheiro',
    'credito': 'Crédito',
    'debito': 'Débito',
    'pix': 'Pix',
    'desconto_taxa': 'Desconto taxa',
  };
  return mapa[forma?.toLowerCase()] || forma;
}

export default router;
