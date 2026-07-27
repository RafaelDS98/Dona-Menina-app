import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import pool from '../database/db.js';

const router = Router();

/*
 * ACESSO À DIRETORIA — verificação de senha por hash (interino até a Fase 3)
 *
 * A senha NUNCA fica no código nem no banco em texto puro. O que é armazenado
 * é apenas o hash SHA-256, lido de (nesta ordem):
 *   1. Variável de ambiente DIRETORIA_SENHA_HASH (Railway → serviço backend → Variables)
 *   2. Tabela configuracoes, chave 'diretoria_senha_hash' (fallback opcional)
 *
 * Para trocar a senha: gerar novo hash e atualizar a variável no Railway.
 *   node -e "console.log(require('crypto').createHash('sha256').update('NOVA_SENHA').digest('hex'))"
 *
 * FASE 3 (login/permissões): substituir este gate pelo middleware
 * requirePermissao('dashboard', 'ver') do perfil admin e remover esta rota.
 */

const TENTATIVAS_MAX = 5;
const JANELA_MS = 10 * 60 * 1000; // 10 minutos
const tentativas = new Map(); // ip -> { count, primeiro }

function bloqueado(ip) {
  const t = tentativas.get(ip);
  if (!t) return false;
  if (Date.now() - t.primeiro > JANELA_MS) { tentativas.delete(ip); return false; }
  return t.count >= TENTATIVAS_MAX;
}

function registrarFalha(ip) {
  const t = tentativas.get(ip);
  if (!t || Date.now() - t.primeiro > JANELA_MS) {
    tentativas.set(ip, { count: 1, primeiro: Date.now() });
  } else {
    t.count += 1;
  }
}

async function obterHashConfigurado() {
  const env = (process.env.DIRETORIA_SENHA_HASH || '').trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(env)) return env;
  try {
    const r = await pool.query("SELECT valor FROM configuracoes WHERE chave='diretoria_senha_hash'");
    const v = (r.rows[0]?.valor || '').trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(v)) return v;
  } catch { /* tabela indisponível: segue sem fallback */ }
  return null;
}

router.post('/verificar', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'desconhecido';
    if (bloqueado(ip)) {
      return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde 10 minutos e tente novamente.' });
    }

    const { senha } = req.body || {};
    if (!senha || typeof senha !== 'string') {
      registrarFalha(ip);
      return res.status(400).json({ ok: false, error: 'Informe a senha.' });
    }

    const hashConfigurado = await obterHashConfigurado();
    if (!hashConfigurado) {
      return res.status(503).json({ ok: false, error: 'Acesso da diretoria não configurado. Defina DIRETORIA_SENHA_HASH no servidor.' });
    }

    const hashInformado = createHash('sha256').update(senha, 'utf8').digest('hex');
    const a = Buffer.from(hashInformado, 'hex');
    const b = Buffer.from(hashConfigurado, 'hex');
    const autorizado = a.length === b.length && timingSafeEqual(a, b);

    if (!autorizado) {
      registrarFalha(ip);
      return res.status(401).json({ ok: false, error: 'Senha incorreta. Acesso restrito à diretoria.' });
    }

    tentativas.delete(ip);
    res.json({ ok: true, data: { autorizado: true } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
