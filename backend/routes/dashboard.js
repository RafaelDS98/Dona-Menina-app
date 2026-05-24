import { Router } from 'express';
import pool from '../database/db.js';

const router = Router();

function calcKitStatus(kit) {
  if (kit.quantidade > kit.alerta_atencao) return 'ok';
  if (kit.quantidade > kit.alerta_urgente) return 'atencao';
  if (kit.quantidade > kit.alerta_critico) return 'urgente';
  return 'critico';
}

router.get('/', async (req, res) => {
  try {
    const agora = new Date();
    const hoje = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const mesInicio = hoje.slice(0, 7) + '-01';

    const agResult = await pool.query(`
      SELECT ag.id, SUBSTRING(ag.data_hora FROM 12 FOR 5) as hora,
        c.nome as cliente_nome, c.telefone as cliente_telefone,
        s.nome as servico, col.nome as colaboradora, ag.status
      FROM agendamentos ag
      LEFT JOIN clientes c ON c.id = ag.cliente_id
      LEFT JOIN servicos s ON s.id = ag.servico_id
      LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
      WHERE DATE(ag.data_hora) = $1 AND ag.status != 'cancelado'
      ORDER BY ag.data_hora
    `, [hoje]);

    const agendamentos = agResult.rows.map(ag => ({
      ...ag,
      cliente_telefone_limpo: ag.cliente_telefone ? '55' + ag.cliente_telefone.replace(/\D/g, '') : null,
    }));

    const fatHoje = await pool.query(`
      SELECT COALESCE(SUM(valor_total),0) as valor, COUNT(*) as total
      FROM atendimentos WHERE cancelado=0 AND DATE(data_hora)=$1
    `, [hoje]);

    const fatMes = await pool.query(`
      SELECT COALESCE(SUM(valor_total),0) as valor, COUNT(*) as total
      FROM atendimentos WHERE cancelado=0 AND DATE(data_hora) BETWEEN $1 AND $2
    `, [mesInicio, hoje]);

    const kitsResult = await pool.query('SELECT * FROM estoque_kits');
    const kits = kitsResult.rows.map(k => ({ tipo: k.tipo, quantidade: k.quantidade, status: calcKitStatus(k) }));

    const promoResult = await pool.query(`
      SELECT id, nome, preco, data_fim FROM promocoes
      WHERE ativa=1 AND data_inicio<=$1 AND data_fim>=$2
    `, [hoje, hoje]);

    const ultimoBackup = await pool.query('SELECT created_at FROM backup_log ORDER BY created_at DESC LIMIT 1');
    const intervalo = await pool.query("SELECT valor FROM configuracoes WHERE chave='backup_intervalo_dias'");
    let backupVencido = true;
    if (ultimoBackup.rows[0]) {
      const diff = Date.now() - new Date(ultimoBackup.rows[0].created_at).getTime();
      backupVencido = Math.floor(diff / (1000 * 60 * 60 * 24)) >= Number(intervalo.rows[0]?.valor || 7);
    }

    const pagHoje = await pool.query(`
      SELECT ap.forma, COALESCE(SUM(ap.valor),0) as total
      FROM atendimento_pagamentos ap
      JOIN atendimentos a ON a.id=ap.atendimento_id
      WHERE a.cancelado=0 AND DATE(a.data_hora)=$1
      GROUP BY ap.forma ORDER BY total DESC
    `, [hoje]);

    res.json({ ok: true, data: {
      agendamentos_hoje: agendamentos,
      faturamento_hoje: parseFloat(fatHoje.rows[0].valor),
      total_atendimentos_hoje: parseInt(fatHoje.rows[0].total),
      pagamentos_hoje: pagHoje.rows,
      kits,
      promocoes_ativas: promoResult.rows,
      backup_vencido: backupVencido,
      ultimo_backup: ultimoBackup.rows[0]?.created_at || null,
    }});
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;
