import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Autocomplete from '../../components/Autocomplete.jsx';
import FormField from '../../components/FormField.jsx';

const STATUS_CLASSES = {
  agendado: 'bg-status-agendado text-white',
  confirmado: 'bg-status-confirmado text-white',
  concluido: 'bg-status-concluido text-white',
  faltou: 'bg-status-faltou text-white',
};

const STATUS_BADGE = {
  agendado: 'bg-status-agendado/10 text-status-agendado',
  confirmado: 'bg-status-confirmado/10 text-status-confirmado',
  concluido: 'bg-status-concluido/10 text-status-concluido',
  faltou: 'bg-status-faltou/10 text-status-faltou',
  cancelado: 'bg-gray-100 text-gray-500',
};

const PX_PER_HOUR = 60;
const SLOT_HEIGHT = PX_PER_HOUR / 2; // 30px per 30-min slot
const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;

function formatDate(d) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(d) {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function timeSlots() {
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

function generateTimeOptions() {
  const options = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    for (let m = 0; m < 60; m += 15) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
}

const SLOTS = timeSlots();
const TIME_OPTIONS = generateTimeOptions();
const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

// --- Main Component ---

export default function Agenda() {
  const navigate = useNavigate();
  const toast = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('dia');
  const [agendamentos, setAgendamentos] = useState([]);
  const [colaboradoras, setColaboradoras] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [detailModal, setDetailModal] = useState(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  // Load colaboradoras once
  useEffect(() => {
    api.get('/colaboradoras').then(data => {
      setColaboradoras(data.filter(c => c.ativa));
    }).catch(() => toast.error('Erro ao carregar colaboradoras'));
  }, []);

  // Load agendamentos when date or view changes
  const fetchAgendamentos = useCallback(async () => {
    setLoading(true);
    try {
      let data;
      if (viewMode === 'dia') {
        data = await api.get(`/agendamentos?data=${toDateStr(currentDate)}`);
      } else {
        const monday = getMonday(currentDate);
        const sunday = addDays(monday, 6);
        data = await api.get(`/agendamentos?data_inicio=${toDateStr(monday)}&data_fim=${toDateStr(sunday)}`);
      }
      setAgendamentos(data || []);
    } catch {
      toast.error('Erro ao carregar agendamentos');
      setAgendamentos([]);
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode]);

  useEffect(() => { fetchAgendamentos(); }, [fetchAgendamentos]);

  // Filter out cancelados (RN-AGD-04)
  const visibleAgendamentos = useMemo(
    () => agendamentos.filter(a => a.status !== 'cancelado'),
    [agendamentos]
  );

  // Navigation
  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate(prev => addDays(prev, viewMode === 'dia' ? -1 : -7));
  const goNext = () => setCurrentDate(prev => addDays(prev, viewMode === 'dia' ? 1 : 7));

  // Status change
  const changeStatus = async (id, status) => {
    try {
      await api.patch(`/agendamentos/${id}/status`, { status });
      toast.success(`Status atualizado para "${status}"`);
      await fetchAgendamentos();
      setDetailModal(null);
    } catch (err) {
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  const handleStatusChange = (id, status) => {
    if (status === 'cancelado' || status === 'faltou') {
      setConfirmDialog({
        open: true,
        title: status === 'cancelado' ? 'Cancelar agendamento' : 'Marcar como faltou',
        message: status === 'cancelado'
          ? 'Tem certeza que deseja cancelar este agendamento?'
          : 'Confirma que a cliente nao compareceu?',
        onConfirm: () => changeStatus(id, status),
      });
    } else {
      changeStatus(id, status);
    }
  };

  // Navigate to new atendimento
  const goToAtendimento = (ag) => {
    const params = new URLSearchParams({
      agendamento_id: ag.id,
      cliente_id: ag.cliente_id,
      servico_id: ag.servico_id,
      colaboradora_id: ag.colaboradora_id,
    });
    navigate(`/atendimentos/novo?${params.toString()}`);
  };

  // WhatsApp
  const sendWhatsApp = (ag) => {
    const phone = (ag.cliente_telefone || '').replace(/\D/g, '');
    if (!phone) { toast.warning('Cliente sem telefone cadastrado'); return; }
    const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const msg = `Ola ${ag.cliente_nome}, lembramos do seu horario amanha as ${hora} no Dona Menina Beauty Bar!`;
    // TODO: INTEGRACAO BOT
    // Para automacao futura, substituir window.open() por chamada a API do bot
    // Sugestao: Evolution API (https://evolution-api.com)
    // Endpoint esperado: POST /bot/send-message { phone, message }
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // On create success
  const handleCreated = () => {
    setNewModalOpen(false);
    fetchAgendamentos();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-title text-2xl text-gray-800">Agenda</h2>
        <button
          onClick={() => setNewModalOpen(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-hover transition-colors"
        >
          + Novo agendamento
        </button>
      </div>

      {/* Date nav + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white rounded-lg shadow-sm border p-3">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">&larr; Anterior</button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Hoje</button>
          <button onClick={goNext} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Proximo &rarr;</button>
        </div>
        <span className="text-sm font-medium text-gray-700 capitalize">
          {viewMode === 'dia'
            ? formatDate(currentDate)
            : `${toDateStr(getMonday(currentDate))} a ${toDateStr(addDays(getMonday(currentDate), 6))}`}
        </span>
        <div className="flex border rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('dia')}
            className={`px-3 py-1.5 text-sm ${viewMode === 'dia' ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
          >Dia</button>
          <button
            onClick={() => setViewMode('semana')}
            className={`px-3 py-1.5 text-sm ${viewMode === 'semana' ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
          >Semana</button>
        </div>
      </div>

      {/* Loading */}
      {loading && <p className="text-gray-500 text-sm mb-4">Carregando agendamentos...</p>}

      {/* Grid */}
      {!loading && viewMode === 'dia' && (
        <DailyGrid
          agendamentos={visibleAgendamentos}
          colaboradoras={colaboradoras}
          onClickBlock={setDetailModal}
        />
      )}
      {!loading && viewMode === 'semana' && (
        <WeeklyGrid
          monday={getMonday(currentDate)}
          agendamentos={visibleAgendamentos}
          onClickBlock={setDetailModal}
        />
      )}

      {/* Empty state */}
      {!loading && visibleAgendamentos.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-1">Nenhum agendamento para {viewMode === 'dia' ? 'hoje' : 'esta semana'}</p>
          <p className="text-sm">Clique em "Novo agendamento" para adicionar</p>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        agendamento={detailModal}
        onClose={() => setDetailModal(null)}
        onStatusChange={handleStatusChange}
        onGoAtendimento={goToAtendimento}
        onWhatsApp={sendWhatsApp}
      />

      {/* New Appointment Modal */}
      <NewAgendamentoModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        colaboradoras={colaboradoras}
        onCreated={handleCreated}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
      />
    </div>
  );
}

// --- Daily Grid ---

function DailyGrid({ agendamentos, colaboradoras, onClickBlock }) {
  if (colaboradoras.length === 0) {
    return <p className="text-gray-400 text-sm">Nenhuma colaboradora ativa cadastrada</p>;
  }

  const gridHeight = SLOTS.length * SLOT_HEIGHT;

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-auto">
      <div className="flex min-w-[600px]">
        {/* Time column */}
        <div className="flex-shrink-0 w-16 border-r">
          <div className="h-10 border-b bg-gray-50" />
          <div className="relative" style={{ height: gridHeight }}>
            {SLOTS.map((slot, i) => (
              <div
                key={slot}
                className="absolute w-full text-xs text-gray-400 text-right pr-2 -translate-y-1/2"
                style={{ top: i * SLOT_HEIGHT }}
              >
                {slot}
              </div>
            ))}
          </div>
        </div>

        {/* Colaboradora columns */}
        {colaboradoras.map(col => {
          const colAgs = agendamentos.filter(a => a.colaboradora_id === col.id);
          return (
            <div key={col.id} className="flex-1 min-w-[140px] border-r last:border-r-0">
              <div className="h-10 border-b bg-gray-50 flex items-center justify-center text-sm font-medium text-gray-700 px-1 truncate">
                {col.nome}
              </div>
              <div className="relative" style={{ height: gridHeight }}>
                {/* Grid lines */}
                {SLOTS.map((slot, i) => (
                  <div
                    key={slot}
                    className={`absolute w-full border-t ${i % 2 === 0 ? 'border-gray-200' : 'border-gray-100'}`}
                    style={{ top: i * SLOT_HEIGHT }}
                  />
                ))}
                {/* Appointment blocks */}
                {colAgs.map(ag => {
                  const dt = new Date(ag.data_hora);
                  const startMin = (dt.getHours() - OPEN_HOUR) * 60 + dt.getMinutes();
                  const duration = ag.servico_tempo_min || 60;
                  const top = (startMin / 60) * PX_PER_HOUR;
                  const height = Math.max((duration / 60) * PX_PER_HOUR, 20);
                  return (
                    <button
                      key={ag.id}
                      onClick={() => onClickBlock(ag)}
                      className={`absolute left-1 right-1 rounded px-1.5 py-0.5 text-xs cursor-pointer overflow-hidden hover:opacity-90 transition-opacity ${STATUS_CLASSES[ag.status] || 'bg-gray-300 text-white'}`}
                      style={{ top, height }}
                      title={`${ag.cliente_nome} - ${ag.servico_nome}`}
                    >
                      <div className="font-medium truncate">{ag.cliente_nome}</div>
                      {height >= 35 && <div className="truncate opacity-80">{ag.servico_nome}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Weekly Grid ---

function WeeklyGrid({ monday, agendamentos, onClickBlock }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const gridHeight = SLOTS.length * SLOT_HEIGHT;

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-auto">
      <div className="flex min-w-[700px]">
        {/* Time column */}
        <div className="flex-shrink-0 w-16 border-r">
          <div className="h-10 border-b bg-gray-50" />
          <div className="relative" style={{ height: gridHeight }}>
            {SLOTS.map((slot, i) => (
              <div
                key={slot}
                className="absolute w-full text-xs text-gray-400 text-right pr-2 -translate-y-1/2"
                style={{ top: i * SLOT_HEIGHT }}
              >
                {slot}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {days.map((day, di) => {
          const dayStr = toDateStr(day);
          const dayAgs = agendamentos.filter(a => a.data_hora?.startsWith(dayStr));
          const isToday = toDateStr(day) === toDateStr(new Date());
          return (
            <div key={dayStr} className="flex-1 min-w-[90px] border-r last:border-r-0">
              <div className={`h-10 border-b flex flex-col items-center justify-center text-xs ${isToday ? 'bg-primary/10 font-bold' : 'bg-gray-50'}`}>
                <span className="text-gray-500">{WEEKDAYS_SHORT[di]}</span>
                <span className={isToday ? 'text-primary' : 'text-gray-700'}>{day.getDate()}</span>
              </div>
              <div className="relative" style={{ height: gridHeight }}>
                {/* Grid lines */}
                {SLOTS.map((slot, i) => (
                  <div
                    key={slot}
                    className={`absolute w-full border-t ${i % 2 === 0 ? 'border-gray-200' : 'border-gray-100'}`}
                    style={{ top: i * SLOT_HEIGHT }}
                  />
                ))}
                {/* Appointment blocks */}
                {dayAgs.map(ag => {
                  const dt = new Date(ag.data_hora);
                  const startMin = (dt.getHours() - OPEN_HOUR) * 60 + dt.getMinutes();
                  const duration = ag.servico_tempo_min || 60;
                  const top = (startMin / 60) * PX_PER_HOUR;
                  const height = Math.max((duration / 60) * PX_PER_HOUR, 16);
                  return (
                    <button
                      key={ag.id}
                      onClick={() => onClickBlock(ag)}
                      className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 cursor-pointer overflow-hidden hover:opacity-90 transition-opacity ${STATUS_CLASSES[ag.status] || 'bg-gray-300 text-white'}`}
                      style={{ top, height, fontSize: '0.65rem' }}
                      title={`${ag.cliente_nome} - ${ag.servico_nome} (${ag.colaboradora_nome})`}
                    >
                      <div className="truncate font-medium">
                        {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {ag.cliente_nome}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Detail Modal ---

function DetailModal({ agendamento, onClose, onStatusChange, onGoAtendimento, onWhatsApp }) {
  if (!agendamento) return null;
  const ag = agendamento;
  const dt = new Date(ag.data_hora);
  const dataFormatada = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const horaFormatada = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const canAct = ag.status === 'agendado' || ag.status === 'confirmado';

  return (
    <Modal open={!!agendamento} onClose={onClose} title="Detalhes do agendamento">
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ag.status]}`}>
            {ag.status}
          </span>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
          <span className="text-gray-500">Cliente:</span>
          <span className="font-medium">{ag.cliente_nome}</span>

          <span className="text-gray-500">Telefone:</span>
          <span>{ag.cliente_telefone || 'Nao informado'}</span>

          <span className="text-gray-500">Servico:</span>
          <span>{ag.servico_nome}</span>

          <span className="text-gray-500">Colaboradora:</span>
          <span>{ag.colaboradora_nome}</span>

          <span className="text-gray-500">Data:</span>
          <span className="capitalize">{dataFormatada}</span>

          <span className="text-gray-500">Horario:</span>
          <span>{horaFormatada}</span>

          {ag.observacao && (
            <>
              <span className="text-gray-500">Obs:</span>
              <span>{ag.observacao}</span>
            </>
          )}
        </div>

        {/* Actions */}
        {canAct && (
          <div className="flex flex-wrap gap-2 pt-3 border-t">
            {ag.status === 'agendado' && (
              <button
                onClick={() => onStatusChange(ag.id, 'confirmado')}
                className="px-3 py-1.5 text-xs rounded-lg bg-status-confirmado text-white hover:opacity-90"
              >
                Confirmar
              </button>
            )}
            <button
              onClick={() => onGoAtendimento(ag)}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary-hover"
            >
              Registrar atendimento
            </button>
            <button
              onClick={() => onStatusChange(ag.id, 'faltou')}
              className="px-3 py-1.5 text-xs rounded-lg bg-status-faltou text-white hover:opacity-90"
            >
              Faltou
            </button>
            <button
              onClick={() => onStatusChange(ag.id, 'cancelado')}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* WhatsApp */}
        {canAct && ag.cliente_telefone && (
          <div className="pt-2">
            <button
              onClick={() => onWhatsApp(ag)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Lembrete WhatsApp
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// --- New Agendamento Modal ---

function NewAgendamentoModal({ open, onClose, colaboradoras, onCreated }) {
  const toast = useToast();
  const [servicos, setServicos] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    cliente_id: null,
    cliente_nome: '',
    colaboradora_id: '',
    servico_id: '',
    data: '',
    hora: '',
    observacao: '',
  });

  useEffect(() => {
    if (open) {
      api.get('/servicos').then(setServicos).catch(() => {});
      setForm({ cliente_id: null, cliente_nome: '', colaboradora_id: '', servico_id: '', data: '', hora: '', observacao: '' });
    }
  }, [open]);

  const fetchClientes = useCallback(async (query) => {
    return api.get(`/clientes?busca=${encodeURIComponent(query)}`);
  }, []);

  const selectedServico = servicos.find(s => s.id === Number(form.servico_id));

  // Group servicos by categoria
  const servicosByCategoria = useMemo(() => {
    const groups = {};
    for (const s of servicos) {
      const cat = s.categoria_nome || 'Sem categoria';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [servicos]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cliente_id) { toast.error('Selecione uma cliente'); return; }
    if (!form.colaboradora_id) { toast.error('Selecione uma colaboradora'); return; }
    if (!form.data || !form.hora) { toast.error('Informe data e horario'); return; }

    setSaving(true);
    try {
      await api.post('/agendamentos', {
        cliente_id: form.cliente_id,
        colaboradora_id: Number(form.colaboradora_id),
        servico_id: form.servico_id ? Number(form.servico_id) : null,
        data_hora: `${form.data}T${form.hora}`,
        observacao: form.observacao || null,
      });
      toast.success('Agendamento criado com sucesso!');
      onCreated();
    } catch (err) {
      toast.error(err.message || 'Erro ao criar agendamento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo agendamento" wide>
      <form onSubmit={handleSubmit}>
        <FormField label="Cliente" required>
          <Autocomplete
            placeholder="Buscar cliente..."
            fetchOptions={fetchClientes}
            onSelect={(c) => setForm(prev => ({ ...prev, cliente_id: c.id, cliente_nome: c.nome }))}
            displayKey="nome"
            renderOption={(c) => (
              <span>{c.nome} {c.telefone && <span className="text-gray-400 text-xs ml-1">{c.telefone}</span>}</span>
            )}
          />
        </FormField>

        <FormField label="Colaboradora" required>
          <select
            value={form.colaboradora_id}
            onChange={(e) => setForm(prev => ({ ...prev, colaboradora_id: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Selecione...</option>
            {colaboradoras.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Servico">
          <select
            value={form.servico_id}
            onChange={(e) => setForm(prev => ({ ...prev, servico_id: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Selecione...</option>
            {Object.entries(servicosByCategoria).map(([cat, srvs]) => (
              <optgroup key={cat} label={cat}>
                {srvs.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nome} ({s.tempo_min || 60}min - R$ {Number(s.preco || 0).toFixed(2)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedServico && (
            <p className="text-xs text-gray-400 mt-1">
              Duracao: {selectedServico.tempo_min || 60} minutos
            </p>
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Data" required>
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm(prev => ({ ...prev, data: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FormField>
          <FormField label="Horario" required>
            <select
              value={form.hora}
              onChange={(e) => setForm(prev => ({ ...prev, hora: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">Selecione...</option>
              {TIME_OPTIONS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Observacao">
          <textarea
            value={form.observacao}
            onChange={(e) => setForm(prev => ({ ...prev, observacao: e.target.value }))}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            placeholder="Observacoes opcionais..."
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-3 border-t mt-3">
          <button
            type="button"
            onClick={onClose}
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
  );
}
