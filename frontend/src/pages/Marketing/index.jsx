import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import DataTable from '../../components/DataTable.jsx';

const FILTROS = [
  { key: 'todas', label: 'Todas' },
  { key: 'recentes', label: 'Recentes (30 dias)' },
  { key: 'inativas', label: 'Inativas (60+ dias)' },
  { key: 'aniversariantes', label: 'Aniversariantes do mes' },
];

const MSG_TEMPLATE = 'Ola {nome}! Temos uma novidade especial para voce no Dona Menina Beauty Bar. Venha conferir!';

export default function Marketing() {
  const toast = useToast();
  const [filtro, setFiltro] = useState('todas');
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState(MSG_TEMPLATE);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const sendingRef = useRef(false);

  const loadClientes = useCallback(async (f) => {
    setLoading(true);
    try {
      const data = await api.get(`/marketing/disparo?filtro=${f}`);
      setClientes(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e.message);
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadClientes(filtro);
  }, [filtro, loadClientes]);

  function handleFiltro(key) {
    setFiltro(key);
  }

  function buildMessage(nome) {
    return mensagem.replace(/\{nome\}/g, nome);
  }

  function previewMessage() {
    if (clientes.length === 0) return mensagem.replace(/\{nome\}/g, 'Maria');
    return buildMessage(clientes[0].nome);
  }

  async function enviarWhatsApp() {
    if (clientes.length === 0) {
      toast.warning('Nenhuma cliente na lista');
      return;
    }
    if (!mensagem.trim()) {
      toast.warning('Escreva uma mensagem antes de enviar');
      return;
    }
    setSending(true);
    sendingRef.current = true;
    setSendProgress({ current: 0, total: clientes.length });

    for (let i = 0; i < clientes.length; i++) {
      if (!sendingRef.current) break;
      const c = clientes[i];
      const text = buildMessage(c.nome);
      const url = `https://wa.me/${c.telefone_limpo}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      setSendProgress({ current: i + 1, total: clientes.length });

      if (i < clientes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    sendingRef.current = false;
    setSending(false);
    toast.success('Disparo concluido');
  }

  function cancelarEnvio() {
    sendingRef.current = false;
    setSending(false);
    toast.warning('Envio cancelado');
  }

  async function copiarTelefones() {
    if (clientes.length === 0) {
      toast.warning('Nenhuma cliente na lista');
      return;
    }
    const phones = clientes.map(c => c.telefone_limpo || c.telefone).join(', ');
    try {
      await navigator.clipboard.writeText(phones);
      toast.success('Telefones copiados para a area de transferencia');
    } catch {
      toast.error('Nao foi possivel copiar. Tente manualmente.');
    }
  }

  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'telefone', label: 'Telefone' },
    {
      key: 'ultima_visita',
      label: 'Ultima visita',
      render: (v) => {
        if (!v) return 'Nunca';
        const d = v.includes('T') || v.includes(' ') ? new Date(v.replace(' ', 'T')) : new Date(v + 'T00:00:00');
        return isNaN(d) ? 'Nunca' : d.toLocaleDateString('pt-BR');
      },
    },
  ];

  return (
    <div>
      <h2 className="font-title text-2xl text-gray-800 mb-2">Marketing</h2>
      <p className="text-sm text-gray-500 mb-6">Disparo de mensagens via WhatsApp</p>

      {/* Step 1 — Selecionar publico */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="font-semibold text-gray-700 text-sm mb-3">1. Selecionar publico</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => handleFiltro(f.key)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                filtro === f.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-4">Carregando...</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-2">
              <strong>{clientes.length}</strong> cliente(s) selecionada(s)
            </p>
            <DataTable columns={columns} data={clientes} emptyMessage="Nenhuma cliente encontrada para este filtro" />
          </>
        )}
      </div>

      {/* Step 2 — Escrever mensagem */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="font-semibold text-gray-700 text-sm mb-2">2. Escrever mensagem</h3>
        <p className="text-xs text-gray-400 mb-2">Use <code className="bg-gray-100 px-1 rounded">{'{nome}'}</code> para inserir o nome da cliente</p>
        <textarea
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          rows={4}
          placeholder="Digite sua mensagem..."
        />
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Pre-visualizacao:</p>
          <p className="text-sm text-gray-700">{previewMessage()}</p>
        </div>
      </div>

      {/* Step 3 — Enviar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-700 text-sm mb-3">3. Enviar</h3>
        <p className="text-xs text-gray-500 mb-3">
          O WhatsApp Web sera aberto para cada cliente. Voce precisara clicar em "Enviar" manualmente em cada conversa.
        </p>

        {sending && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-600">
                {sendProgress.current} de {sendProgress.total}
              </span>
            </div>
            <p className="text-sm text-gray-600">Enviando {sendProgress.current} de {sendProgress.total}...</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {sending ? (
            <button
              onClick={cancelarEnvio}
              className="px-4 py-2 text-sm text-white bg-alert-danger rounded-lg hover:opacity-90"
            >
              Cancelar envio
            </button>
          ) : (
            <button
              onClick={enviarWhatsApp}
              disabled={clientes.length === 0 || !mensagem.trim()}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              Enviar para {clientes.length} cliente(s)
            </button>
          )}
          <button
            onClick={copiarTelefones}
            disabled={clientes.length === 0 || sending}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Copiar lista de telefones
          </button>
        </div>
      </div>
    </div>
  );
}
