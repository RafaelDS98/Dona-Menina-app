import { useState, useEffect, useCallback } from 'react';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import FormField from '../../components/FormField.jsx';

const STATUS_CONFIG = {
  ok:      { border: 'border-alert-ok',      bg: 'bg-alert-ok/10',      text: 'text-alert-ok',      icon: '\u2713', label: 'Estoque OK' },
  atencao: { border: 'border-alert-warning',  bg: 'bg-alert-warning/10',  text: 'text-alert-warning',  icon: '\u26A0', label: 'Hora de reabastecer' },
  urgente: { border: 'border-alert-urgent',   bg: 'bg-alert-urgent/10',   text: 'text-alert-urgent',   icon: '\u26A0', label: 'Poucos kits disponíveis' },
  critico: { border: 'border-alert-danger',   bg: 'bg-alert-danger/10',   text: 'text-alert-danger',   icon: '\uD83D\uDD34', label: 'Kits acabando! Reabastecer agora' },
};

const formatCurrency = (val) => {
  if (val == null) return '—';
  return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
};

const calcMargem = (custo, venda) => {
  if (!custo || custo === 0) return '—';
  return `${(((venda - custo) / custo) * 100).toFixed(1)}%`;
};

// ─── Kit Card ──────────────────────────────────────────────
function KitCard({ kit, onUpdateQty, onConfigLimites }) {
  const st = STATUS_CONFIG[kit.status] || STATUS_CONFIG.ok;
  const titulo = kit.tipo === 'mao' ? 'Kit Mão' : 'Kit Pé';
  const emoji = kit.tipo === 'mao' ? '\u270B' : '\uD83E\uDDB6';

  return (
    <div className={`rounded-xl border-2 ${st.border} ${st.bg} p-6 flex flex-col items-center gap-4 flex-1`}>
      <span className="text-4xl">{emoji}</span>
      <h3 className="font-title text-lg font-semibold text-gray-800">{titulo}</h3>
      <div className="text-center">
        <span className="text-5xl font-bold text-gray-800">{kit.quantidade}</span>
        <p className="text-sm text-gray-500 mt-1">unidades</p>
      </div>
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${st.text} ${st.bg}`}>
        {st.icon} {st.label}
      </span>
      <div className="flex gap-2 mt-2 w-full">
        <button
          onClick={() => onUpdateQty(kit)}
          className="flex-1 px-3 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 transition-opacity"
        >
          Atualizar quantidade
        </button>
        <button
          onClick={() => onConfigLimites(kit)}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Configurar limites
        </button>
      </div>
    </div>
  );
}

// ─── Kit Quantity Modal ────────────────────────────────────
function KitQtyModal({ open, onClose, kit, onSaved }) {
  const toast = useToast();
  const [quantidade, setQuantidade] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && kit) setQuantidade(String(kit.quantidade));
  }, [open, kit]);

  const handleSave = async () => {
    const val = parseInt(quantidade, 10);
    if (isNaN(val) || val < 0) {
      toast.error('Quantidade deve ser um número >= 0');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/estoque/kits/${kit.tipo}`, { quantidade: val });
      toast.success('Quantidade atualizada!');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const titulo = kit?.tipo === 'mao' ? 'Kit Mão' : 'Kit Pé';

  return (
    <Modal open={open} onClose={onClose} title={`Atualizar quantidade — ${titulo}`}>
      <FormField label="Nova quantidade total" required>
        <input
          type="number"
          min="0"
          value={quantidade}
          onChange={e => setQuantidade(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </FormField>
      <p className="text-xs text-gray-400 mb-4">Informe o total de kits prontos após reabastecimento</p>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Kit Limites Modal ─────────────────────────────────────
function KitLimitesModal({ open, onClose, kit, onSaved }) {
  const toast = useToast();
  const [atencao, setAtencao] = useState('');
  const [urgente, setUrgente] = useState('');
  const [critico, setCritico] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && kit) {
      setAtencao(String(kit.alerta_atencao));
      setUrgente(String(kit.alerta_urgente));
      setCritico(String(kit.alerta_critico));
    }
  }, [open, kit]);

  const handleSave = async () => {
    const a = parseInt(atencao, 10);
    const u = parseInt(urgente, 10);
    const c = parseInt(critico, 10);
    if (isNaN(a) || isNaN(u) || isNaN(c)) {
      toast.error('Todos os campos são obrigatórios');
      return;
    }
    if (!(c < u && u < a)) {
      toast.error('Deve ser: crítico < urgente < atenção');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/estoque/kits/${kit.tipo}/limites`, {
        alerta_atencao: a,
        alerta_urgente: u,
        alerta_critico: c,
      });
      toast.success('Limites atualizados!');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const titulo = kit?.tipo === 'mao' ? 'Kit Mão' : 'Kit Pé';

  return (
    <Modal open={open} onClose={onClose} title={`Configurar limites — ${titulo}`}>
      <FormField label="Limite atenção" required>
        <input
          type="number"
          min="0"
          value={atencao}
          onChange={e => setAtencao(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </FormField>
      <FormField label="Limite urgente" required>
        <input
          type="number"
          min="0"
          value={urgente}
          onChange={e => setUrgente(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </FormField>
      <FormField label="Limite crítico" required>
        <input
          type="number"
          min="0"
          value={critico}
          onChange={e => setCritico(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </FormField>
      <p className="text-xs text-gray-400 mb-4">Validação: crítico &lt; urgente &lt; atenção</p>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Product Form Modal (Create / Edit) ────────────────────
function ProdutoFormModal({ open, onClose, produto, onSaved, apiPath = '/estoque/lojinha', titulo = 'produto' }) {
  const toast = useToast();
  const isEdit = !!produto;
  const [form, setForm] = useState({ nome: '', marca: '', preco_custo: '', preco_venda: '', quantidade: '0', alerta_minimo: '0' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (produto) {
        setForm({
          nome: produto.nome || '',
          marca: produto.marca || '',
          preco_custo: produto.preco_custo != null ? String(produto.preco_custo) : '',
          preco_venda: produto.preco_venda != null ? String(produto.preco_venda) : '',
          quantidade: String(produto.quantidade ?? 0),
          alerta_minimo: String(produto.alerta_minimo ?? 0),
        });
      } else {
        setForm({ nome: '', marca: '', preco_custo: '', preco_venda: '', quantidade: '0', alerta_minimo: '0' });
      }
    }
  }, [open, produto]);

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!form.preco_venda || Number(form.preco_venda) <= 0) { toast.error('Preço de venda é obrigatório e deve ser > 0'); return; }

    const body = {
      nome: form.nome.trim(),
      marca: form.marca.trim() || null,
      preco_custo: form.preco_custo ? Number(form.preco_custo) : null,
      preco_venda: Number(form.preco_venda),
      quantidade: parseInt(form.quantidade, 10) || 0,
      alerta_minimo: parseInt(form.alerta_minimo, 10) || 0,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`${apiPath}/${produto.id}`, body);
        toast.success(`${titulo.charAt(0).toUpperCase() + titulo.slice(1)} atualizado!`);
      } else {
        await api.post(apiPath, body);
        toast.success(`${titulo.charAt(0).toUpperCase() + titulo.slice(1)} criado!`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar produto' : 'Novo produto'}>
      <FormField label="Nome" required>
        <input type="text" value={form.nome} onChange={set('nome')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
      </FormField>
      <FormField label="Marca">
        <input type="text" value={form.marca} onChange={set('marca')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Preço custo">
          <input type="number" step="0.01" min="0" value={form.preco_custo} onChange={set('preco_custo')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
        </FormField>
        <FormField label="Preço venda" required>
          <input type="number" step="0.01" min="0" value={form.preco_venda} onChange={set('preco_venda')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
        </FormField>
      </div>
      {!isEdit && (
        <FormField label="Quantidade">
          <input type="number" min="0" value={form.quantidade} onChange={set('quantidade')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
        </FormField>
      )}
      <FormField label="Alerta mínimo">
        <input type="number" min="0" value={form.alerta_minimo} onChange={set('alerta_minimo')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
      </FormField>
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Stock Adjust Modal ────────────────────────────────────
function AjustarEstoqueModal({ open, onClose, produto, onSaved, apiPath = '/estoque/lojinha' }) {
  const toast = useToast();
  const [operacao, setOperacao] = useState('set');
  const [valor, setValor] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setOperacao('set');
      setValor(produto ? String(produto.quantidade) : '');
    }
  }, [open, produto]);

  const handleSave = async () => {
    const v = parseInt(valor, 10);
    if (isNaN(v) || v < 0) { toast.error('Valor deve ser um número >= 0'); return; }
    setSaving(true);
    try {
      await api.patch(`${apiPath}/${produto.id}/estoque`, { operacao, valor: v });
      toast.success('Estoque ajustado!');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Ajustar estoque — ${produto?.nome || ''}`}>
      <FormField label="Operação" required>
        <select
          value={operacao}
          onChange={e => setOperacao(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        >
          <option value="set">Definir valor absoluto</option>
          <option value="add">Adicionar</option>
          <option value="subtract">Subtrair</option>
        </select>
      </FormField>
      <FormField label="Valor" required>
        <input
          type="number"
          min="0"
          value={valor}
          onChange={e => setValor(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </FormField>
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Estoque Page ─────────────────────────────────────
export default function Estoque() {
  const toast = useToast();
  const [tab, setTab] = useState('kits');

  // Kits state
  const [kits, setKits] = useState([]);
  const [loadingKits, setLoadingKits] = useState(true);
  const [qtyModalKit, setQtyModalKit] = useState(null);
  const [limitesModalKit, setLimitesModalKit] = useState(null);

  // Lojinha state
  const [produtos, setProdutos] = useState([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [alertaOnly, setAlertaOnly] = useState(false);
  const [buscaLojinha, setBuscaLojinha] = useState('');
  const [produtoFormOpen, setProdutoFormOpen] = useState(false);
  const [editProduto, setEditProduto] = useState(null);
  const [ajustarProduto, setAjustarProduto] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Freezer state
  const [freezerItens, setFreezerItens] = useState([]);
  const [loadingFreezer, setLoadingFreezer] = useState(true);
  const [buscaFreezer, setBuscaFreezer] = useState('');
  const [freezerFormOpen, setFreezerFormOpen] = useState(false);
  const [editFreezer, setEditFreezer] = useState(null);
  const [ajustarFreezer, setAjustarFreezer] = useState(null);
  const [confirmToggleFreezer, setConfirmToggleFreezer] = useState(null);
  const [confirmDeleteFreezer, setConfirmDeleteFreezer] = useState(null);

  const fetchKits = useCallback(async () => {
    setLoadingKits(true);
    try {
      const data = await api.get('/estoque/kits');
      setKits(data);
    } catch (err) {
      toast.error('Erro ao carregar kits: ' + err.message);
    } finally {
      setLoadingKits(false);
    }
  }, []);

  const fetchProdutos = useCallback(async () => {
    setLoadingProdutos(true);
    try {
      const path = alertaOnly ? '/estoque/lojinha?alerta=true' : '/estoque/lojinha';
      const data = await api.get(path);
      setProdutos(data);
    } catch (err) {
      toast.error('Erro ao carregar produtos: ' + err.message);
    } finally {
      setLoadingProdutos(false);
    }
  }, [alertaOnly]);

  useEffect(() => { fetchKits(); }, [fetchKits]);
  useEffect(() => { fetchProdutos(); }, [fetchProdutos]);

  const fetchFreezer = useCallback(async () => {
    setLoadingFreezer(true);
    try {
      const data = await api.get('/estoque/freezer');
      setFreezerItens(data);
    } catch (err) {
      toast.error('Erro ao carregar freezer: ' + err.message);
    } finally {
      setLoadingFreezer(false);
    }
  }, []);

  useEffect(() => { fetchFreezer(); }, [fetchFreezer]);

  const handleToggleStatus = async (produto) => {
    try {
      await api.patch(`/estoque/lojinha/${produto.id}/status`);
      toast.success(produto.ativo ? 'Produto desativado' : 'Produto ativado');
      fetchProdutos();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleStatusFreezer = async (item) => {
    try {
      await api.patch(`/estoque/freezer/${item.id}/status`);
      toast.success(item.ativo ? 'Item desativado' : 'Item ativado');
      fetchFreezer();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (produto) => {
    try {
      await api.delete(`/estoque/lojinha/${produto.id}`);
      toast.success(`${produto.nome} excluído`);
      fetchProdutos();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteFreezer = async (item) => {
    try {
      await api.delete(`/estoque/freezer/${item.id}`);
      toast.success(`${item.nome} excluído`);
      fetchFreezer();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ─── Lojinha columns ──────────────────────────────────
  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'marca', label: 'Marca', render: (v) => v || '—' },
    {
      key: 'quantidade',
      label: 'Estoque',
      render: (v, row) => {
        const low = v <= (row.alerta_minimo ?? 0);
        return <span className={low ? 'font-semibold text-alert-danger' : ''}>{v}</span>;
      },
    },
    { key: 'alerta_minimo', label: 'Alerta Mín' },
    { key: 'preco_custo', label: 'Preço Custo', render: (v) => formatCurrency(v) },
    { key: 'preco_venda', label: 'Preço Venda', render: (v) => formatCurrency(v) },
    {
      key: '_margem',
      label: 'Margem %',
      render: (_, row) => calcMargem(row.preco_custo, row.preco_venda),
    },
    {
      key: 'ativo',
      label: 'Status',
      render: (v) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v ? 'bg-alert-ok/15 text-alert-ok' : 'bg-gray-200 text-gray-500'}`}>
          {v ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      key: '_acoes',
      label: 'Ações',
      render: (_, row) => (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setAjustarProduto(row)}
            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            Ajustar estoque
          </button>
          <button
            onClick={() => { setEditProduto(row); setProdutoFormOpen(true); }}
            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            Editar
          </button>
          <button
            onClick={() => setConfirmToggle(row)}
            className={`text-xs px-2 py-1 rounded ${row.ativo ? 'border border-alert-danger text-alert-danger hover:bg-alert-danger/10' : 'border border-alert-ok text-alert-ok hover:bg-alert-ok/10'}`}
          >
            {row.ativo ? 'Desativar' : 'Ativar'}
          </button>
          <button
            onClick={() => setConfirmDelete(row)}
            className="text-xs px-2 py-1 rounded border border-red-400 text-red-500 hover:bg-red-50"
          >
            Excluir
          </button>
        </div>
      ),
    },
  ];

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const produtosFiltrados = produtos.filter(p =>
    norm(p.nome).includes(norm(buscaLojinha)) ||
    norm(p.marca).includes(norm(buscaLojinha))
  );

  const freezerFiltrados = freezerItens.filter(p =>
    norm(p.nome).includes(norm(buscaFreezer)) ||
    norm(p.marca).includes(norm(buscaFreezer))
  );

  const columnsFrezer = [
    { key: 'nome', label: 'Nome' },
    { key: 'marca', label: 'Marca', render: (v) => v || '—' },
    {
      key: 'quantidade',
      label: 'Estoque',
      render: (v, row) => {
        const low = v <= (row.alerta_minimo ?? 0);
        return <span className={low ? 'font-semibold text-alert-danger' : ''}>{v}</span>;
      },
    },
    { key: 'alerta_minimo', label: 'Alerta Mín' },
    { key: 'preco_custo', label: 'Preço Custo', render: (v) => formatCurrency(v) },
    { key: 'preco_venda', label: 'Preço Venda', render: (v) => formatCurrency(v) },
    { key: '_margem', label: 'Margem %', render: (_, row) => calcMargem(row.preco_custo, row.preco_venda) },
    {
      key: 'ativo', label: 'Status',
      render: (v) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v ? 'bg-alert-ok/15 text-alert-ok' : 'bg-gray-200 text-gray-500'}`}>
          {v ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      key: '_acoes', label: 'Ações',
      render: (_, row) => (
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setAjustarFreezer(row)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Ajustar estoque</button>
          <button onClick={() => { setEditFreezer(row); setFreezerFormOpen(true); }} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Editar</button>
          <button onClick={() => setConfirmToggleFreezer(row)} className={`text-xs px-2 py-1 rounded ${row.ativo ? 'border border-alert-danger text-alert-danger hover:bg-alert-danger/10' : 'border border-alert-ok text-alert-ok hover:bg-alert-ok/10'}`}>
            {row.ativo ? 'Desativar' : 'Ativar'}
          </button>
          <button onClick={() => setConfirmDeleteFreezer(row)} className="text-xs px-2 py-1 rounded border border-red-400 text-red-500 hover:bg-red-50">
            Excluir
          </button>
        </div>
      ),
    },
  ];

  // ─── Tab bar styles ────────────────────────────────────
  const tabClass = (t) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
      tab === t ? 'bg-white text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div>
      <h2 className="font-title text-2xl text-gray-800 mb-6">Estoque</h2>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button className={tabClass('kits')} onClick={() => setTab('kits')}>
          Kits de Atendimento
        </button>
        <button className={tabClass('lojinha')} onClick={() => setTab('lojinha')}>
          Lojinha
        </button>
        <button className={tabClass('freezer')} onClick={() => setTab('freezer')}>
          🧊 Freezer
        </button>
      </div>

      {/* ─── Tab: Kits ──────────────────────────────── */}
      {tab === 'kits' && (
        <div>
          {loadingKits ? (
            <p className="text-gray-400 text-sm py-8 text-center">Carregando kits...</p>
          ) : kits.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">Nenhum kit encontrado</p>
          ) : (
            <div className="flex gap-6 flex-col sm:flex-row">
              {kits.map(kit => (
                <KitCard
                  key={kit.tipo}
                  kit={kit}
                  onUpdateQty={setQtyModalKit}
                  onConfigLimites={setLimitesModalKit}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Lojinha ───────────────────────────── */}
      {tab === 'lojinha' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-title text-lg text-gray-800">Produtos</h3>
              <input
                type="text"
                placeholder="Buscar produto..."
                value={buscaLojinha}
                onChange={e => setBuscaLojinha(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-48"
              />
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertaOnly}
                  onChange={e => setAlertaOnly(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Mostrar apenas estoque baixo
              </label>
            </div>
            <button
              onClick={() => { setEditProduto(null); setProdutoFormOpen(true); }}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90"
            >
              Novo produto
            </button>
          </div>

          {loadingProdutos ? (
            <p className="text-gray-400 text-sm py-8 text-center">Carregando produtos...</p>
          ) : (
            <DataTable
              columns={columns}
              data={produtosFiltrados}
              emptyMessage={alertaOnly ? 'Nenhum produto com estoque baixo' : 'Nenhum produto encontrado'}
            />
          )}
        </div>
      )}

      {/* ─── Tab: Freezer ───────────────────────────── */}
      {tab === 'freezer' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-title text-lg text-gray-800">🧊 Itens do Freezer</h3>
              <input
                type="text"
                placeholder="Buscar item..."
                value={buscaFreezer}
                onChange={e => setBuscaFreezer(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-48"
              />
            </div>
            <button
              onClick={() => { setEditFreezer(null); setFreezerFormOpen(true); }}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90"
            >
              Novo item
            </button>
          </div>

          {loadingFreezer ? (
            <p className="text-gray-400 text-sm py-8 text-center">Carregando freezer...</p>
          ) : (
            <DataTable
              columns={columnsFrezer}
              data={freezerFiltrados}
              emptyMessage="Nenhum item no freezer"
            />
          )}
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────── */}
      <KitQtyModal
        open={!!qtyModalKit}
        onClose={() => setQtyModalKit(null)}
        kit={qtyModalKit}
        onSaved={fetchKits}
      />
      <KitLimitesModal
        open={!!limitesModalKit}
        onClose={() => setLimitesModalKit(null)}
        kit={limitesModalKit}
        onSaved={fetchKits}
      />
      <ProdutoFormModal
        open={produtoFormOpen}
        onClose={() => { setProdutoFormOpen(false); setEditProduto(null); }}
        produto={editProduto}
        onSaved={fetchProdutos}
      />
      <AjustarEstoqueModal
        open={!!ajustarProduto}
        onClose={() => setAjustarProduto(null)}
        produto={ajustarProduto}
        onSaved={fetchProdutos}
      />
      <ConfirmDialog
        open={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => handleToggleStatus(confirmToggle)}
        title={confirmToggle?.ativo ? 'Desativar produto' : 'Ativar produto'}
        message={`Tem certeza que deseja ${confirmToggle?.ativo ? 'desativar' : 'ativar'} "${confirmToggle?.nome}"?`}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { handleDelete(confirmDelete); setConfirmDelete(null); }}
        title="Excluir produto"
        message={`Deseja excluir "${confirmDelete?.nome}"? Esta ação não pode ser desfeita. Se o produto tiver histórico, a exclusão será bloqueada.`}
        confirmText="Excluir"
        danger
      />
      <ProdutoFormModal
        open={freezerFormOpen}
        onClose={() => { setFreezerFormOpen(false); setEditFreezer(null); }}
        produto={editFreezer}
        onSaved={fetchFreezer}
        apiPath="/estoque/freezer"
        titulo="freezer"
      />
      <AjustarEstoqueModal
        open={!!ajustarFreezer}
        onClose={() => setAjustarFreezer(null)}
        produto={ajustarFreezer}
        onSaved={fetchFreezer}
        apiPath="/estoque/freezer"
      />
      <ConfirmDialog
        open={!!confirmToggleFreezer}
        onClose={() => setConfirmToggleFreezer(null)}
        onConfirm={() => handleToggleStatusFreezer(confirmToggleFreezer)}
        title={confirmToggleFreezer?.ativo ? 'Desativar item' : 'Ativar item'}
        message={`Tem certeza que deseja ${confirmToggleFreezer?.ativo ? 'desativar' : 'ativar'} "${confirmToggleFreezer?.nome}"?`}
      />
      <ConfirmDialog
        open={!!confirmDeleteFreezer}
        onClose={() => setConfirmDeleteFreezer(null)}
        onConfirm={() => { handleDeleteFreezer(confirmDeleteFreezer); setConfirmDeleteFreezer(null); }}
        title="Excluir item do freezer"
        message={`Deseja excluir "${confirmDeleteFreezer?.nome}"? Esta ação não pode ser desfeita. Se o item tiver histórico, a exclusão será bloqueada.`}
        confirmText="Excluir"
        danger
      />
    </div>
  );
}
