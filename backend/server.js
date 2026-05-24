import express from 'express';
import cors from 'cors';
import { initSchema } from './database/db.js';

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

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://awake-delight-production-083e.up.railway.app'
  ],
  credentials: true
}));
app.use(express.json());

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, data: { status: 'running' } });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: 'Erro interno do servidor' });
});

initSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`Dona
