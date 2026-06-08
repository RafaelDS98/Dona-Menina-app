import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import Autocomplete from '../../components/Autocomplete.jsx';

const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'credito', label: 'Crédito' },
  { value: 'debito', label: 'Débito' },
  { value: 'especie', label: 'Dinheiro' },
  { value: 'desconto_taxa', label: 'Desconto taxa de agendamento (R$ 30)' },
  { value: 'pago_antecipado', label: 'Pago antecipado' },
];

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function roundTo15Min() {
  const now = new Date();
  const mins = Math.ceil(now.getMinutes() / 15) * 15;
  now.setMinutes(mins, 0, 0);
  if (mins === 60) { now.setHours(now.getHours() + 1); now.setMinutes(0); }
  return now.toTimeString().slice(0, 5);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function NovoAtendimento() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [servicos, setServicos] = useState([]);
  const [colaboradoras, setColaboradoras] = useState([]);
  const [produtosLojinha, setProdutosLojinha] = useState([]);
  const [produtosFreezer, setProdutosFreezer] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [cliente, setCliente] = useState(null);
  const [data, setData] = useState(todayISO());
  const [hora] = useState(roundTo15Min());
  const [itens, setItens] = useState([]);
  const [pagamentos, setPagamentos] = useState([{ forma: 'pix', valor: '' }]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [cortesia, setCortesia] = useState(false);

  const [addingType, setAddingType] = useState(null);
  const [itemServicoId, setItemServicoId] = useState('');
  const [servicoBusca, setServicoBusca] = useState('');
  const [servicoDropdownAberto, setServicoDrodownAberto] = useState(false);
  const servicoRef = useRef(null);
  const [itemProdutoId, setItemProdutoId] = useState('');
  const [itemFreezerId, setItemFreezerId] = useState('');
  const [itemPreco, setItemPreco] = useState('');
  const [itemObs, setItemObs] = useState('');
  const [itemColabs, setItemColabs] = useState([{ colaboradora_id: '', percentual: 100 }]);

  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteTel, setNovoClienteTel] = useState('');
  const [novoClienteNasc, setNovoClienteNasc] = useState('');
  const [novoClienteObs, setNovoClienteObs] = useState('');
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [telefoneDuplicadoCliente, setTelefoneDuplicadoCliente] = useState(null);

  const agendamentoId = searchParams.get('agendamento_id');

  useEffect(() => {
    Promise.all([
      api.get('/servicos'),
      api.get('/colaboradoras'),
      api.get('/estoque/lojinha'),
      api.get('/estoque/freezer'),
    ])
      .then(([s, c, p, f]) => {
        setServicos(Array.isArray(s) ? s : []);
        setColaboradoras(Array.isArray(c) ? c.filter(x => x.ativa) : []);
        setProdutosLojinha(Array.isArray(p) ? p : []);
        setProdutosFreezer(Array.isArray(f) ? f.filter(x => x.ativo) : []);
      })
      .catch(() => toast.error('Erro ao carregar dados do formulario'))
      .finally(() => setLoadingData(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (servicoRef.current && !servicoRef.current.contains(e.target)) setServicoDrodownAberto(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const servicosPorCategoria = servicos.reduce((acc, s) => {
    const cat = s.categoria_nome || 'Sem categoria';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const fetchClientes = useCallback(async (query) => {
    return api.get('/clientes?q=' + encodeURIComponent(query));
  }, []);

  const totalItens = itens.reduce((s, i) => s + Number(i.preco_cobrado), 0);
  const totalDesconto = pagamentos.filter(p => p.forma === 'desconto_taxa' || p.forma === 'pago_antecipado').reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const totalAPagar = totalItens - totalDesconto;
  const totalPago = pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const diferenca = totalAPagar - (totalPago - totalDesconto);

  const itensValidos = itens.length > 0;
  const pagamentosValidos = cortesia || pagamentos.every(p => p.forma && Number(p.valor) > 0);
  const diferencaOk = cortesia || Math.abs(diferenca) < 0.02;
  const clienteOk = !!cliente;
  const canSubmit = clienteOk && itensValidos && pagamentosValidos && diferencaOk && !salvando;

  const currentItemValid = (() => {
    if (addingType === 'servico') {
      if (!itemServicoId || !itemPreco || Number(itemPreco) <= 0) return false;
      const servicoSelecionado = servicos.find(s => s && s.id === Number(itemServicoId));
      const isTaxa = !!(servicoSelecionado?.nome?.toLowerCase().includes('taxa') || servicoSelecionado?.nome?.toLowerCase().includes('antecipado'));
      if (!isTaxa) {
        if (itemColabs.length === 0) return false;
        if (itemColabs.reduce((s, c) => s + (Number(c.percentual) || 0), 0) !== 100) return false;
        if (itemColabs.some(c => !c.colaboradora_id)) return false;
      }
      return true;
    }
    if (addingType === 'produto') return itemProdutoId && itemPreco && Number(itemPreco) > 0;
    if (addingType === 'freezer') return itemFreezerId && itemPreco && Number(itemPreco) > 0;
    return false;
  })();

  function handleSelectProduct(e) {
    const id = e.target.value;
    setItemProdutoId(id);
    if (id) { const prod = produtosLojinha.find(p => p.id === Number(id)); if (prod) setItemPreco(String(prod.preco_venda)); }
    else setItemPreco('');
  }

  function handleSelectFreezer(e) {
    const id = e.target.value;
    setItemFreezerId(id);
    if (id) { const prod = produtosFreezer.find(p => p.id === Number(id)); if (prod) setItemPreco(String(prod.preco_venda)); }
    else setItemPreco('');
  }

  function addColab() { setItemColabs(prev => [...prev, { colaboradora_id: '', percentual: 0 }]); }
  function removeColab(idx) { setItemColabs(prev => prev.filter((_, i) => i !== idx)); }
  function updateColab(idx, field, value) { setItemColabs(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c)); }

  function confirmItem() {
    if (!currentItemValid) return;
    if (addingType === 'servico') {
      const svc = servicos.find(s => s && s.id === Number(itemServicoId));
      const isTaxaItem = !!(svc?.nome?.toLowerCase().includes('taxa') || svc?.nome?.toLowerCase().includes('antecipado'));
      setItens(prev => [...prev, {
        tipo: 'servico', servico_id: Number(itemServicoId), descricao: svc?.nome || '',
        preco_cobrado: Number(itemPreco), observacao: itemObs || null,
        colaboradoras: isTaxaItem ? [] : itemColabs.map(c => ({
          colaboradora_id: Number(c.colaboradora_id), percentual_comissao: Number(c.percentual),
          nome: colaboradoras.find(x => x.id === Number(c.colaboradora_id))?.nome || '',
        })),
      }]);
    } else if (addingType === 'produto') {
      const prod = produtosLojinha.find(p => p.id === Number(itemProdutoId));
      setItens(prev => [...prev, { tipo: 'produto', produto_id: Number(itemProdutoId), descricao: prod?.nome || '', preco_cobrado: Number(itemPreco), observacao: null, colaboradoras: [] }]);
    } else if (addingType === 'freezer') {
      const prod = produtosFreezer.find(p => p.id === Number(itemFreezerId));
      setItens(prev => [...prev, { tipo: 'freezer', freezer_id: Number(itemFreezerId), descricao: prod?.nome || '', preco_cobrado: Number(itemPreco), observacao: null, colaboradoras: [] }]);
    }
    resetItemForm();
  }

  function resetItemForm() {
    setAddingType(null); setItemServicoId(''); setServicoBusca(''); setItemProdutoId('');
    setItemFreezerId(''); setItemPreco(''); setItemObs(''); setItemColabs([{ colaboradora_id: '', percentual: 100 }]);
  }

  function removeItem(idx) { setItens(prev => prev.filter((_, i) => i !== idx)); }
  function addPagamento() { setPagamentos(prev => [...prev, { forma: 'pix', valor: '' }]); }
  function removePagamento(idx) { setPagamentos(prev => prev.filter((_, i) => i !== idx)); }
  function updatePagamento(idx, field, value) {
    setPagamentos(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      if (field === 'forma' && value === 'desconto_taxa') return { ...p, forma: 'desconto_taxa', valor: '30' };
      return { ...p, [field]: value };
    }));
  }

  async function verificarTelefoneCliente(telefone) {
    if (!telefone || telefone.replace(/\D/g, '').length < 10) return;
    try {
      const result = await api.get(`/clientes/verificar-telefone?telefone=${encodeURIComponent(telefone)}`);
      if (result) setTelefoneDuplicadoCliente(result); else setTelefoneDuplicadoCliente(null);
    } catch { setTelefoneDuplicadoCliente(null); }
  }

  async function handleSalvarCliente() {
    if (!novoClienteNome.trim()) return;
    setSalvandoCliente(true);
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoClienteNome.trim(), telefone: novoClienteTel.trim() || null, data_nascimento: novoClienteNasc || null, observacoes: novoClienteObs.trim() || null }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (res.status === 409) { setTelefoneDuplicadoCliente(json.data); setSalvandoCliente(false); return; }
        throw new Error(json.error || 'Erro ao salvar');
      }
      setCliente(json.data); setModalClienteOpen(false); setNovoClienteNome(''); setNovoClienteTel(''); setNovoClienteNasc(''); setNovoClienteObs(''); setTelefoneDuplicadoCliente(null);
      toast.success('Cliente cadastrada com sucesso');
    } catch (err) { toast.error(err.message); } finally { setSalvandoCliente(false); }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSalvando(true);
    try {
      const body = {
        cliente_id: cliente.id,
        data_hora: `${data}T${new Date().toTimeString().slice(0, 5)}`,
        observacao: observacao || null,
        agendamento_id: agendamentoId ? Number(agendamentoId) : null,
        cortesia,
        pagamentos: cortesia ? [] : pagamentos.map(p => ({ forma: p.forma, valor: Number(p.valor) })),
        itens: itens.map(i => ({
          tipo: i.tipo,
          servico_id: i.tipo === 'servico' ? i.servico_id : undefined,
          produto_id: i.tipo === 'produto' ? i.produto_id : undefined,
          freezer_id: i.tipo === 'freezer' ? i.freezer_id : undefined,
          descricao: i.descricao, preco_cobrado: i.preco_cobrado, observacao: i.observacao,
          colaboradoras: i.colaboradoras.map(c => ({ colaboradora_id: c.colaboradora_id, percentual_comissao: c.percentual_comissao })),
        })),
      };
      await api.post('/atendimentos', body);
      toast.success('Atendimento salvo com sucesso!');
      navigate('/');
    } catch (err) { toast.error(err.message); } finally { setSalvando(false); }
  }

  if (loadingData) return <p className="text-gray-500">Carregando formulario...</p>;

  const somaPercColabs = itemColabs.reduce((s, c) => s + (Number(c.percentual) || 0), 0);

  return (
    <div className="max-w-3xl">
      <h2 className="font-title text-2xl text-gray-800 mb-6">Novo Atendimento</h2>

      {agendamentoId && (
        <div className="bg-primary-light border border-primary/30 text-primary rounded-lg p-3 mb-4 text-sm">
          Convertendo agendamento #{agendamentoId} em atendimento
        </div>
      )}

      {/* CORTESIA */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-700">Cortesia</h3>
            <p className="text-xs text-gray-400 mt-0.5">Atendimento gratuito — comissão gerada normalmente</p>
          </div>
          <button
            type="button"
            onClick={() => setCortesia(prev => !prev)}
            className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              cortesia
                ? 'bg-pink-100 text-pink-700 border-2 border-pink-400'
                : 'bg-gray-100 text-gray-500 border-2 border-gray-200 hover:border-gray-300'
            }`}
          >
            🎁 {cortesia ? 'Cortesia ativada' : 'Marcar como cortesia'}
          </button>
        </div>
        {cortesia && (
          <div className="mt-3 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2 text-sm text-pink-700">
            ⚠️ O cliente não será cobrado. A comissão da colaboradora será calculada normalmente sobre o valor dos serviços.
          </div>
        )}
      </section>

      {/* CLIENTE */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Cliente</h3>
        {!cliente ? (
          <div>
            <Autocomplete
              placeholder="Buscar por nome ou telefone..."
              fetchOptions={fetchClientes}
              onSelect={setCliente}
              displayKey="nome"
              renderOption={(c) => (
                <span>{c.nome} {c.telefone && <span className="text-gray-400 ml-1">- {c.telefone}</span>}</span>
              )}
            />
            <button type="button" onClick={() => setModalClienteOpen(true)} className="text-primary text-sm mt-2 hover:underline">
              + Cadastrar nova cliente
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-primary-light rounded-lg p-3">
            <div>
              <p className="font-medium text-gray-800">{cliente.nome}</p>
              {cliente.telefone && <p className="text-sm text-gray-500">{cliente.telefone}</p>}
            </div>
            <button type="button" onClick={() => setCliente(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>
        )}
      </section>

      {/* DATA */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Data</h3>
        <FormField label="Data do atendimento" required>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </FormField>
      </section>

      {/* ITENS */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Itens do atendimento</h3>

        {itens.length > 0 && (
          <div className="mb-4 space-y-2">
            {itens.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{item.descricao}</span>
                  {item.tipo === 'produto' && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">produto</span>}
                  {item.tipo === 'freezer' && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">🧊 freezer</span>}
                  {item.colaboradoras.length > 0 && (
                    <span className="text-gray-400 ml-2">{item.colaboradoras.map(c => `${c.nome} (${c.percentual_comissao}%)`).join(', ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">R$ {formatCurrency(item.preco_cobrado)}</span>
                  <button type="button" onClick={() => removeItem(idx)} className="text-alert-danger hover:text-red-700 text-lg leading-none">&times;</button>
                </div>
              </div>
            ))}
            <div className="text-right text-sm font-semibold text-gray-700 pt-1">
              Subtotal: R$ {formatCurrency(totalItens)}
              {cortesia && <span className="ml-2 text-pink-600">(cortesia — não cobrado)</span>}
            </div>
          </div>
        )}

        {itens.length === 0 && !addingType && <p className="text-gray-400 text-sm mb-3">Nenhum item adicionado</p>}

        {addingType && (
          <div className="border border-primary/30 rounded-lg p-3 mb-3 bg-primary-light/30">
            {addingType === 'servico' ? (
              <>
                <FormField label="Servico" required>
                  <div ref={servicoRef} className="relative">
                    <input type="text" value={servicoBusca}
                      onChange={(e) => { setServicoBusca(e.target.value); setItemServicoId(''); setItemPreco(''); setServicoDrodownAberto(true); }}
                      onFocus={() => setServicoDrodownAberto(true)}
                      placeholder="Buscar serviço..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    {servicoDropdownAberto && (
                      <ul className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                        {(() => {
                          const termo = servicoBusca.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                          if (termo.length === 0) {
                            return Object.entries(servicosPorCategoria).map(([cat, svcs]) => (
                              <li key={cat}>
                                <div className="px-3 py-1 text-xs font-bold text-gray-400 uppercase bg-gray-50 sticky top-0">{cat}</div>
                                {svcs.map(s => (
                                  <div key={s.id} onMouseDown={() => { setItemServicoId(String(s.id)); setServicoBusca(s.nome); setItemPreco(String(s.preco)); setServicoDrodownAberto(false); }}
                                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-primary-light flex justify-between items-center ${String(itemServicoId) === String(s.id) ? 'bg-primary-light font-semibold' : ''}`}>
                                    <span>{s.nome}</span>
                                    <span className="text-gray-400 text-xs ml-2">R$ {formatCurrency(s.preco)}</span>
                                  </div>
                                ))}
                              </li>
                            ));
                          }
                          const filtrados = servicos.filter(s => s && s.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(termo));
                          if (filtrados.length === 0) return <li className="px-3 py-3 text-sm text-gray-400 italic">Nenhum serviço encontrado</li>;
                          return filtrados.map(s => (
                            <div key={s.id} onMouseDown={() => { setItemServicoId(String(s.id)); setServicoBusca(s.nome); setItemPreco(String(s.preco)); setServicoDrodownAberto(false); }}
                              className={`px-4 py-2 text-sm cursor-pointer hover:bg-primary-light flex justify-between items-center ${String(itemServicoId) === String(s.id) ? 'bg-primary-light font-semibold' : ''}`}>
                              <span>{s.nome}</span>
                              <span className="text-gray-400 text-xs ml-2">R$ {formatCurrency(s.preco)}</span>
                            </div>
                          ));
                        })()}
                      </ul>
                    )}
                  </div>
                </FormField>
                <div className="flex gap-4">
                  <FormField label="Preco cobrado (R$)" required>
                    <input type="number" step="0.01" min="0" value={itemPreco} onChange={(e) => setItemPreco(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </FormField>
                  <FormField label="Observacao">
                    <input type="text" value={itemObs} onChange={(e) => setItemObs(e.target.value)} placeholder="Opcional"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </FormField>
                </div>
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Colaboradoras <span className="text-primary ml-0.5">*</span></label>
                  {itemColabs.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <select value={c.colaboradora_id} onChange={(e) => updateColab(idx, 'colaboradora_id', e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                        <option value="">Selecione...</option>
                        {colaboradoras.map(col => <option key={col.id} value={col.id}>{col.nome}</option>)}
                      </select>
                      <input type="number" min="0" max="100" value={c.percentual} onChange={(e) => updateColab(idx, 'percentual', e.target.value)}
                        className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                      <span className="text-sm text-gray-500">%</span>
                      {itemColabs.length > 1 && <button type="button" onClick={() => removeColab(idx)} className="text-alert-danger hover:text-red-700 text-lg leading-none">&times;</button>}
                    </div>
                  ))}
                  <div className="flex items-center justify-between mt-1">
                    <button type="button" onClick={addColab} className="text-primary text-sm hover:underline">+ Colaboradora</button>
                    <span className={`text-xs font-medium ${somaPercColabs === 100 ? 'text-alert-ok' : 'text-alert-danger'}`}>
                      Soma: {somaPercColabs}%{somaPercColabs !== 100 && ' (deve ser 100%)'}
                    </span>
                  </div>
                </div>
              </>
            ) : addingType === 'produto' ? (
              <>
                <FormField label="Produto" required>
                  <select value={itemProdutoId} onChange={handleSelectProduct}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                    <option value="">Selecione um produto...</option>
                    {produtosLojinha.map(p => <option key={p.id} value={p.id}>{p.nome} - R$ {formatCurrency(p.preco_venda)} (estoque: {p.quantidade})</option>)}
                  </select>
                </FormField>
                <FormField label="Preco cobrado (R$)" required>
                  <input type="number" step="0.01" min="0" value={itemPreco} onChange={(e) => setItemPreco(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </FormField>
              </>
            ) : addingType === 'freezer' ? (
              <>
                <FormField label="Item do Freezer" required>
                  <select value={itemFreezerId} onChange={handleSelectFreezer}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                    <option value="">Selecione um item...</option>
                    {produtosFreezer.map(p => <option key={p.id} value={p.id}>{p.nome}{p.marca ? ` - ${p.marca}` : ''} — R$ {formatCurrency(p.preco_venda)} (estoque: {p.quantidade})</option>)}
                  </select>
                </FormField>
                <FormField label="Preco cobrado (R$)" required>
                  <input type="number" step="0.01" min="0" value={itemPreco} onChange={(e) => setItemPreco(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </FormField>
              </>
            ) : null}

            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={resetItemForm} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button type="button" onClick={confirmItem} disabled={!currentItemValid}
                className="px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed">
                Confirmar item
              </button>
            </div>
          </div>
        )}

        {!addingType && (
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => setAddingType('servico')} className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light">+ Adicionar servico</button>
            <button type="button" onClick={() => setAddingType('produto')} className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light">+ Adicionar produto da lojinha</button>
            <button type="button" onClick={() => setAddingType('freezer')} className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light">🧊 Adicionar item do freezer</button>
          </div>
        )}
      </section>

      {/* PAGAMENTO — oculto em cortesia */}
      {!cortesia && (
        <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
          <h3 className="font-semibold text-gray-700 mb-3">Pagamento</h3>
          {pagamentos.map((pag, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <select value={pag.forma} onChange={(e) => updatePagamento(idx, 'forma', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">R$</span>
                <input type="number" step="0.01" min="0" value={pag.valor} onChange={(e) => updatePagamento(idx, 'valor', e.target.value)}
                  readOnly={pag.forma === 'desconto_taxa'} placeholder="0,00"
                  className={`w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${pag.forma === 'desconto_taxa' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} />
              </div>
              {pagamentos.length > 1 && <button type="button" onClick={() => removePagamento(idx)} className="text-alert-danger hover:text-red-700 text-lg leading-none">&times;</button>}
            </div>
          ))}
          <button type="button" onClick={addPagamento} className="text-primary text-sm hover:underline mt-1">+ Adicionar outra forma de pagamento</button>
          <div className="mt-3 pt-3 border-t text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Total dos itens:</span><span className="font-medium">R$ {formatCurrency(totalItens)}</span></div>
            {pagamentos.filter(p => p.forma === 'desconto_taxa').reduce((s,p) => s+(Number(p.valor)||0),0) > 0 && <div className="flex justify-between text-yellow-600"><span>(-) Desconto taxa:</span><span className="font-medium">- R$ {formatCurrency(pagamentos.filter(p => p.forma === 'desconto_taxa').reduce((s,p) => s+(Number(p.valor)||0),0))}</span></div>}
            {pagamentos.filter(p => p.forma === 'pago_antecipado').reduce((s,p) => s+(Number(p.valor)||0),0) > 0 && <div className="flex justify-between text-yellow-600"><span>(-) Pago antecipado:</span><span className="font-medium">- R$ {formatCurrency(pagamentos.filter(p => p.forma === 'pago_antecipado').reduce((s,p) => s+(Number(p.valor)||0),0))}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Total pago:</span><span className="font-medium">R$ {formatCurrency(totalPago - totalDesconto)}</span></div>
            <div className="flex justify-between">
              <span className="text-gray-500">Diferenca:</span>
              <span className={`font-semibold ${Math.abs(diferenca) < 0.02 ? 'text-alert-ok' : 'text-alert-danger'}`}>
                R$ {formatCurrency(Math.abs(diferenca))}{diferenca > 0.01 && ' (falta)'}{diferenca < -0.01 && ' (excesso)'}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* OBSERVACAO */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Observacao geral</h3>
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observacoes sobre o atendimento (opcional)" rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
      </section>

      {/* FOOTER */}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate('/')} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit}
          className={`px-6 py-2 text-sm text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${cortesia ? 'bg-pink-500 hover:bg-pink-600' : 'bg-primary hover:bg-primary-hover'}`}>
          {salvando ? 'Salvando...' : cortesia ? '🎁 Salvar como cortesia' : 'Salvar atendimento'}
        </button>
      </div>

      {/* Modal cliente */}
      <Modal open={modalClienteOpen} onClose={() => { setModalClienteOpen(false); setTelefoneDuplicadoCliente(null); }} title="Cadastrar nova cliente">
        <FormField label="Nome" required>
          <input type="text" value={novoClienteNome} onChange={(e) => setNovoClienteNome(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </FormField>
        <FormField label="Telefone (opcional)">
          <input type="text" value={novoClienteTel} onChange={(e) => { setNovoClienteTel(e.target.value); setTelefoneDuplicadoCliente(null); }}
            onBlur={(e) => verificarTelefoneCliente(e.target.value)} placeholder="(99) 99999-9999"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          {telefoneDuplicadoCliente && (
            <div className="mt-2 bg-pink-50 border border-primary/30 rounded-lg p-3">
              <p className="text-sm font-semibold text-primary">⚠️ Telefone já cadastrado!</p>
              <p className="text-sm text-gray-700 mt-0.5">Este número pertence à cliente <strong>{telefoneDuplicadoCliente.nome}</strong>.</p>
              <button type="button" onClick={() => { setCliente(telefoneDuplicadoCliente); setModalClienteOpen(false); setTelefoneDuplicadoCliente(null); setNovoClienteNome(''); setNovoClienteTel(''); setNovoClienteNasc(''); setNovoClienteObs(''); toast.success(`Cliente ${telefoneDuplicadoCliente.nome} selecionada!`); }}
                className="mt-2 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-hover">
                Usar cadastro de {telefoneDuplicadoCliente.nome}
              </button>
            </div>
          )}
        </FormField>
        <FormField label="Data de nascimento (opcional)">
          <input type="date" value={novoClienteNasc} onChange={(e) => setNovoClienteNasc(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </FormField>
        <FormField label="Observações (opcional)">
          <textarea value={novoClienteObs} onChange={(e) => setNovoClienteObs(e.target.value)} maxLength={500} rows={3} placeholder="Observações sobre a cliente..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          <p className="text-xs text-gray-400 text-right">{novoClienteObs.length}/500</p>
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={() => setModalClienteOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={handleSalvarCliente} disabled={!novoClienteNome.trim() || salvandoCliente}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40">
            {salvandoCliente ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

