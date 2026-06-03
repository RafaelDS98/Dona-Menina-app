import { useState, useEffect } from 'react';
import api from '../../api.js';
import { baixarFechamento } from '../../utils/gerarFechamento.js';
import { useToast } from '../../components/Toast.jsx';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const LABEL_FORMA = {
  pix: 'PIX',
  credito: 'Crédito',
  debito: 'Débito',
  especie: 'Dinheiro',
  taxa: 'Taxa de agendamento',
};

export default function Dashboard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fechamentoAberto, setFechamentoAberto] = useState(false);
  const [carregandoFechamento, setCarregandoFechamento] = useState(false);
  const [dataFechamento, setDataFechamento] = useState(localISO(new Date()));

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleBaixarFechamento() {
    setCarregandoFechamento(true);
    try {
      const dados = await api.get(`/fechamento?data=${dataFechamento}`);
      baixarFechamento(dados);
      toast.success('Fechamento baixado com sucesso!');
    } catch (err) {
      toast.error('Erro ao gerar fechamento: ' + err.message);
    } finally {
      setCarregandoFechamento(false);
    }
  }

  if (loading) return <p className="text-gray-500">Carregando dashboard...</p>;
  if (!data) return <p className="text-red-500">Erro ao carregar dashboard</p>;

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div>
      <h2 className="font-title text-2xl text-gray-800 mb-1">Dashboard</h2>
      <p className="text-sm text-gray-400 mb-6 capitalize">{hoje}</p>

      {data.backup_vencido && (
        <div className="bg-alert-warning/10 border border-alert-warning text-alert-urgent rounded-lg p-3 mb-4 text-sm">
          Backup vencido! Ultimo backup: {data.ultimo_backup || 'nunca realizado'}
        </div>
      )}
      {data.kits?.some(k => k.status === 'critico' || k.status === 'urgente') && (
        <div className="bg-alert-danger/10 border border-alert-danger text-alert-danger rounded-lg p-3 mb-4 text-sm">
          Estoque de kits em nivel critico! Verifique o estoque.
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border mb-4 overflow-hidden">
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">Faturamento de hoje</p>
            <p className="text-3xl font-bold text-primary">R$ {formatCurrency(data.faturamento_hoje)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {data.total_atendimentos_hoje} atendimento{data.total_atendimentos_hoje !== 1 ? 's' : ''} realizado{data.total_atendimentos_hoje !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Escolher data do fechamento a ser gerado</label>
              <input
                type="date"
                value={dataFechamento}
                onChange={(e) => setDataFechamento(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBaixarFechamento}
                disabled={carregandoFechamento}
                className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40 transition-colors"
                title="Baixar fechamento do dia em arquivo TXT"
              >
                {carregandoFechamento ? 'Gerando...' : '⬇ Baixar'}
              </button>
              <button
                onClick={() => setFechamentoAberto(v => !v)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light transition-colors"
              >
                {fechamentoAberto ? 'Fechar' : 'Ver fechamento'}
                <span className="text-xs">{fechamentoAberto ? '▲' : '▼'}</span>
              </button>
            </div>
          </div>
        </div>

        {fechamentoAberto && (
          <div className="border-t bg-gray-50 px-5 py-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Fechamento do dia</p>
            {!data.pagamentos_hoje || data.pagamentos_hoje.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum pagamento registrado hoje.</p>
            ) : (
              <div className="space-y-2">
                {data.pagamentos_hoje.map(p => (
                  <div key={p.forma} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        p.forma === 'pix' ? 'bg-green-400' :
                        p.forma === 'credito' ? 'bg-blue-400' :
                        p.forma === 'debito' ? 'bg-purple-400' :
                        p.forma === 'taxa' ? 'bg-yellow-400' : 'bg-gray-400'
                      }`} />
                      <span className="text-sm text-gray-700">{LABEL_FORMA[p.forma] || p.forma}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">R$ {formatCurrency(p.total)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 mt-1">
                  <span className="text-sm font-bold text-gray-700">Total</span>
                  <span className="text-sm font-bold text-primary">R$ {formatCurrency(data.faturamento_hoje)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 border mb-6">
        <h3 className="font-semibold text-gray-700 mb-3">Agenda do dia</h3>
        {data.agendamentos_hoje?.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum agendamento para hoje</p>
        ) : (
          <div className="space-y-2">
            {data.agendamentos_hoje?.map(ag => (
              <div key={ag.id} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                <span className="font-mono text-gray-500">{ag.hora}</span>
                <span className="font-medium">{ag.cliente_nome}</span>
                <span className="text-gray-500">{ag.servico}</span>
                <span className="text-gray-400">({ag.colaboradora})</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  ag.status === 'confirmado' ? 'bg-green-100 text-green-700' :
                  ag.status === 'agendado' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{ag.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <a href="/atendimentos/novo" className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-hover transition-colors">
          Nova comanda
        </a>
        <a href="/atendimentos" className="bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Ver atendimentos
        </a>
        <a href="/agenda" className="bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Ver agenda
        </a>
      </div>
    </div>
  );
}
