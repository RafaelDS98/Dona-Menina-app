import express from 'express';
import cors from 'cors';
import { join } from 'path';
import db from './database/db.js';

// Import routes
import clientesRouter from './routes/clientes.js';
import colaboradorasRouter from './routes/colaboradoras.js';
import servicosRouter from './routes/servicos.js';
import agendamentosRouter from './routes/agendamentos.js';
import atendimentosRouter from './routes/atendimentos.js';
import comissoesRouter from './routes/comissoes.js';
import fechamentoRouter from './routes/fechamento.js';
import estoqueRouter from './routes/estoque.js';
import financeiroRouter from './routes/financeiro.js';
import promocoesRouter from './routes/promocoes.js';
import backupRouter from './routes/backup.js';
import configuracoesRouter from './routes/configuracoes.js';
import dashboardRouter from './routes/dashboard.js';
import marketingRouter from './routes/marketing.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://awake-delight-production-083e.up.railway.app'
  ],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/clientes', clientesRouter);
app.use('/api/colaboradoras', colaboradorasRouter);
app.use('/api/servicos', servicosRouter);
app.use('/api/agendamentos', agendamentosRouter);
app.use('/api/atendimentos', atendimentosRouter);
app.use('/api/comissoes', comissoesRouter);
app.use('/api/fechamento', fechamentoRouter);
app.use('/api/estoque', estoqueRouter);
app.use('/api/financeiro', financeiroRouter);
app.use('/api/promocoes', promocoesRouter);
app.use('/api/backup', backupRouter);
app.use('/api/configuracoes', configuracoesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/marketing', marketingRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, data: { status: 'running' } });
});

// Servir frontend buildado (Electron ou produção sem Docker)
if (process.env.STATIC_DIR) {
  app.use(express.static(process.env.STATIC_DIR));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(process.env.STATIC_DIR, 'index.html'));
  });
}

// Error handler (Express 5 catches async errors automatically)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Dona Menina API rodando na porta ${PORT}`);
});
