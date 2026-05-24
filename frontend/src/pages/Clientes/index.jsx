import { useState, useEffect, useCallback } from 'react';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import SearchInput from '../../components/SearchInput.jsx';
import FormField from '../../components/FormField.jsx';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR');
}

function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  }
  return raw;
}

function isBirthdayThisMonth(dataNascimento) {
  if (!dataNascimento) return false;
  const today = new Date();
  const birth = new Date(dataNascimento + 'T00:00:00');
  return birth.getMonth() === today.getMonth();
}

function calcAge(dataNascimento) {
  if (!dataNascimento) return null;
  const birth = new Date(dataNascimento + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function phoneMask(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}

const emptyForm = { nome: '', telefone: '', data_nascimento: '', observacoes: '' };

export default function Clientes() {
  const toast = useToast();
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal form
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Detail panel
  const [detailClient, setDetailClient] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedAtd, setExpandedAtd] = useState({});

  const fetchClientes = useCallback(async (busca) => {
    setLoading(true);
    try {
      const path = busca ? `/clientes?q=${encodeURIComponent(busca)}` : '/clientes';
      const data = await api.get(path);
      setClientes(data);
    } catch (err) {
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleSearch = useCallback((term) => {
    setSearchTerm(term);
    fetchClientes(term);
  }, [fetchClientes]);

  // Form
  function openNewModal() {
    setEditing(null);
    setForm(emptyForm);
    setFormErrors({});
    setModalOpen(true);
  }

  function openEditModal(cliente) {
    setEditing(cliente);
    setForm({
      nome: cliente.nome || '',
      telefone: cliente.telefone || '',
      data_nascimento: cliente.data_nascimento || '',
      observacoes: cliente.observacoes || '',
    });
    setFormErrors({});
    setModalOpen(true);
  }

  function validateForm() {
    const errors = {};
    if (!form.nome.trim() || form.nome.trim().length < 2) {
      errors.nome = 'Nome deve ter pelo menos 2 caracteres';
    }
    if (form.telefone) {
      const digits = form.telefone.replace(/\D/g, '');
      if (digits.length > 0 && digits.length !== 11) {
        errors.telefone = 'Telefone deve ter 11 digitos (DDD + numero)';
      }
    }
    if (form.observacoes && form.observacoes.length > 500) {
      errors.observacoes = 'Maximo 500 caracteres';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Popup telefone duplicado
  const [telefoneDuplicado, setTelefoneDuplicado] = useState(null);

  async function verificarTelefone(telefone) {
    if (!telefone || telefone.replace(/\D/g, '').length < 10) return;
    try {
      const result = await api.get(`/clientes/verificar-telefone?telefone=${encodeURIComponent(telefone)}`);
      if (result && (!editing || result.id !== editing.id)) {
        setTelefoneDuplicado(result);
      } else {
        setTelefoneDuplicado(null);
      }
    } catch { setTelefoneDuplicado(null); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      const body = {
        nome: form.nome.trim(),
        telefone: form.telefone || null,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes || null,
      };

      if (editing) {
        await api.put(`/clientes/${editing.id}`, body);
        toast.success('Cliente atualizada com sucesso');
      } else {
        const res = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.ok) {
          if (res.status === 409) {
            setTelefoneDuplicado(json.data);
            setSaving(false);
            return;
          }
          throw new Error(json.error || 'Erro ao salvar');
        }
        toast.success('Cliente salva com sucesso');
      }
      setModalOpen(false);
      setTelefoneDuplicado(null);
      fetchClientes(searchTerm);
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  }

  // Delete
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/clientes/${deleteTarget.id}`);
      toast.success('Cliente removida');
      setDeleteTarget(null);
      if (detailClient?.id === deleteTarget.id) {
        setDetailClient(null);
      }
      fetchClientes(searchTerm);
    } catch (err) {
      toast.error(err.message || 'Erro ao remover cliente');
    }
  }

  // Detail
  async function openDetail(cliente) {
    setDetailClient(cliente);
    setLoadingDetail(true);
    setExpandedAtd({});
    try {
      const [r, h] = await Promise.all([
        api.get(`/clientes/${cliente.id}/resumo`),
        api.get(`/clientes/${cliente.id}/historico`),
      ]);
      setResumo(r);
      setHistorico(h);
    } catch (err) {
      toast.error('Erro ao carregar detalhes');
    } finally {
      setLoadingDetail(false);
    }
  }

  function toggleAtd(id) {
    setExpandedAtd(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // Table columns
  const columns = [
    {
      key: 'nome',
      label: 'Nome',
      render: (val, row) => (
        <span className="font-medium text-gray-800">
          {val}
          {isBirthdayThisMonth(row.data_nascimento) && (
            <span className="ml-2 text-xs bg-alert-warning text-white px-1.5 py-0.5 rounded-full" title="Aniversariante do mes">
              Aniver.
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (val) => <span className="text-gray-600">{formatPhone(val) || '—'}</span>,
    },
    {
      key: 'updated_at',
      label: 'Ultima visita',
      render: (_val, row) => <span className="text-gray-500">{formatDate(row.updated_at)}</span>,
    },
    {
      key: 'acoes',
      label: 'Acoes',
      render: (_val, row) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openDetail(row); }}
            className="text-xs text-primary hover:text-primary-hover px-2 py-1 rounded hover:bg-primary-light transition-colors"
          >
            Ver
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
            className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            Editar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            className="text-xs text-alert-danger hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
          >
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-title text-2xl text-gray-800">Clientes</h2>
        <button
          onClick={openNewModal}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-hover transition-colors"
        >
          Nova cliente
        </button>
      </div>

      {/* Search */}
      <div className="mb-4 max-w-md">
        <SearchInput
          placeholder="Buscar por nome ou telefone..."
          onSearch={handleSearch}
          debounce={300}
        />
      </div>

      {/* Content */}
      <div className={`flex gap-6 ${detailClient ? '' : ''}`}>
        {/* Table */}
        <div className={detailClient ? 'flex-1 min-w-0' : 'w-full'}>
          {loading ? (
            <p className="text-gray-400 text-sm py-8 text-center">Carregando...</p>
          ) : (
            <DataTable
              columns={columns}
              data={clientes}
              emptyMessage="Nenhuma cliente encontrada"
            />
          )}
        </div>

        {/* Detail panel */}
        {detailClient && (
          <div className="w-96 flex-shrink-0 border border-gray-200 rounded-xl bg-white p-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">{detailClient.nome}</h3>
              <button
                onClick={() => setDetailClient(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {loadingDetail ? (
              <p className="text-gray-400 text-sm text-center py-4">Carregando...</p>
            ) : (
              <>
                {/* Client info */}
                <div className="space-y-1 text-sm mb-4">
                  <p><span className="text-gray-500">Telefone:</span> {formatPhone(detailClient.telefone) || '—'}</p>
                  <p>
                    <span className="text-gray-500">Nascimento:</span>{' '}
                    {detailClient.data_nascimento
                      ? `${formatDate(detailClient.data_nascimento)} (${calcAge(detailClient.data_nascimento)} anos)`
                      : '—'}
                  </p>
                  {detailClient.observacoes && (
                    <p><span className="text-gray-500">Obs:</span> {detailClient.observacoes}</p>
                  )}
                </div>

                {/* Resumo stats */}
                {resumo && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-semibold text-primary">{resumo.total_atendimentos}</p>
                      <p className="text-xs text-gray-500">Visitas</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-semibold text-primary">{formatCurrency(resumo.total_gasto)}</p>
                      <p className="text-xs text-gray-500">Total gasto</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-sm font-medium text-gray-700">{resumo.servico_mais_frequente || '—'}</p>
                      <p className="text-xs text-gray-500">Servico favorito</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-sm font-medium text-gray-700">
                        {resumo.dias_desde_ultima_visita != null ? `${resumo.dias_desde_ultima_visita} dias` : '—'}
                      </p>
                      <p className="text-xs text-gray-500">Desde ultima visita</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => openEditModal(detailClient)}
                    className="text-xs text-primary border border-primary px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(detailClient)}
                    className="text-xs text-alert-danger border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Excluir
                  </button>
                </div>

                {/* Historico */}
                <h4 className="font-semibold text-gray-700 text-sm mb-2">Historico de atendimentos</h4>
                {historico.length === 0 ? (
                  <p className="text-gray-400 text-xs">Nenhum atendimento registrado</p>
                ) : (
                  <div className="space-y-2">
                    {historico.map(atd => (
                      <div key={atd.id} className="border border-gray-100 rounded-lg">
                        <button
                          onClick={() => toggleAtd(atd.id)}
                          className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div>
                            <span className="text-xs text-gray-500">{formatDate(atd.data_hora)}</span>
                            <span className="ml-2 text-sm font-medium text-gray-800">{formatCurrency(atd.valor_total)}</span>
                          </div>
                          <span className="text-gray-400 text-xs">{expandedAtd[atd.id] ? '▲' : '▼'}</span>
                        </button>
                        {expandedAtd[atd.id] && (
                          <div className="px-3 pb-2 border-t border-gray-50">
                            {/* Pagamentos */}
                            {atd.pagamentos?.length > 0 && (
                              <div className="mt-1 mb-2">
                                <span className="text-xs text-gray-500">Pagamento: </span>
                                {atd.pagamentos.map((p, i) => (
                                  <span key={i} className="text-xs text-gray-600">
                                    {i > 0 && ' + '}{p.forma} {formatCurrency(p.valor)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Itens */}
                            {atd.itens?.map(item => (
                              <div key={item.id} className="flex justify-between text-xs py-0.5">
                                <span className="text-gray-700">{item.descricao}</span>
                                <span className="text-gray-500">{formatCurrency(item.preco_cobrado)}</span>
                              </div>
                            ))}
                            {atd.observacao && (
                              <p className="text-xs text-gray-400 mt-1 italic">{atd.observacao}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar cliente' : 'Nova cliente'}>
        <form onSubmit={handleSubmit}>
          <FormField label="Nome" required error={formErrors.nome}>
            <input
              type="text"
              value={form.nome}
              onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Nome da cliente"
            />
          </FormField>
          <FormField label="Telefone" error={formErrors.telefone}>
            <input
              type="text"
              value={form.telefone}
              onChange={e => {
                setForm(prev => ({ ...prev, telefone: phoneMask(e.target.value) }));
                setTelefoneDuplicado(null);
              }}
              onBlur={e => !editing && verificarTelefone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="(XX) 9XXXX-XXXX"
            />
            {telefoneDuplicado && (
              <div className="mt-2 bg-pink-50 border border-primary/30 rounded-lg p-3">
                <p className="text-sm font-semibold text-primary">⚠️ Telefone já cadastrado!</p>
                <p className="text-sm text-gray-700 mt-0.5">
                  Este número pertence à cliente <strong>{telefoneDuplicado.nome}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setTelefoneDuplicado(null);
                    openDetail(telefoneDuplicado);
                  }}
                  className="mt-2 text-xs text-primary underline hover:no-underline"
                >
                  Ver ficha de {telefoneDuplicado.nome} →
                </button>
              </div>
            )}
          </FormField>
          <FormField label="Data de nascimento">
            <input
              type="date"
              value={form.data_nascimento}
              onChange={e => setForm(prev => ({ ...prev, data_nascimento: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FormField>
          <FormField label="Observacoes" error={formErrors.observacoes}>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(prev => ({ ...prev, observacoes: e.target.value }))}
              maxLength={500}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              placeholder="Observacoes sobre a cliente..."
            />
            <p className="text-xs text-gray-400 mt-0.5 text-right">{form.observacoes.length}/500</p>
          </FormField>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir cliente"
        message={`Tem certeza que deseja excluir "${deleteTarget?.nome}"? Se houver atendimentos vinculados, a cliente sera desativada.`}
      />
    </div>
  );
}
