import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

// GET /api/comissoes?data_inicio=&data_fim=&todas=true
// ou GET /api/comissoes?colaboradora_id=&data_inicio=&data_fim=
router.get('/', (req, res) => {
  const { colaboradora_id, data_inicio, data_fim, todas } = req.query;

  if (!data_inicio || !data_fim) {
    return res.status(400).json({ ok: false, error: 'data_inicio e data_fim sao obrigatorios' });
  }

  // Modo: Todas as colaboradoras
  if (todas === 'true') {
    const colaboradoras = db.prepare(
      'SELECT id, nome, comissao_padrao FROM colaboradoras WHERE ativa = 1 ORDER BY nome'
    ).all();

    const resultados = colaboradoras.map(colab => {
      const itens = db.prepare(`
        SELECT aic.valor_comissao, aic.percentual_comissao as percentual_participacao,
          ai.preco_cobrado, ai.descricao as servico,
          a.data_hora as data, c.nome as cliente
        FROM atendimento_item_colaboradoras aic
        JOIN atendimento_itens ai ON ai.id = aic.atendimento_item_id
        JOIN atendimentos a ON a.id = ai.atendimento_id
        LEFT JOIN clientes c ON c.id = a.cliente_id
        WHERE aic.colaboradora_id = ? AND a.cancelado = 0 AND a.status = 'concluida'
        AND DATE(a.data_hora) BETWEEN ? AND ?
        ORDER BY a.data_hora
      `).all(colab.id, data_inicio, data_fim);

      const totalAtendimentos = new Set(itens.map(i => i.data)).size;
      const totalServicosValor = itens.reduce((s, i) => s + i.preco_cobrado, 0);
      const totalComissao = itens.reduce((s, i) => s + i.valor_comissao, 0);

      // Calcular comissao padrao média usada no período
      let percentualComissaoMedioUsado = 0;
      if (itens.length > 0) {
        const comissoesCalculadas = itens.map(i => {
          if (i.preco_cobrado > 0 && i.percentual_participacao > 0) {
            const percentualParticipacaoDecimal = i.percentual_participacao / 100;
            return (i.valor_comissao / (i.preco_cobrado * percentualParticipacaoDecimal)) * 100;
          }
          return 0;
        });
        percentualComissaoMedioUsado = Math.round(
          comissoesCalculadas.reduce((s, c) => s + c, 0) / comissoesCalculadas.length
        );
      }

      return {
        colaboradora: colab,
        percentual_comissao: colab.comissao_padrao || 0,
        percentual_comissao_medio_usado: percentualComissaoMedioUsado,
        total_atendimentos: totalAtendimentos,
        total_servicos_valor: Math.round(totalServicosValor * 100) / 100,
        total_comissao: Math.round(totalComissao * 100) / 100,
        itens,
      };
    });

    const totalGeral = resultados.reduce((s, r) => s + r.total_comissao, 0);

    return res.json({
      ok: true,
      data: {
        periodo: { inicio: data_inicio, fim: data_fim },
        modo: 'todas',
        total_geral_comissao: Math.round(totalGeral * 100) / 100,
        resultados,
      },
    });
  }

  // Modo: Uma colaboradora especifica
  if (!colaboradora_id) {
    return res.status(400).json({ ok: false, error: 'colaboradora_id ou todas=true sao obrigatorios' });
  }

  const colaboradora = db.prepare(
    'SELECT id, nome, comissao_padrao FROM colaboradoras WHERE id = ?'
  ).get(colaboradora_id);
  if (!colaboradora) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });

  const itens = db.prepare(`
    SELECT aic.valor_comissao, aic.percentual_comissao as percentual_participacao,
      aic.atendimento_item_id,
      ai.preco_cobrado, ai.descricao as servico,
      a.data_hora as data, c.nome as cliente
    FROM atendimento_item_colaboradoras aic
    JOIN atendimento_itens ai ON ai.id = aic.atendimento_item_id
    JOIN atendimentos a ON a.id = ai.atendimento_id
    LEFT JOIN clientes c ON c.id = a.cliente_id
    WHERE aic.colaboradora_id = ? AND a.cancelado = 0 AND a.status = 'concluida'
    AND DATE(a.data_hora) BETWEEN ? AND ?
    ORDER BY a.data_hora
  `).all(colaboradora_id, data_inicio, data_fim);

  const totalAtendimentos = new Set(itens.map(i => i.data)).size;
  const totalServicosValor = itens.reduce((s, i) => s + i.preco_cobrado, 0);
  const totalComissao = itens.reduce((s, i) => s + i.valor_comissao, 0);

  // Para cada item, buscar outras colaboradoras que participaram
  const itensDetalhados = itens.map(i => {
    const outras = db.prepare(`
      SELECT col.nome
      FROM atendimento_item_colaboradoras aic
      JOIN colaboradoras col ON col.id = aic.colaboradora_id
      WHERE aic.atendimento_item_id = ? AND aic.colaboradora_id != ?
    `).all(i.atendimento_item_id, colaboradora_id);

    // Calcular a % de comissao que foi usada na época do atendimento
    // valor_comissao = preco_cobrado * (comissao_padrao / 100) * (percentual_participacao / 100)
    // comissao_padrao = (valor_comissao / (preco_cobrado * percentual_participacao / 100)) * 100
    let comissaoPadraoUsada = 0;
    if (i.preco_cobrado > 0 && i.percentual_participacao > 0) {
      const percentualParticipacaoDecimal = i.percentual_participacao / 100;
      comissaoPadraoUsada = Math.round(
        (i.valor_comissao / (i.preco_cobrado * percentualParticipacaoDecimal)) * 100
      );
    }

    return {
      data: i.data.split('T')[0],
      cliente: i.cliente,
      servico: i.servico,
      preco_cobrado: i.preco_cobrado,
      percentual_participacao: i.percentual_participacao,
      comissao_padrao_usada: comissaoPadraoUsada,
      valor_comissao: i.valor_comissao,
      outras_colaboradoras: outras.map(o => o.nome),
    };
  });

  res.json({
    ok: true,
    data: {
      colaboradora,
      percentual_comissao: colaboradora.comissao_padrao || 0,
      periodo: { inicio: data_inicio, fim: data_fim },
      modo: 'individual',
      total_atendimentos: totalAtendimentos,
      total_servicos_valor: Math.round(totalServicosValor * 100) / 100,
      total_comissao: Math.round(totalComissao * 100) / 100,
      itens: itensDetalhados,
    },
  });
});

export default router;
