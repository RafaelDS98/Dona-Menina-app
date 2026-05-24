import { useState, useEffect, useCallback } from 'react';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import FormField from '../../components/FormField.jsx';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TABS = [
  { key: 'colaboradoras', label: 'Colaboradoras' },
  { key: 'servicos', label: 'Servicos' },
  { key: 'salao', label: 'Salao' },
];

// ─── Colaboradoras Tab ───────────────────────────────────────────
function TabColaboradoras() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome: '', funcao: '', comissao_padrao: '' });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await api.delete(`/colaboradoras/${deleteTarget.id}`);
      if (result?.desativada) {
        toast.success(`${deleteTarget.nome} foi desativada pois possui historico de atendimentos`);
      } else {
        toast.success(`${deleteTarget.nome} excluida com sucesso`);
      }
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get('/colaboradoras'));
    } catch { toast.error('Erro ao carregar colaboradoras'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openNew() {
    setEditing(null);
    setForm({ nome: '', funcao: '', comissao_padrao: '' });
    setFormErrors({});
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      nome: row.nome || '',
      funcao: row.funcao || '',
      comissao_padrao: row.comissao_padrao != null ? String(row.comissao_padrao) : '',
    });
    setFormErrors({});
    setModalOpen(true);
  }

  function validate() {
    const errors = {};
    if (!form.nome.trim()) errors.nome = 'Nome obrigatorio';
    const comissao = Number(form.comissao_padrao);
    if (form.comissao_padrao === '' || isNaN(comissao) || comissao < 0 || comissao > 100) {
      errors.comissao_padrao = 'Deve ser entre 0 e 100';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        nome: form.nome.trim(),
        funcao: form.funcao.trim(),
        comissao_padrao: Number(form.comissao_padrao),
      };
      if (editing) {
        await api.put(`/colaboradoras/${editing.id}`, body);
        toast.success('Colaboradora atualizada');
      } else {
        await api.post('/colaboradoras', body);
        toast.success('Colaboradora criada');
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function toggleStatus(row) {
    try {
      await api.patch(`/colaboradoras/${row.id}/status`);
      toast.success(`${row.nome} ${row.ativa ? 'desativada' : 'ativada'}`);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Erro ao alterar status');
    }
  }

  const columns = [
    { key: 'nome', label: 'Nome', render: (v) => <span className="font-medium text-gray-800">{v}</span> },
    { key: 'funcao', label: 'Funcao', render: (v) => <span className="text-gray-600">{v || '—'}</span> },
    {
      key: 'comissao_padrao', label: 'Comissao %',
      render: (v) => <span className="text-gray-600">{v != null ? `${v}%` : '—'}</span>,
    },
    {
      key: 'ativa', label: 'Status',
      render: (v) => (
        <span className={`text-xs px-2 py-0.5 rounded-full ${v ? 'bg-alert-ok text-white' : 'bg-gray-200 text-gray-500'}`}>
          {v ? 'Ativa' : 'Inativa'}
        </span>
      ),
    },
    {
      key: 'acoes', label: 'Acoes',
      render: (_v, row) => (
        <div className="flex gap-1">
          <button onClick={() => openEdit(row)} className="text-xs text-primary hover:text-primary-hover px-2 py-1 rounded hover:bg-primary-light transition-colors">
            Editar
          </button>
          <button
            onClick={() => toggleStatus(row)}
            className={`text-xs px-2 py-1 rounded transition-colors ${row.ativa ? 'text-alert-warning hover:bg-yellow-50' : 'text-alert-ok hover:bg-green-50'}`}
          >
            {row.ativa ? 'Desativar' : 'Ativar'}
          </button>
          <button
            onClick={() => setDeleteTarget(row)}
            className="text-xs text-alert-danger hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openNew} className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-hover transition-colors">
          Nova colaboradora
        </button>
      </div>
      {loading ? (
        <p className="text-gray-400 text-sm py-8 text-center">Carregando...</p>
      ) : (
        <DataTable columns={columns} data={data} emptyMessage="Nenhuma colaboradora cadastrada" />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar colaboradora' : 'Nova colaboradora'}>
        <form onSubmit={handleSubmit}>
          <FormField label="Nome" required error={formErrors.nome}>
            <input
              type="text" value={form.nome}
              onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Nome da colaboradora"
            />
          </FormField>
          <FormField label="Funcao">
            <input
              type="text" value={form.funcao}
              onChange={e => setForm(p => ({ ...p, funcao: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Ex: Manicure, Esteticista..."
            />
          </FormField>
          <FormField label="Comissao padrao (%)" required error={formErrors.comissao_padrao}>
            <input
              type="number" min="0" max="100" step="any"
              value={form.comissao_padrao}
              onChange={e => setForm(p => ({ ...p, comissao_padrao: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="0-100"
            />
          </FormField>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir colaboradora"
        message={`Deseja excluir "${deleteTarget?.nome}"? Se ela tiver histórico de atendimentos, será apenas desativada para preservar os dados.`}
        confirmText={deleting ? 'Excluindo...' : 'Sim, excluir'}
        danger
      />
    </div>
  );
}
function TabServicos() {
  const toast = useToast();
  const [servicos, setServicos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [loading, setLoading] = useState(true);

  // Service modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome: '', categoria_id: '', preco: '', tempo_min: '', consome_kit_mao: false, consome_kit_pe: false });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catNome, setCatNome] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        api.get(filtroCategoria ? `/servicos?categoria_id=${filtroCategoria}` : '/servicos'),
        api.get('/servicos/categorias'),
      ]);
      setServicos(s);
      setCategorias(c);
    } catch { toast.error('Erro ao carregar servicos'); }
    finally { setLoading(false); }
  }, [toast, filtroCategoria]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openNew() {
    setEditing(null);
    setForm({ nome: '', categoria_id: '', preco: '', tempo_min: '', consome_kit_mao: false, consome_kit_pe: false });
    setFormErrors({});
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      nome: row.nome || '',
      categoria_id: row.categoria_id || '',
      preco: row.preco != null ? String(row.preco) : '',
      tempo_min: row.tempo_min != null ? String(row.tempo_min) : '',
      consome_kit_mao: !!row.consome_kit_mao,
      consome_kit_pe: !!row.consome_kit_pe,
    });
    setFormErrors({});
    setModalOpen(true);
  }

  function validate() {
    const errors = {};
    if (!form.nome.trim()) errors.nome = 'Nome obrigatorio';
    if (!form.preco || Number(form.preco) <= 0) errors.preco = 'Preco deve ser maior que 0';
    if (form.tempo_min && (!Number.isInteger(Number(form.tempo_min)) || Number(form.tempo_min) <= 0)) {
      errors.tempo_min = 'Deve ser inteiro positivo';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        nome: form.nome.trim(),
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        preco: Number(form.preco),
        tempo_min: form.tempo_min ? Number(form.tempo_min) : null,
        consome_kit_mao: form.consome_kit_mao ? 1 : 0,
        consome_kit_pe: form.consome_kit_pe ? 1 : 0,
      };
      if (editing) {
        await api.put(`/servicos/${editing.id}`, body);
        toast.success('Servico atualizado');
      } else {
        await api.post('/servicos', body);
        toast.success('Servico criado');
      }
      setModalOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  async function toggleStatus(row) {
    try {
      await api.patch(`/servicos/${row.id}/status`);
      toast.success(`${row.nome} ${row.ativo ? 'desativado' : 'ativado'}`);
      fetchAll();
    } catch (err) {
      toast.error(err.message || 'Erro ao alterar status');
    }
  }

  const [deleteServico, setDeleteServico] = useState(null);
  const [deletingServico, setDeletingServico] = useState(false);

  async function handleDeleteServico() {
    if (!deleteServico) return;
    setDeletingServico(true);
    try {
      await api.delete(`/servicos/${deleteServico.id}`);
      toast.success(`${deleteServico.nome} excluído`);
      setDeleteServico(null);
      fetchAll();
    } catch (err) {
      toast.error(err.message || 'Erro ao excluir');
    } finally {
      setDeletingServico(false);
    }
  }

  async function handleCreateCategory(e) {
    e.preventDefault();
    if (!catNome.trim()) return;
    setSavingCat(true);
    try {
      await api.post('/servicos/categorias', { nome: catNome.trim() });
      toast.success('Categoria criada');
      setCatModalOpen(false);
      setCatNome('');
      const c = await api.get('/servicos/categorias');
      setCategorias(c);
    } catch (err) {
      toast.error(err.message || 'Erro ao criar categoria');
    } finally { setSavingCat(false); }
  }

  const columns = [
    { key: 'nome', label: 'Nome', render: (v) => <span className="font-medium text-gray-800">{v}</span> },
    { key: 'categoria_nome', label: 'Categoria', render: (v) => <span className="text-gray-600">{v || '—'}</span> },
    { key: 'preco', label: 'Preco', render: (v) => <span className="text-gray-600">{formatCurrency(v)}</span> },
    { key: 'tempo_min', label: 'Tempo (min)', render: (v) => <span className="text-gray-500">{v ? `${v} min` : '—'}</span> },
    {
      key: 'consome_kit_mao', label: 'Kit Mao',
      render: (v) => <span className={v ? 'text-alert-ok' : 'text-gray-300'}>{v ? 'Sim' : 'Nao'}</span>,
    },
    {
      key: 'consome_kit_pe', label: 'Kit Pe',
      render: (v) => <span className={v ? 'text-alert-ok' : 'text-gray-300'}>{v ? 'Sim' : 'Nao'}</span>,
    },
    {
      key: 'ativo', label: 'Status',
      render: (v) => (
        <span className={`text-xs px-2 py-0.5 rounded-full ${v ? 'bg-alert-ok text-white' : 'bg-gray-200 text-gray-500'}`}>
          {v ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      key: 'acoes', label: 'Acoes',
      render: (_v, row) => (
        <div className="flex gap-1">
          <button onClick={() => openEdit(row)} className="text-xs text-primary hover:text-primary-hover px-2 py-1 rounded hover:bg-primary-light transition-colors">
            Editar
          </button>
          <button
            onClick={() => toggleStatus(row)}
            className={`text-xs px-2 py-1 rounded transition-colors ${row.ativo ? 'text-alert-warning hover:bg-yellow-50' : 'text-alert-ok hover:bg-green-50'}`}
          >
            {row.ativo ? 'Desativar' : 'Ativar'}
          </button>
          <button
            onClick={() => setDeleteServico(row)}
            className="text-xs text-alert-danger hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Category filter pills + buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setFiltroCategoria(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!filtroCategoria ? 'bg-primary text-white border-primary' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
        >
          Todas
        </button>
        {categorias.map(cat => (
          <button
            key={cat.id}
            onClick={() => setFiltroCategoria(cat.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filtroCategoria === cat.id ? 'bg-primary text-white border-primary' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            {cat.nome}
          </button>
        ))}
        <button
          onClick={() => { setCatNome(''); setCatModalOpen(true); }}
          className="text-xs text-primary hover:text-primary-hover px-2 py-1"
        >
          + Nova categoria
        </button>
        <div className="ml-auto">
          <button onClick={openNew} className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-hover transition-colors">
            Novo servico
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm py-8 text-center">Carregando...</p>
      ) : (
        <DataTable columns={columns} data={servicos} emptyMessage="Nenhum servico cadastrado" />
      )}

      {/* Service modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar servico' : 'Novo servico'}>
        <form onSubmit={handleSubmit}>
          <FormField label="Nome" required error={formErrors.nome}>
            <input
              type="text" value={form.nome}
              onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Nome do servico"
            />
          </FormField>
          <FormField label="Categoria">
            <select
              value={form.categoria_id}
              onChange={e => setForm(p => ({ ...p, categoria_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
            >
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Preco (R$)" required error={formErrors.preco}>
              <input
                type="number" min="0.01" step="0.01"
                value={form.preco}
                onChange={e => setForm(p => ({ ...p, preco: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="0,00"
              />
            </FormField>
            <FormField label="Tempo (min)" error={formErrors.tempo_min}>
              <input
                type="number" min="1" step="1"
                value={form.tempo_min}
                onChange={e => setForm(p => ({ ...p, tempo_min: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="Ex: 60"
              />
            </FormField>
          </div>
          <div className="flex gap-6 mt-1 mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox" checked={form.consome_kit_mao}
                onChange={e => setForm(p => ({ ...p, consome_kit_mao: e.target.checked }))}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              Consome kit mao
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox" checked={form.consome_kit_pe}
                onChange={e => setForm(p => ({ ...p, consome_kit_pe: e.target.checked }))}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              Consome kit pe
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Category modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Nova categoria">
        <form onSubmit={handleCreateCategory}>
          <FormField label="Nome da categoria" required>
            <input
              type="text" value={catNome}
              onChange={e => setCatNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Ex: Cilios, Unhas..."
            />
          </FormField>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setCatModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={savingCat || !catNome.trim()} className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50">
              {savingCat ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteServico}
        onClose={() => setDeleteServico(null)}
        onConfirm={handleDeleteServico}
        title="Excluir serviço"
        message={`Deseja excluir "${deleteServico?.nome}"? Esta ação não pode ser desfeita. Se o serviço tiver histórico de atendimentos, a exclusão será bloqueada — use Desativar.`}
        confirmText={deletingServico ? 'Excluindo...' : 'Sim, excluir'}
        danger
      />
    </div>
  );
}

// ─── Salao Tab ───────────────────────────────────────────────────
function TabSalao() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    salao_nome: '',
    endereco: '',
    telefone: '',
    horario_abertura: '09:00',
    horario_fechamento: '19:00',
    backup_intervalo_dias: '7',
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/configuracoes');
        setForm({
          salao_nome: data.salao_nome || '',
          endereco: data.salao_endereco || data.endereco || '',
          telefone: data.salao_telefone || data.telefone || '',
          horario_abertura: data.horario_abertura || '09:00',
          horario_fechamento: data.horario_fechamento || '19:00',
          backup_intervalo_dias: data.backup_intervalo_dias || '7',
        });
      } catch { toast.error('Erro ao carregar configuracoes'); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/configuracoes', {
        salao_nome: form.salao_nome,
        salao_endereco: form.endereco,
        salao_telefone: form.telefone,
        horario_abertura: form.horario_abertura,
        horario_fechamento: form.horario_fechamento,
        backup_intervalo_dias: Number(form.backup_intervalo_dias),
      });
      toast.success('Configuracoes salvas');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-gray-400 text-sm py-8 text-center">Carregando...</p>;

  return (
    <form onSubmit={handleSave} className="max-w-lg">
      <FormField label="Nome do salao">
        <input
          type="text" value={form.salao_nome}
          onChange={e => setForm(p => ({ ...p, salao_nome: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </FormField>
      <FormField label="Endereco">
        <input
          type="text" value={form.endereco}
          onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </FormField>
      <FormField label="Telefone">
        <input
          type="text" value={form.telefone}
          onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Horario de abertura">
          <input
            type="time" value={form.horario_abertura}
            onChange={e => setForm(p => ({ ...p, horario_abertura: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </FormField>
        <FormField label="Horario de fechamento">
          <input
            type="time" value={form.horario_fechamento}
            onChange={e => setForm(p => ({ ...p, horario_fechamento: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </FormField>
      </div>
      <FormField label="Intervalo de backup (dias)">
        <input
          type="number" min="1" value={form.backup_intervalo_dias}
          onChange={e => setForm(p => ({ ...p, backup_intervalo_dias: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </FormField>
      <div className="mt-4">
        <button type="submit" disabled={saving} className="bg-primary text-white px-6 py-2 rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50 transition-colors">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Configuracoes Page ─────────────────────────────────────
export default function Configuracoes() {
  const [activeTab, setActiveTab] = useState('colaboradoras');

  return (
    <div>
      <h2 className="font-title text-2xl text-gray-800 mb-6">Configuracoes</h2>

      {/* Tab nav */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'colaboradoras' && <TabColaboradoras />}
      {activeTab === 'servicos' && <TabServicos />}
      {activeTab === 'salao' && <TabSalao />}
    </div>
  );
}
