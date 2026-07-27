import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function formatDate(dataHora) {
  if (!dataHora) return '';
  const d = new Date(dataHora);
  return d.toLocaleDateString('pt-BR');
}

function formatFormasPag(pagamentos) {
  if (!pagamentos || pagamentos.length === 0) return '—';
  const map = { pix: 'PIX', credito: 'CRÉDITO', debito: 'DÉBITO', especie: 'DINHEIRO', taxa: 'TAXA AGEND.', desconto_taxa: 'TAXA AGEND.', pago_antecipado: 'ANTECIPADO' };
  return pagamentos
    .filter(p => p.forma !== 'desconto_taxa' && p.forma !== 'pago_antecipado')
    .map(p => map[p.forma] || p.forma)
    .join(' + ') || 'ANTECIPADO';
}

export default function Atendimentos() {
  const navigate = useNavigate();
  const toast = useToast();

  const [atendimentos, setAtendimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filtroData, setFiltroData] = useState('');
  const [cancelDialog, setCancelDialog] = useState({ open: false, id: null });
  const [cancelando, setCancelando] = useState(false);

  const limit = 50;

  async function carregar(p = page, data = filtroData) {
    setLoading(true);
    try {
      let url = `/atendimentos?page=${p}&limit=${limit}`;
      if (data) url += `&data=${data}`;
      const result = await api.get(url);
      setAtendimentos(result.items);
      setTotal(result.total);
    } catch {
      toast.error('Erro ao carregar atendimentos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar(1, filtroData);
    setPage(1);
  }, [filtroData]);

  async function handleCancelar() {
    setCancelando(true);
    try {
      await api.delete(`/atendimentos/${cancelDialog.id}`);
      toast.success('Atendimento cancelado');
      setCancelDialog({ open: false, id: null });
      carregar();
    } catch (e) {
      toast.error(e.message || 'Erro ao cancelar');
    } finally {
      setCancelando(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-title font-semibold text-gray-800">Atendimentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} comanda{total !== 1 ? 's' : ''} registrada{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => navigate('/atendimentos/novo')}
          className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors shadow-sm"
        >
          + Nova Comanda
        </button>
      </div>

      {/* Filtro por data */}
      <div className="bg-white rounded-lg border shadow-sm p-4 mb-4 flex items-center gap-4">
        <label className="text-sm text-gray-600 font-medium">Filtrar por data:</label>
        <input
          type="date"
          value={filtroData}
          onChange={e => setFiltroData(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {filtroData && (
          <button
            onClick={() => setFiltroData('')}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Limpar filtro
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Carregando...</div>
        ) : atendimentos.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            Nenhuma comanda encontrada.
            <br />
            <button
              onClick={() => navigate('/atendimentos/novo')}
              className="mt-3 text-primary underline text-sm"
            >
              Criar primeira comanda
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Serviços</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Colaboradora</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagamento</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {atendimentos.map((atd) => {
                const colabs = [...new Set(
                  atd.itens
                    .flatMap(i => i.colaboradoras || [])
                    .map(c => c.colaboradora_nome)
                    .filter(Boolean)
                )].join(' + ');

                const servicos = atd.itens.map(i => i.descricao).join(' + ');

                return (
                  <tr key={atd.id} className="hover:bg-pink-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{atd.id}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(atd.data_hora)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{atd.cliente_nome || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={servicos}>{servicos || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{colabs || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatFormasPag(atd.pagamentos)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      R$ {formatCurrency(atd.valor_total)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <Link
                          to={`/atendimentos/${atd.id}/editar`}
                          className="text-xs text-primary hover:underline"
                        >
                          Editar
                        </Link>
                        <button
                          onClick={() => setCancelDialog({ open: true, id: atd.id })}
                          className="text-xs text-alert-danger hover:underline"
                          title="Cancelar comanda (só permitido no mesmo dia)"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            disabled={page === 1}
            onClick={() => { setPage(p => p - 1); carregar(page - 1); }}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            ← Anterior
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => { setPage(p => p + 1); carregar(page + 1); }}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Próxima →
          </button>
        </div>
      )}

      <ConfirmDialog
        open={cancelDialog.open}
        onClose={() => setCancelDialog({ open: false, id: null })}
        onConfirm={handleCancelar}
        title="Cancelar comanda"
        message="Tem certeza? O estoque será restaurado. Cancelamento só é permitido para comandas do dia atual."
        confirmText={cancelando ? 'Cancelando...' : 'Sim, cancelar'}
        danger
      />
    </div>
  );
}
