import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';
import DataTable from '../../components/DataTable.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormField from '../../components/FormField.jsx';

const TABS = ['Visao Geral', 'Saidas', 'Promocoes'];

const PERIOD_SHORTCUTS = [
  { label: 'Hoje', key: 'hoje' },
  { label: 'Esta semana', key: 'semana' },
  { label: 'Personalizado', key: 'personalizado' },
];

const PAYMENT_LABELS = { pix: 'PIX', credito: 'Credito', debito: 'Debito', especie: 'Especie' };
const PAYMENT_COLORS = { pix: '#22c55e', credito: '#3b82f6', debito: '#f59e0b', especie: '#a855f7' };

function SummaryCard({ label, value, color = 'text-gray-800' }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function formatCurrency(val) {
  return Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function dateRange(key) {
  const today = new Date();
  const yyyy = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  switch (key) {
    case 'hoje':
      return { data_inicio: yyyy(today), data_fim: yyyy(today) };
    case 'semana': {
      const sete = new Date(today);
      sete.setDate(today.getDate() - 6);
      return { data_inicio: yyyy(sete), data_fim: yyyy(today) };
    }
    case 'mes':
      return {
        data_inicio: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
        data_fim: yyyy(today),
      };
    case 'mes_passado': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { data_inicio: yyyy(first), data_fim: yyyy(last) };
    }
    default:
      return { data_inicio: '', data_fim: '' };
  }
}

const EMPTY_SAIDA = { data: '', descricao: '', marca: '', valor_unit: '', quantidade: 1, fornecedor: '' };
const EMPTY_PROMO = { nome: '', descricao: '', preco: '', data_inicio: '', data_fim: '', servico_ids: [] };

export default function Financeiro() {
  const toast = useToast();
  const [tab, setTab] = useState(0);
  const [periodKey, setPeriodKey] = useState('hoje');
  const [customRange, setCustomRange] = useState({ data_inicio: '', data_fim: '' });
  const [loading, setLoading] = useState(false);
  const [loadingSaidas, setLoadingSaidas] = useState(false);
  const [erroPeriodo, setErroPeriodo] = useState('');

  // Visao Geral state
  const [resumo, setResumo] = useState(null);
  const [porServico, setPorServico] = useState([]);
  const [porPagamento, setPorPagamento] = useState([]);

  // Saidas state
  const [saidas, setSaidas] = useState([]);
  const [saidaModal, setSaidaModal] = useState(false);
  const [saidaEdit, setSaidaEdit] = useState(null);
  const [saidaForm, setSaidaForm] = useState(EMPTY_SAIDA);
  const [savingSaida, setSavingSaida] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

  // Promocoes state
  const [promocoes, setPromocoes] = useState([]);
  const [promoModal, setPromoModal] = useState(false);
  const [promoEdit, setPromoEdit] = useState(null);
  const [promoForm, setPromoForm] = useState(EMPTY_PROMO);
  const [savingPromo, setSavingPromo] = useState(false);
  const [servicos, setServicos] = useState([]);
  const [confirmDeletePromo, setConfirmDeletePromo] = useState(null);

  const period = useMemo(() => {
    if (periodKey === 'personalizado') {
      // Validar limite de 7 dias
      if (customRange.data_inicio && customRange.data_fim) {
        const inicio = new Date(customRange.data_inicio + 'T00:00:00');
        const fim = new Date(customRange.data_fim + 'T00:00:00');
        const diffDias = (fim - inicio) / (1000 * 60 * 60 * 24);
        if (diffDias > 7) {
          return { data_inicio: '', data_fim: '' }; // bloqueia a busca
        }
      }
      return customRange;
    }
    return dateRange(periodKey);
  }, [periodKey, customRange]);

  const qs = useMemo(() => {
    if (!period.data_inicio || !period.data_fim) return '';
    return `?data_inicio=${period.data_inicio}&data_fim=${period.data_fim}`;
  }, [period]);

  // Load data based on active tab
  const loadVisaoGeral = useCallback(async () => {
    if (!qs) return;
    setLoading(true);
    try {
      const [res, srv, pag] = await Promise.all([
        api.get(`/financeiro/resumo${qs}`),
        api.get(`/financeiro/por-servico${qs}`),
        api.get(`/financeiro/por-forma-pagamento${qs}`),
      ]);
      setResumo(res);
      setPorServico(srv);
      setPorPagamento(pag);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [qs, toast]);

  const loadSaidas = useCallback(async () => {
    if (!qs) return;
    setLoadingSaidas(true);
    try {
      const data = await api.get(`/financeiro/saidas${qs}`);
      setSaidas(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingSaidas(false);
    }
  }, [qs, toast]);

  const loadPromocoes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/promocoes');
      setPromocoes(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadServicos = useCallback(async () => {
    try {
      const data = await api.get('/servicos');
      setServicos(Array.isArray(data) ? data : []);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    if (tab === 0) loadVisaoGeral();
    else if (tab === 1) loadSaidas();
    else if (tab === 2) { loadPromocoes(); loadServicos(); }
  }, [tab, qs, loadVisaoGeral, loadSaidas, loadPromocoes, loadServicos]);

  // Period filter
  function handlePeriod(key) {
    setPeriodKey(key);
    if (key !== 'personalizado') setCustomRange({ data_inicio: '', data_fim: '' });
  }

  // -- Saidas CRUD --
  function openNewSaida() {
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    setSaidaEdit(null);
    setSaidaForm({ ...EMPTY_SAIDA, data: today });
    setSaidaModal(true);
  }

  function openEditSaida(row) {
    setSaidaEdit(row);
    setSaidaForm({
      data: row.data,
      descricao: row.descricao,
      marca: row.marca || '',
      valor_unit: row.valor_unit,
      quantidade: row.quantidade,
      fornecedor: row.fornecedor || '',
    });
    setSaidaModal(true);
  }

  async function saveSaida() {
    if (!saidaForm.descricao || !saidaForm.valor_unit || !saidaForm.data) {
      toast.warning('Preencha os campos obrigatorios');
      return;
    }
    setSavingSaida(true);
    try {
      const body = {
        data: saidaForm.data,
        descricao: saidaForm.descricao,
        marca: saidaForm.marca || null,
        valor_unit: Number(saidaForm.valor_unit),
        quantidade: Number(saidaForm.quantidade) || 1,
        fornecedor: saidaForm.fornecedor || null,
      };
      let savedId = null;
      if (saidaEdit) {
        await api.put(`/financeiro/saidas/${saidaEdit.id}`, body);
        savedId = Number(saidaEdit.id);
        toast.success('Saida atualizada');
      } else {
        const created = await api.post('/financeiro/saidas', body);
        savedId = created?.id ? Number(created.id) : null;
        toast.success('Saida registrada');
      }
      setSaidaModal(false);
      if (savedId) setHighlightId(savedId);
      await loadSaidas();
      if (savedId) setTimeout(() => setHighlightId(null), 3000);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingSaida(false);
    }
  }

  async function deleteSaida(id) {
    try {
      await api.delete(`/financeiro/saidas/${id}`);
      toast.success('Saida excluida');
      loadSaidas();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // -- Promocoes CRUD --
  function openNewPromo() {
    setPromoEdit(null);
    setPromoForm({ ...EMPTY_PROMO });
    setPromoModal(true);
  }

  function openEditPromo(promo) {
    setPromoEdit(promo);
    setPromoForm({
      nome: promo.nome,
      descricao: promo.descricao || '',
      preco: promo.preco,
      data_inicio: promo.data_inicio,
      data_fim: promo.data_fim,
      servico_ids: (promo.servicos || []).map(s => s.id),
    });
    setPromoModal(true);
  }

  async function savePromo() {
    if (!promoForm.nome || !promoForm.preco || !promoForm.data_inicio || !promoForm.data_fim) {
      toast.warning('Preencha os campos obrigatorios');
      return;
    }
    setSavingPromo(true);
    try {
      const body = {
        nome: promoForm.nome,
        descricao: promoForm.descricao || null,
        preco: Number(promoForm.preco),
        data_inicio: promoForm.data_inicio,
        data_fim: promoForm.data_fim,
        servico_ids: promoForm.servico_ids,
      };
      if (promoEdit) {
        await api.put(`/promocoes/${promoEdit.id}`, body);
        toast.success('Promocao atualizada');
      } else {
        await api.post('/promocoes', body);
        toast.success('Promocao criada');
      }
      setPromoModal(false);
      loadPromocoes();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingPromo(false);
    }
  }

  async function deletePromo(id) {
    try {
      await api.delete(`/promocoes/${id}`);
      toast.success('Promocao excluida');
      loadPromocoes();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function toggleServicoId(id) {
    setPromoForm(prev => {
      const ids = prev.servico_ids.includes(id)
        ? prev.servico_ids.filter(x => x !== id)
        : [...prev.servico_ids, id];
      return { ...prev, servico_ids: ids };
    });
  }

  function promoStatus(promo) {
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    if (!promo.ativa) return 'encerrada';
    if (promo.data_inicio > today) return 'futura';
    if (promo.data_fim < today) return 'encerrada';
    return 'ativa';
  }

  const statusBadge = {
    ativa: 'bg-alert-ok text-white',
    encerrada: 'bg-gray-300 text-gray-700',
    futura: 'bg-blue-500 text-white',
  };

  const statusLabel = { ativa: 'ATIVA', encerrada: 'ENCERRADA', futura: 'FUTURA' };

  // Saidas columns
  const saidasColumns = [
    { key: 'data', label: 'Data', render: (v) => formatDate(v) },
    { key: 'descricao', label: 'Descricao' },
    { key: 'marca', label: 'Marca', render: (v) => v || '-' },
    { key: 'quantidade', label: 'Qtd' },
    { key: 'valor_unit', label: 'Valor Unit.', render: (v) => `R$ ${formatCurrency(v)}` },
    { key: 'valor_total', label: 'Valor Total', render: (v) => `R$ ${formatCurrency(v)}` },
    { key: 'fornecedor', label: 'Fornecedor', render: (v) => v || '-' },
    {
      key: 'acoes', label: 'Acoes', render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => openEditSaida(row)} className="text-xs text-primary hover:underline">Editar</button>
          <button onClick={() => setConfirmDelete(row.id)} className="text-xs text-alert-danger hover:underline">Excluir</button>
        </div>
      ),
    },
  ];

  const totalSaidas = saidas.reduce((s, r) => s + Number(r.valor_total || 0), 0);

  // Chart data
  const topServicos = porServico.slice(0, 8);
  const maxServicoQtd = topServicos.length ? Math.max(...topServicos.map(s => s.quantidade)) : 1;
  const totalPagamento = porPagamento.reduce((s, p) => s + Number(p.valor_total || 0), 0);

  return (
    <div>
      <h2 className="font-title text-2xl text-gray-800 mb-4">Financeiro</h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === i ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Period filter — show on tabs 0 and 1 */}
      {tab < 2 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {PERIOD_SHORTCUTS.map(p => (
            <button
              key={p.key}
              onClick={() => handlePeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                periodKey === p.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
          {periodKey === 'personalizado' && (
            <div className="flex flex-col gap-1">
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={customRange.data_inicio}
                  onChange={e => {
                    const novoInicio = e.target.value;
                    setCustomRange(prev => ({ ...prev, data_inicio: novoInicio }));
                    if (novoInicio && customRange.data_fim) {
                      const diff = (new Date(customRange.data_fim) - new Date(novoInicio)) / (1000 * 60 * 60 * 24);
                      setErroPeriodo(diff > 7 ? 'O período selecionado não pode ser maior que 7 dias.' : '');
                    }
                  }}
                  className={`border rounded px-2 py-1 text-sm ${erroPeriodo ? 'border-red-400' : 'border-gray-300'}`}
                />
                <span className="text-gray-400 text-sm">ate</span>
                <input
                  type="date"
                  value={customRange.data_fim}
                  onChange={e => {
                    const novoFim = e.target.value;
                    setCustomRange(prev => ({ ...prev, data_fim: novoFim }));
                    if (customRange.data_inicio && novoFim) {
                      const diff = (new Date(novoFim) - new Date(customRange.data_inicio)) / (1000 * 60 * 60 * 24);
                      setErroPeriodo(diff > 7 ? 'O período selecionado não pode ser maior que 7 dias.' : '');
                    }
                  }}
                  className={`border rounded px-2 py-1 text-sm ${erroPeriodo ? 'border-red-400' : 'border-gray-300'}`}
                />
              </div>
              {erroPeriodo && (
                <p className="text-xs text-red-500 font-medium">{erroPeriodo}</p>
              )}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-gray-400 py-4">Carregando...</p>}

      {/* Tab 0 — Visao Geral */}
      {tab === 0 && !loading && resumo && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <SummaryCard label="Total de atendimentos" value={resumo.total_atendimentos} />
            <SummaryCard
              label={
                periodKey === 'hoje' ? 'Faturamento de hoje' :
                periodKey === 'semana' ? 'Faturamento da semana' :
                'Faturamento do período'
              }
              value={`R$ ${formatCurrency(resumo.faturamento_hoje ?? resumo.faturamento_bruto)}`}
              color="text-alert-ok"
            />
            <SummaryCard label="Total de saídas" value={`R$ ${formatCurrency(resumo.total_saidas)}`} color="text-alert-danger" />
            {/* TODO: exibir apenas para perfil Administrador (a implementar futuramente) */}
            {/* <SummaryCard label="Faturamento bruto" value={`R$ ${formatCurrency(resumo.faturamento_bruto)}`} color="text-alert-ok" /> */}
            {/* <SummaryCard label="Saldo" value={`R$ ${formatCurrency(resumo.saldo)}`} color={resumo.saldo >= 0 ? 'text-alert-ok' : 'text-alert-danger'} /> */}
          </div>

          {/* Bar chart: Top servicos */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Top servicos</h3>
            {topServicos.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhum servico no periodo</p>
            ) : (
              <div className="space-y-2">
                {topServicos.map(item => (
                  <div key={item.servico} className="flex items-center gap-2">
                    <span className="w-36 text-xs text-gray-600 truncate" title={item.servico}>{item.servico}</span>
                    <div className="flex-1 bg-gray-100 rounded h-6 relative">
                      <div
                        className="bg-primary h-6 rounded"
                        style={{ width: `${(item.quantidade / maxServicoQtd) * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                        {item.quantidade}x
                      </span>
                    </div>
                    <span className="w-24 text-xs text-right text-gray-600">R$ {formatCurrency(item.valor_total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Formas de pagamento</h3>
            {porPagamento.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhum dado no periodo</p>
            ) : (
              <div>
                {/* Stacked bar */}
                <div className="flex rounded-lg overflow-hidden h-8 mb-3">
                  {porPagamento.map(p => {
                    const pct = totalPagamento ? (Number(p.valor_total) / totalPagamento) * 100 : 0;
                    return (
                      <div
                        key={p.forma}
                        style={{ width: `${pct}%`, backgroundColor: PAYMENT_COLORS[p.forma] || '#94a3b8' }}
                        className="h-full flex items-center justify-center text-white text-xs font-medium"
                        title={`${PAYMENT_LABELS[p.forma] || p.forma}: R$ ${formatCurrency(p.valor_total)}`}
                      >
                        {pct > 8 ? `${Math.round(pct)}%` : ''}
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-4">
                  {porPagamento.map(p => (
                    <div key={p.forma} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: PAYMENT_COLORS[p.forma] || '#94a3b8' }} />
                      {PAYMENT_LABELS[p.forma] || p.forma}: R$ {formatCurrency(p.valor_total)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 1 — Saidas */}
      {tab === 1 && (
        <div>
          {loadingSaidas && <p className="text-sm text-gray-400 py-4">Carregando...</p>}
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-500">{saidas.length} registro(s)</span>
            <button onClick={openNewSaida} className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:opacity-90">
              Registrar saida
            </button>
          </div>
          <DataTable columns={saidasColumns} data={saidas} emptyMessage="Nenhuma saida no periodo" highlightId={highlightId} />
          {saidas.length > 0 && (
            <div className="flex justify-end mt-2 pr-3">
              <span className="text-sm font-semibold text-gray-700">
                Total: R$ {formatCurrency(totalSaidas)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tab 2 — Promocoes */}
      {tab === 2 && !loading && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-500">{promocoes.length} promocao(oes)</span>
            <button onClick={openNewPromo} className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:opacity-90">
              Nova promocao
            </button>
          </div>
          {promocoes.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Nenhuma promocao cadastrada</p>
          ) : (
            <div className="grid gap-4">
              {promocoes.map(promo => {
                const st = promoStatus(promo);
                return (
                  <div key={promo.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-800">{promo.nome}</h4>
                        {promo.descricao && <p className="text-xs text-gray-500 mt-0.5">{promo.descricao}</p>}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[st]}`}>
                        {statusLabel[st]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-2">
                      <span>R$ {formatCurrency(promo.preco)}</span>
                      <span>{formatDate(promo.data_inicio)} — {formatDate(promo.data_fim)}</span>
                    </div>
                    {promo.servicos && promo.servicos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {promo.servicos.map(s => (
                          <span key={s.id} className="bg-primary-light text-primary text-xs px-2 py-0.5 rounded-full">
                            {s.nome}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => openEditPromo(promo)} className="text-xs text-primary hover:underline">Editar</button>
                      <button onClick={() => setConfirmDeletePromo(promo.id)} className="text-xs text-alert-danger hover:underline">Excluir</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Saida Modal */}
      <Modal open={saidaModal} onClose={() => setSaidaModal(false)} title={saidaEdit ? 'Editar saida' : 'Registrar saida'}>
        <FormField label="Data" required>
          <input
            type="date"
            value={saidaForm.data}
            onChange={e => setSaidaForm(p => ({ ...p, data: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </FormField>
        <FormField label="Descricao" required>
          <input
            type="text"
            value={saidaForm.descricao}
            onChange={e => setSaidaForm(p => ({ ...p, descricao: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Acetona 500ml"
          />
        </FormField>
        <FormField label="Marca">
          <input
            type="text"
            value={saidaForm.marca}
            onChange={e => setSaidaForm(p => ({ ...p, marca: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Valor unitario (R$)" required>
            <input
              type="number"
              step="0.01"
              min="0"
              value={saidaForm.valor_unit}
              onChange={e => setSaidaForm(p => ({ ...p, valor_unit: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Quantidade" required>
            <input
              type="number"
              min="1"
              value={saidaForm.quantidade}
              onChange={e => setSaidaForm(p => ({ ...p, quantidade: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </FormField>
        </div>
        {saidaForm.valor_unit && saidaForm.quantidade && (
          <p className="text-sm text-gray-600 mb-3">
            Valor total: <strong>R$ {formatCurrency(Number(saidaForm.valor_unit) * Number(saidaForm.quantidade))}</strong>
          </p>
        )}
        <FormField label="Fornecedor">
          <input
            type="text"
            value={saidaForm.fornecedor}
            onChange={e => setSaidaForm(p => ({ ...p, fornecedor: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setSaidaModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={saveSaida}
            disabled={savingSaida}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {savingSaida ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>

      {/* Promocao Modal */}
      <Modal open={promoModal} onClose={() => setPromoModal(false)} title={promoEdit ? 'Editar promocao' : 'Nova promocao'} wide>
        <FormField label="Nome" required>
          <input
            type="text"
            value={promoForm.nome}
            onChange={e => setPromoForm(p => ({ ...p, nome: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Combo Noiva"
          />
        </FormField>
        <FormField label="Descricao">
          <textarea
            value={promoForm.descricao}
            onChange={e => setPromoForm(p => ({ ...p, descricao: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            rows={2}
          />
        </FormField>
        <FormField label="Preco (R$)" required>
          <input
            type="number"
            step="0.01"
            min="0"
            value={promoForm.preco}
            onChange={e => setPromoForm(p => ({ ...p, preco: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Data inicio" required>
            <input
              type="date"
              value={promoForm.data_inicio}
              onChange={e => setPromoForm(p => ({ ...p, data_inicio: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Data fim" required>
            <input
              type="date"
              value={promoForm.data_fim}
              onChange={e => setPromoForm(p => ({ ...p, data_fim: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </FormField>
        </div>
        <FormField label="Servicos incluidos">
          <div className="max-h-48 overflow-auto border border-gray-200 rounded-lg p-2">
            {servicos.length === 0 ? (
              <p className="text-gray-400 text-xs">Nenhum servico cadastrado</p>
            ) : (
              servicos.map(s => (
                <label key={s.id} className="flex items-center gap-2 py-1 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-1 rounded">
                  <input
                    type="checkbox"
                    checked={promoForm.servico_ids.includes(s.id)}
                    onChange={() => toggleServicoId(s.id)}
                    className="accent-primary"
                  />
                  {s.nome}
                </label>
              ))
            )}
          </div>
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setPromoModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={savePromo}
            disabled={savingPromo}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {savingPromo ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { deleteSaida(confirmDelete); setConfirmDelete(null); }}
        title="Excluir saida"
        message="Tem certeza que deseja excluir esta saida?"
        confirmText="Excluir"
        danger
      />

      <ConfirmDialog
        open={!!confirmDeletePromo}
        onClose={() => setConfirmDeletePromo(null)}
        onConfirm={() => { deletePromo(confirmDeletePromo); setConfirmDeletePromo(null); }}
        title="Excluir promocao"
        message="Tem certeza que deseja excluir esta promocao?"
        confirmText="Excluir"
        danger
      />
    </div>
  );
}

