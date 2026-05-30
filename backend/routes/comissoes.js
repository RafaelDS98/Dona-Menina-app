import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { colaboradora_id, data_inicio, data_fim, todas } = req.query;
    if (!data_inicio || !data_fim) return res.status(400).json({ ok: false, error: 'data_inicio e data_fim sao obrigatorios' });

    if (todas === 'true') {
      const colabs = await pool.query('SELECT id, nome, comissao_padrao FROM colaboradoras WHERE ativa=1 ORDER BY nome');
      const resultados = [];
      let totalGeralComissao = 0;

      for (const colab of colabs.rows) {
        const itens = await pool.query(`
          SELECT aic.valor_comissao, aic.percentual_comissao as percentual_participacao,
            ai.preco_cobrado, ai.descricao as servico,
            SUBSTRING(a.data_hora, 1, 10) as data, c.nome as cliente
          FROM atendimento_item_colaboradoras aic
          JOIN atendimento_itens ai ON ai.id=aic.atendimento_item_id
          JOIN atendimentos a ON a.id=ai.atendimento_id
          LEFT JOIN clientes c ON c.id=a.cliente_id
          WHERE aic.colaboradora_id=$1 AND a.cancelado=0 AND a.status='concluida'
          AND SUBSTRING(a.data_hora, 1, 10) BETWEEN $2 AND $3
          ORDER BY a.data_hora
        `, [colab.id, data_inicio, data_fim]);

        const totalComissao = itens.rows.reduce((s, i) => s + parseFloat(i.valor_comissao || 0), 0);
        const totalServicosValor = itens.rows.reduce((s, i) => s + parseFloat(i.preco_cobrado || 0), 0);
        totalGeralComissao += totalComissao;

        resultados.push({
          colaboradora: colab,
          percentual_comissao_medio_usado: colab.comissao_padrao || 0,
          total_atendimentos: itens.rows.length,
          total_servicos_valor: Math.round(totalServicosValor * 100) / 100,
          total_comissao: Math.round(totalComissao * 100) / 100,
        });
      }

      return res.json({ ok: true, data: {
        resultados,
        total_geral_comissao: Math.round(totalGeralComissao * 100) / 100,
      }});
    }

    if (colaboradora_id) {
      const colab = await pool.query('SELECT * FROM colaboradoras WHERE id=$1', [colaboradora_id]);
      if (!colab.rows[0]) return res.status(404).json({ ok: false, error: 'Colaboradora nao encontrada' });

      const itens = await pool.query(`
        SELECT aic.valor_comissao, aic.percentual_comissao as percentual_participacao,
          ai.preco_cobrado, ai.descricao as servico,
          SUBSTRING(a.data_hora, 1, 10) as data, c.nome as cliente,
          (
            SELECT STRING_AGG(c2.nome, ', ')
            FROM atendimento_item_colaboradoras aic2
            JOIN colaboradoras c2 ON c2.id = aic2.colaboradora_id
            WHERE aic2.atendimento_item_id = ai.id AND aic2.colaboradora_id != $1
          ) as outras_colaboradoras
        FROM atendimento_item_colaboradoras aic
        JOIN atendimento_itens ai ON ai.id=aic.atendimento_item_id
        JOIN atendimentos a ON a.id=ai.atendimento_id
        LEFT JOIN clientes c ON c.id=a.cliente_id
        WHERE aic.colaboradora_id=$1 AND a.cancelado=0 AND a.status='concluida'
        AND SUBSTRING(a.data_hora, 1, 10) BETWEEN $2 AND $3
        ORDER BY a.data_hora
      `, [colaboradora_id, data_inicio, data_fim]);

      const totalComissao = itens.rows.reduce((s, i) => s + parseFloat(i.valor_comissao || 0), 0);
      const totalServicosValor = itens.rows.reduce((s, i) => s + parseFloat(i.preco_cobrado || 0), 0);

      const rows = itens.rows.map(i => ({
        ...i,
        comissao_padrao_usada: colab.rows[0].comissao_padrao || 0,
        outras_colaboradoras: i.outras_colaboradoras ? i.outras_colaboradoras.split(', ') : [],
      }));

      return res.json({ ok: true, data: {
        colaboradora: colab.rows[0],
        total_atendimentos: rows.length,
        total_servicos_valor: Math.round(totalServicosValor * 100) / 100,
        total_comissao: Math.round(totalComissao * 100) / 100,
        itens: rows,
      }});
    }

    res.status(400).json({ ok: false, error: 'Informe colaboradora_id ou todas=true' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
