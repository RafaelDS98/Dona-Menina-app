import { Router } from 'express';
import db from '../database/db.js';

const router = Router();

function calcKitStatus(kit) {
  if (kit.quantidade > kit.alerta_atencao) return 'ok';
  if (kit.quantidade > kit.alerta_urgente) return 'atencao';
  if (kit.quantidade > kit.alerta_critico) return 'urgente';
  return 'critico';
}

// GET /api/dashboard — single endpoint aggregating all modules
router.get('/', (req, res) => {
  // Data de hoje no fuso horario local (America/Manaus = UTC-4)
  const agora = new Date();
  const offsetMs = agora.getTimezoneOffset() * 60000;
  const local = new Date(agora.getTime() - offsetMs);
  const hoje = local.toISOString().split('T')[0];
  const mesInicio = hoje.slice(0, 7) + '-01';
  const mesFim = hoje;

  // Agendamentos do dia
  const agendamentos = db.prepare(`
    SELECT ag.id, SUBSTR(ag.data_hora, 12, 5) as hora,
      c.nome as cliente_nome, c.telefone as cliente_telefone,
      s.nome as servico, col.nome as colaboradora, ag.status
    FROM agendamentos ag
    LEFT JOIN clientes c ON c.id = ag.cliente_id
    LEFT JOIN servicos s ON s.id = ag.servico_id
    LEFT JOIN colaboradoras col ON col.id = ag.colaboradora_id
    WHERE DATE(ag.data_hora) = ? AND ag.status != 'cancelado'
    ORDER BY ag.data_hora
  `).all(hoje);

  // Clean phone for WhatsApp
  const agendamentosComTelefone = agendamentos.map(ag => ({
    ...ag,
    cliente_telefone_limpo: ag.cliente_telefone
      ? '55' + ag.cliente_telefone.replace(/\D/g, '')
      : null,
  }));

  // Faturamento hoje
  const fatHoje = db.prepare(`
    SELECT COALESCE(SUM(valor_total), 0) as valor, COUNT(*) as total
    FROM atendimentos WHERE cancelado = 0 AND DATE(data_hora) = ?
  `).get(hoje);

  // Faturamento mes
  const fatMes = db.prepare(`
    SELECT COALESCE(SUM(valor_total), 0) as valor, COUNT(*) as total
    FROM atendimentos WHERE cancelado = 0 AND DATE(data_hora) BETWEEN ? AND ?
  `).get(mesInicio, mesFim);

  // Kits
  const kits = db.prepare('SELECT * FROM estoque_kits').all().map(k => ({
    tipo: k.tipo,
    quantidade: k.quantidade,
    status: calcKitStatus(k),
  }));

  // Promocoes ativas
  const promocoes = db.prepare(`
    SELECT id, nome, preco, data_fim FROM promocoes
    WHERE ativa = 1 AND data_inicio <= ? AND data_fim >= ?
  `).all(hoje, hoje);

  // Backup status
  const ultimoBackup = db.prepare('SELECT created_at FROM backup_log ORDER BY created_at DESC LIMIT 1').get();
  const intervalo = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'backup_intervalo_dias'").get();
  let backupVencido = true;
  if (ultimoBackup) {
    const diff = Date.now() - new Date(ultimoBackup.created_at).getTime();
    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    backupVencido = dias >= Number(intervalo?.valor || 7);
  }

  // Faturamento hoje por forma de pagamento
  const pagamentosHoje = db.prepare(`
    SELECT ap.forma, COALESCE(SUM(ap.valor), 0) as total
    FROM atendimento_pagamentos ap
    JOIN atendimentos a ON a.id = ap.atendimento_id
    WHERE a.cancelado = 0 AND DATE(a.data_hora) = ?
    GROUP BY ap.forma
    ORDER BY total DESC
  `).all(hoje);

  res.json({
    ok: true,
    data: {
      agendamentos_hoje: agendamentosComTelefone,
      faturamento_hoje: fatHoje.valor,
      total_atendimentos_hoje: fatHoje.total,
      pagamentos_hoje: pagamentosHoje,
      kits,
      promocoes_ativas: promocoes,
      backup_vencido: backupVencido,
      ultimo_backup: ultimoBackup?.created_at || null,
    },
  });
});

export default router;
