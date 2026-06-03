import { useState, useEffect } from 'react';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import FormField from '../../components/FormField.jsx';
import DataTable from '../../components/DataTable.jsx';

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function defaultInicio() {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

function defaultFim() {
  return localISO(new Date());
}

export default function Comissoes() {
  const toast = useToast();

  const [colaboradoras, setColaboradoras] = useState([]);
  const [loadingColabs, setLoadingColabs] = useState(true);

  const [modo, setModo] = useState('individual'); // 'individual' ou 'todas'
  const [colaboradoraId, setColaboradoraId] = useState('');
  const [dataInicio, setDataInicio] = useState(defaultInicio());
  const [dataFim, setDataFim] = useState(defaultFim());

  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/colaboradoras')
      .then(data => {
        const ativas = (Array.isArray(data) ? data : []).filter(c => c.ativa);
        setColaboradoras(ativas);
      })
      .catch(() => toast.error('Erro ao carregar colaboradoras'))
      .finally(() => setLoadingColabs(false));
  }, []);

  async function handleFiltrar() {
    if (modo === 'individual' && !colaboradoraId) {
      toast.warning('Selecione uma colaboradora');
      return;
    }
    setLoading(true);
    try {
      const url = modo === 'todas'
        ? `/comissoes?data_inicio=${dataInicio}&data_fim=${dataFim}&todas=true`
        : `/comissoes?colaboradora_id=${colaboradoraId}&data_inicio=${dataInicio}&data_fim=${dataFim}`;
      const data = await api.get(url);
      setResultado(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function exportarCSV() {
    if (!resultado) return;

    if (modo === 'todas') {
      // Exportar consolidado
      const headers = ['Colaboradora', 'Atendimentos', 'Valor Total', 'Comissao Total'];
      const rows = resultado.resultados.map(r => [
        r.colaboradora.nome,
        r.total_atendimentos,
        r.total_servicos_valor.toFixed(2).replace('.', ','),
        r.total_comissao.toFixed(2).replace('.', ','),
      ]);
      const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `comissoes_todas_${dataInicio}_${dataFim}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // Exportar individual
      const headers = ['Data', 'Cliente', 'Servico', 'Valor Cobrado', '% Participacao', 'Comissao'];
      const rows = resultado.itens.map(item => [
        item.data,
        item.cliente,
        item.servico,
        item.preco_cobrado.toFixed(2).replace('.', ','),
        item.percentual_participacao,
        item.valor_comissao.toFixed(2).replace('.', ','),
      ]);
      const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `comissoes_${resultado.colaboradora?.nome || 'relatorio'}_${dataInicio}_${dataFim}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }

  const columns = [
    {
      key: 'data',
      label: 'Data',
      render: (val) => { const d = val ? val.slice(0,10) : ''; return d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR') : ''; },
    },
    { key: 'cliente', label: 'Cliente' },
    {
      key: 'servico',
      label: 'Servico',
      render: (val, row) =>
        row.outras_colaboradoras && row.outras_colaboradoras.length > 0
          ? `${val} (com ${row.outras_colaboradoras.join(', ')})`
          : val,
    },
    {
      key: 'preco_cobrado',
      label: 'Valor cobrado',
      render: (val) => `R$ ${formatCurrency(val)}`,
    },
    {
      key: 'percentual_participacao',
      label: '% Participacao',
      render: (val) => `${val}%`,
    },
    {
      key: 'comissao_padrao_usada',
      label: '% Comissao (usado)',
      render: (val) => `${val}%`,
    },
    {
      key: 'valor_comissao',
      label: 'Comissao',
      render: (val) => `R$ ${formatCurrency(val)}`,
    },
  ];

  const columnsTodas = [
    { key: 'nome_colaboradora', label: 'Colaboradora' },
    { key: 'total_atendimentos', label: 'Atendimentos' },
    {
      key: 'total_servicos_valor',
      label: 'Valor total',
      render: (val) => `R$ ${formatCurrency(val)}`,
    },
    {
      key: 'percentual_comissao_medio_usado',
      label: '% Comissao (usado)',
      render: (val) => `${val}%`,
    },
    {
      key: 'total_comissao',
      label: 'Comissao total',
      render: (val) => `R$ ${formatCurrency(val)}`,
    },
  ];

  if (loadingColabs) {
    return <p className="text-gray-500">Carregando...</p>;
  }

  return (
    <div>
      <h2 className="font-title text-2xl text-gray-800 mb-6">Comissoes</h2>

      {/* Mode selector */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Modo de calculo:</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="modo"
              value="individual"
              checked={modo === 'individual'}
              onChange={(e) => {
                setModo(e.target.value);
                setResultado(null);
              }}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Colaboradora individual</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="modo"
              value="todas"
              checked={modo === 'todas'}
              onChange={(e) => {
                setModo(e.target.value);
                setResultado(null);
              }}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Todas as colaboradoras</span>
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          {modo === 'individual' && (
            <FormField label="Colaboradora" required>
              <select
                value={colaboradoraId}
                onChange={(e) => setColaboradoraId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">Selecione...</option>
                {colaboradoras.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="De">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FormField>
          <FormField label="Até">
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FormField>
          <button
            type="button"
            onClick={handleFiltrar}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40"
          >
            {loading ? 'Calculando...' : 'Calcular'}
          </button>
        </div>
      </div>

      {/* Results */}
      {resultado && modo === 'individual' && (
        <>
          {/* Summary card */}
          <div className="bg-primary-light rounded-lg border border-primary/20 p-4 mb-4">
            <h3 className="font-semibold text-gray-700 mb-3">
              Resumo — {resultado.colaboradora?.nome}
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total de servicos</p>
                <p className="text-xl font-semibold text-gray-800">{resultado.total_atendimentos}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Valor total</p>
                <p className="text-xl font-semibold text-gray-800">
                  R$ {formatCurrency(resultado.total_servicos_valor)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Comissao total</p>
                <p className="text-xl font-semibold text-primary">
                  R$ {formatCurrency(resultado.total_comissao)}
                </p>
              </div>
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">Detalhamento</h3>
              {resultado.itens?.length > 0 && (
                <button
                  type="button"
                  onClick={exportarCSV}
                  className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light"
                >
                  Exportar CSV
                </button>
              )}
            </div>
            <DataTable
              columns={columns}
              data={resultado.itens || []}
              emptyMessage="Nenhuma comissao encontrada no periodo"
            />
          </div>
        </>
      )}

      {/* Results - Todas mode */}
      {resultado && modo === 'todas' && (
        <>
          {/* Summary card */}
          <div className="bg-primary-light rounded-lg border border-primary/20 p-4 mb-4">
            <h3 className="font-semibold text-gray-700 mb-3">
              Resumo do período
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total de colaboradoras</p>
                <p className="text-xl font-semibold text-gray-800">{resultado.resultados.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Comissao total</p>
                <p className="text-xl font-semibold text-primary">
                  R$ {formatCurrency(resultado.total_geral_comissao)}
                </p>
              </div>
            </div>
          </div>

          {/* Consolidated table */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">Comissoes por colaboradora</h3>
              {resultado.resultados?.length > 0 && (
                <button
                  type="button"
                  onClick={exportarCSV}
                  className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light"
                >
                  Exportar CSV
                </button>
              )}
            </div>
            <DataTable
              columns={columnsTodas}
              data={resultado.resultados.map(r => ({
                nome_colaboradora: r.colaboradora.nome,
                total_atendimentos: r.total_atendimentos,
                total_servicos_valor: r.total_servicos_valor,
                percentual_comissao_medio_usado: r.percentual_comissao_medio_usado,
                total_comissao: r.total_comissao,
              })) || []}
              emptyMessage="Nenhuma comissao encontrada no periodo"
            />
          </div>
        </>
      )}

      {!resultado && !loading && (
        <p className="text-gray-400 text-sm text-center py-8">
          Selecione o modo e o período para visualizar as comissoes
        </p>
      )}
    </div>
  );
}
