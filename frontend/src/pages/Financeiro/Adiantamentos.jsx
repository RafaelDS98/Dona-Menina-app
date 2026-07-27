import { useState, useEffect, useCallback } from 'react';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Autocomplete from '../../components/Autocomplete.jsx';

const FORMAS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credito', label: 'Crédito' },
  { value: 'debito', label: 'Débito' },
  { value: 'especie', label: 'Dinheiro' },
];

const STATUS_LABEL = {
  aberto: { texto: 'Em aberto', cls: 'bg-amber-100 text-amber-700' },
  usado: { texto: 'Usado na comanda', cls: 'bg-green-100 text-green-700' },
  devolvido: { texto: 'Devolvido', cls: 'bg-gray-200 text-gray-600' },
};

function formatCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FORM_VAZIO = { cliente: null, valor: '', forma: 'pix', data: hojeISO(), observacao: '' };

export default function Adiantamentos() {
  const toast = useToast();
  const [lista, setLista] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('aberto');
  const [loading, setLoading] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [confirmDevolver, setConfirmDevolver] = useState(null);
  const [confirmExcluir, setConfirmExcluir] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filtroStatus === 'todos' ? '' : `?status=${filtroStatus}`;
      const data = await api.get(`/adiantamentos${qs}`);
      setLista(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Erro ao carregar adiantamentos: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, toast]);

  useEffect(() => { carregar(); }, [carregar]);

  const fetchClientes = useCallback(async (query) => {
    return api.get('/clientes?q=' + encodeURIComponent(query));
  }, []);

  async function salvar() {
    if (!form.cliente || !form.valor || Number(form.valor) <= 0) return;
    setSalvando(true);
    try {
      await api.post('/adiantamentos', {
        cliente_id: form.cliente.id,
        valor: Number(form.valor),
        forma: form.forma,
        data: form.data,
        observacao: form.observacao || null,
      });
      toast.success('Adiantamento registrado! Ele entrará no fechamento do dia e será sugerido na próxima comanda da cliente.');
      setModalAberto(false);
      setForm(FORM_VAZIO);
      carregar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function devolver(id) {
    try {
      await api.put(`/adiantamentos/${id}/devolver`, {});
      toast.success('Adiantamento marcado como devolvido.');
      carregar();
    } catch (e) { toast.error(e.message); }
  }

  async function excluir(id) {
    try {
      await api.delete(`/adiantamentos/${id}`);
      toast.success('Adiantamento excluído.');
      carregar();
    } catch (e) { toast.error(e.message); }
  }

  const totalAberto = lista.filter(a => a.status === 'aberto').reduce((s, a) => s + Number(a.valor), 0);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          {['aberto', 'usado', 'devolvido', 'todos'].map(st => (
            <button key={st} onClick={() => setFiltroStatus(st)}
              className={`px-3 py-1.5 rounded-full text-sm border capitalize ${filtroStatus === st ? 'bg-primary text-white border-primary font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {st === 'aberto' ? 'Em aberto' : st}
            </button>
          ))}
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModalAberto(true); }}
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary-hover">
          + Registrar adiantamento
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
        💡 Registre aqui o <strong>sinal</strong> no momento em que a cliente pagar. O valor entra no caixa do dia
        e, ao abrir a comanda dessa cliente, o sistema avisa e aplica o abatimento automaticamente — sem risco de cobrar
        ou contar duas vezes.
        {totalAberto > 0 && <span className="block mt-1 font-semibold">Total em aberto: R$ {formatCurrency(totalAberto)}</span>}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center bg-white rounded-lg border">Nenhum adiantamento {filtroStatus !== 'todos' ? `com status "${filtroStatus}"` : 'registrado'}.</p>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b bg-gray-50">
                <th className="text-left py-2.5 px-4">Data</th>
                <th className="text-left py-2.5 px-4">Cliente</th>
                <th className="text-right py-2.5 px-4">Valor</th>
                <th className="text-left py-2.5 px-4">Forma</th>
                <th className="text-left py-2.5 px-4">Status</th>
                <th className="text-left py-2.5 px-4">Observação</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(a => (
                <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2.5 px-4 whitespace-nowrap">{a.data?.split('-').reverse().join('/')}</td>
                  <td className="py-2.5 px-4 font-medium text-gray-800">{a.cliente_nome || '—'}</td>
                  <td className="py-2.5 px-4 text-right font-semibold">R$ {formatCurrency(a.valor)}</td>
                  <td className="py-2.5 px-4">{(FORMAS.find(f => f.value === a.forma) || {}).label || a.forma}</td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${(STATUS_LABEL[a.status] || {}).cls || ''}`}>
                      {(STATUS_LABEL[a.status] || {}).texto || a.status}
                    </span>
                    {a.status === 'usado' && a.atendimento_id && <span className="text-xs text-gray-400 ml-1">#{a.atendimento_id}</span>}
                  </td>
                  <td className="py-2.5 px-4 text-gray-500">{a.observacao || '—'}</td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    {a.status === 'aberto' && (
                      <>
                        <button onClick={() => setConfirmDevolver(a)} className="text-xs text-gray-500 border rounded px-2 py-1 mr-1 hover:bg-gray-100">Devolver</button>
                        <button onClick={() => setConfirmExcluir(a)} className="text-xs text-alert-danger border border-alert-danger/40 rounded px-2 py-1 hover:bg-red-50">Excluir</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title="Registrar adiantamento (sinal)">
        <FormField label="Cliente" required>
          {form.cliente ? (
            <div className="flex items-center justify-between bg-primary-light rounded-lg px-3 py-2">
              <span className="text-primary font-medium">{form.cliente.nome}</span>
              <button type="button" onClick={() => setForm(f => ({ ...f, cliente: null }))} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
          ) : (
            <Autocomplete
              placeholder="Buscar por nome ou telefone..."
              fetchOptions={fetchClientes}
              onSelect={(c) => setForm(f => ({ ...f, cliente: c }))}
              displayKey="nome"
              renderOption={(c) => <span>{c.nome} {c.telefone && <span className="text-gray-400 ml-1">- {c.telefone}</span>}</span>}
            />
          )}
        </FormField>
        <div className="flex gap-3">
          <FormField label="Valor (R$)" required>
            <input type="number" step="0.01" min="0.01" value={form.valor}
              onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </FormField>
          <FormField label="Forma de pagamento" required>
            <select value={form.forma} onChange={(e) => setForm(f => ({ ...f, forma: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Data do recebimento" required>
          <input type="date" value={form.data} onChange={(e) => setForm(f => ({ ...f, data: e.target.value }))}
            className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </FormField>
        <FormField label="Observação">
          <input type="text" value={form.observacao} onChange={(e) => setForm(f => ({ ...f, observacao: e.target.value }))}
            placeholder="Ex.: sinal do mega hair de sábado"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={() => setModalAberto(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando || !form.cliente || !form.valor || Number(form.valor) <= 0}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40">
            {salvando ? 'Salvando…' : 'Registrar'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDevolver}
        onClose={() => setConfirmDevolver(null)}
        onConfirm={() => { devolver(confirmDevolver.id); setConfirmDevolver(null); }}
        title="Devolver adiantamento"
        message={confirmDevolver ? `Confirmar devolução de R$ ${formatCurrency(confirmDevolver.valor)} para ${confirmDevolver.cliente_nome}? O valor sai dos adiantamentos em aberto.` : ''}
        confirmText="Sim, devolver"
      />
      <ConfirmDialog
        open={!!confirmExcluir}
        onClose={() => setConfirmExcluir(null)}
        onConfirm={() => { excluir(confirmExcluir.id); setConfirmExcluir(null); }}
        title="Excluir adiantamento"
        message={confirmExcluir ? `Excluir o adiantamento de R$ ${formatCurrency(confirmExcluir.valor)} de ${confirmExcluir.cliente_nome}? Use apenas para lançamentos errados.` : ''}
        confirmText="Sim, excluir"
        danger
      />
    </div>
  );
}
