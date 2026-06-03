import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
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
  { value: 'taxa', label: 'Taxa de agendamento (R$ 30)' },
];

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export default function EditarAtendimento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [servicos, setServicos] = useState([]);
  const [colaboradoras, setColaboradoras] = useState([]);
  const [produtosLojinha, setProdutosLojinha] = useState([]);
  const [produtosFreezer, setProdutosFreezer] = useState([]);

  const [cliente, setCliente] = useState(null);
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [itens, setItens] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [observacao, setObservacao] = useState('');

  const [addingType, setAddingType] = useState(null);
  const [itemServicoId, setItemServicoId] = useState('');
  const [itemProdutoId, setItemProdutoId] = useState('');
  const [itemFreezerId, setItemFreezerId] = useState('');
  const [itemPreco, setItemPreco] = useState('');
  const [itemObs, setItemObs] = useState('');
  const [itemColabs, setItemColabs] = useState([{ colaboradora_id: '', percentual: 100 }]);

  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteTel, setNovoClienteTel] = useState('');
  const [salvandoCliente, setSalvandoCliente] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/atendimentos/${id}`),
      api.get('/servicos'),
      api.get('/colaboradoras'),
      api.get('/estoque/lojinha'),
      api.get('/estoque/freezer'),
    ]).then(([atd, s, c, p, f]) => {
      setCliente({ id: atd.cliente_id, nome: atd.cliente_nome });
      const dt = atd.data_hora?.slice(0, 10) || '';
      const hr = atd.data_hora?.slice(11, 16) || '';
      setData(dt);
      setHora(hr);
      setObservacao(atd.observacao || '');

      setItens(atd.itens.map(item => ({
        tipo: item.tipo,
        servico_id: item.servico_id,
        produto_id: item.produto_id,
        freezer_id: item.freezer_id,
        descricao: item.descricao,
        preco_cobrado: item.preco_cobrado,
        observacao: item.observacao,
        colaboradoras: (item.colaboradoras || []).map(c => ({
          colaboradora_id: c.colaboradora_id,
          percentual_comissao: c.percentual_comissao,
          nome: c.colaboradora_nome,
        })),
      })));

      setPagamentos(atd.pagamentos.map(p => ({ forma: p.forma, valor: String(p.valor) })));
      setServicos(Array.isArray(s) ? s : []);
      setColaboradoras(Array.isArray(c) ? c.filter(x => x.ativa) : []);
      setProdutosLojinha(Array.isArray(p) ? p : []);
      setProdutosFreezer(Array.isArray(f) ? f.filter(x => x.ativo) : []);
    }).catch(() => {
      toast.error('Erro ao carregar comanda');
    }).finally(() => setLoading(false));
  }, [id]);

  const fetchClientes = useCallback(async (query) => {
    return api.get('/clientes?busca=' + encodeURIComponent(query));
  }, []);

  const totalItens = itens.reduce((s, i) => s + Number(i.preco_cobrado), 0);
  const totalPago = pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const diferenca = totalItens - totalPago;

  const canSubmit = cliente && itens.length > 0 &&
    pagamentos.every(p => p.forma && Number(p.valor) > 0) &&
    Math.abs(diferenca) < 0.02 && !salvando;

  const somaPercColabs = itemColabs.reduce((s, c) => s + (Number(c.percentual) || 0), 0);
  const currentItemValid = (() => {
    if (addingType === 'servico') {
      if (!itemServicoId || !itemPreco || Number(itemPreco) <= 0) return false;
      if (itemColabs.length === 0 || itemColabs.some(c => !c.colaboradora_id)) return false;
      if (somaPercColabs !== 100) return false;
      return true;
    }
    if (addingType === 'produto') return itemProdutoId && itemPreco && Number(itemPreco) > 0;
    if (addingType === 'freezer') return itemFreezerId && itemPreco && Number(itemPreco) > 0;
    return false;
  })();

  function handleSelectService(e) {
    const id = e.target.value;
    setItemServicoId(id);
    if (id) {
      const svc = servicos.find(s => s.id === Number(id));
      if (svc) setItemPreco(String(svc.preco));
    } else setItemPreco('');
  }

  function handleSelectProduct(e) {
    const id = e.target.value;
    setItemProdutoId(id);
    if (id) {
      const prod = produtosLojinha.find(p => p.id === Number(id));
      if (prod) setItemPreco(String(prod.preco_venda));
    } else setItemPreco('');
  }

  function handleSelectFreezer(e) {
    const id = e.target.value;
    setItemFreezerId(id);
    if (id) {
      const prod = produtosFreezer.find(p => p.id === Number(id));
      if (prod) setItemPreco(String(prod.preco_venda));
    } else setItemPreco('');
  }

  function confirmItem() {
    if (!currentItemValid) return;
    if (addingType === 'servico') {
      const svc = servicos.find(s => s.id === Number(itemServicoId));
      setItens(prev => [...prev, {
        tipo: 'servico',
        servico_id: Number(itemServicoId),
        descricao: svc?.nome || '',
        preco_cobrado: Number(itemPreco),
        observacao: itemObs || null,
        colaboradoras: itemColabs.map(c => ({
          colaboradora_id: Number(c.colaboradora_id),
          percentual_comissao: Number(c.percentual),
          nome: colaboradoras.find(x => x.id === Number(c.colaboradora_id))?.nome || '',
        })),
      }]);
    } else if (addingType === 'produto') {
      const prod = produtosLojinha.find(p => p.id === Number(itemProdutoId));
      setItens(prev => [...prev, {
        tipo: 'produto',
        produto_id: Number(itemProdutoId),
        descricao: prod?.nome || '',
        preco_cobrado: Number(itemPreco),
        observacao: null,
        colaboradoras: [],
      }]);
    } else if (addingType === 'freezer') {
      const prod = produtosFreezer.find(p => p.id === Number(itemFreezerId));
      setItens(prev => [...prev, {
        tipo: 'freezer',
        freezer_id: Number(itemFreezerId),
        descricao: prod?.nome || '',
        preco_cobrado: Number(itemPreco),
        observacao: null,
        colaboradoras: [],
      }]);
    }
    resetItemForm();
  }

  function resetItemForm() {
    setAddingType(null);
    setItemServicoId('');
    setItemProdutoId('');
    setItemFreezerId('');
    setItemPreco('');
    setItemObs('');
    setItemColabs([{ colaboradora_id: '', percentual: 100 }]);
  }

  function removeItem(idx) {
    setItens(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePagamento(idx, field, value) {
    setPagamentos(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      if (field === 'forma' && value === 'taxa') return { ...p, forma: 'taxa', valor: '30' };
      return { ...p, [field]: value };
    }));
  }

  async function handleSalvarCliente() {
    if (!novoClienteNome.trim()) return;
    setSalvandoCliente(true);
    try {
      const c = await api.post('/clientes', { nome: novoClienteNome.trim(), telefone: novoClienteTel.trim() || null });
      setCliente(c);
      setModalClienteOpen(false);
      setNovoClienteNome('');
      setNovoClienteTel('');
      toast.success('Cliente cadastrada!');
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar cliente');
    } finally {
      setSalvandoCliente(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSalvando(true);
    try {
      const data_hora = `${data}T${hora || '12:00'}:00`;
      await api.put(`/atendimentos/${id}`, {
        cliente_id: cliente.id,
        data_hora,
        observacao: observacao || null,
        pagamentos: pagamentos.map(p => ({ forma: p.forma, valor: Number(p.valor) })),
        itens: itens.map(item => ({
          tipo: item.tipo,
          servico_id: item.servico_id || null,
          produto_id: item.produto_id || null,
          freezer_id: item.freezer_id || null,
          descricao: item.descricao,
          preco_cobrado: item.preco_cobrado,
          observacao: item.observacao || null,
          colaboradoras: (item.colaboradoras || []).map(c => ({
            colaboradora_id: c.colaboradora_id,
            percentual_comissao: c.percentual_comissao,
          })),
        })),
      });
      toast.success('Comanda atualizada!');
      navigate('/atendimentos');
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-gray-400">Carregando comanda...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/atendimentos')} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <h1 className="text-2xl font-title font-semibold text-gray-800">Editar Comanda #{id}</h1>
      </div>

      {/* CLIENTE */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Cliente</h3>
        {cliente ? (
          <div className="flex items-center justify-between bg-primary-light rounded-lg px-3 py-2">
            <span className="text-primary font-medium">{cliente.nome}</span>
            <button onClick={() => setCliente(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
          </div>
        ) : (
          <div className="space-y-2">
            <Autocomplete
              placeholder="Buscar por nome ou telefone..."
              fetchOptions={fetchClientes}
              onSelect={setCliente}
              displayKey="nome"
              renderOption={c => <div><div className="font-medium">{c.nome}</div><div className="text-xs text-gray-400">{c.telefone || 'Sem telefone'}</div></div>}
            />
            <button onClick={() => setModalClienteOpen(true)} className="text-primary text-sm hover:underline">+ Cadastrar nova cliente</button>
          </div>
        )}
      </section>

      {/* DATA */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Data</h3>
        <FormField label="Data do atendimento" required>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </FormField>
      </section>

      {/* ITENS */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Itens do atendimento</h3>

        {itens.length > 0 && (
          <div className="space-y-2 mb-3">
            {itens.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-800">{item.descricao}</span>
                  {item.tipo === 'freezer' && <span className="text-xs text-blue-500 ml-2">[freezer]</span>}
                  {item.colaboradoras?.length > 0 && (
                    <span className="text-xs text-gray-400 ml-2">
                      — {item.colaboradoras.map(c => c.nome).join(', ')}
                    </span>
                  )}
                  <div className="text-xs text-primary font-semibold mt-0.5">R$ {formatCurrency(item.preco_cobrado)}</div>
                </div>
                <button onClick={() => removeItem(idx)} className="text-alert-danger hover:text-red-700 text-lg ml-3">×</button>
              </div>
            ))}
          </div>
        )}

        {itens.length === 0 && !addingType && (
          <p className="text-sm text-gray-400 mb-3">Nenhum item adicionado</p>
        )}

        {addingType && (
          <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50">
            <div className="flex gap-2 mb-3">
              <button onClick={() => setAddingType('servico')}
                className={`px-3 py-1 text-xs rounded-full border ${addingType === 'servico' ? 'bg-primary text-white border-primary' : 'text-gray-600 border-gray-300'}`}>
                Serviço
              </button>
              <button onClick={() => setAddingType('produto')}
                className={`px-3 py-1 text-xs rounded-full border ${addingType === 'produto' ? 'bg-primary text-white border-primary' : 'text-gray-600 border-gray-300'}`}>
                Produto da lojinha
              </button>
              <button onClick={() => setAddingType('freezer')}
                className={`px-3 py-1 text-xs rounded-full border ${addingType === 'freezer' ? 'bg-primary text-white border-primary' : 'text-gray-600 border-gray-300'}`}>
                Freezer
              </button>
            </div>

            {addingType === 'servico' ? (
              <>
                <FormField label="Serviço" required>
                  <select value={itemServicoId} onChange={handleSelectService}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                    <option value="">Selecione...</option>
                    {servicos.map(s => <option key={s.id} value={s.id}>{s.nome} — R$ {formatCurrency(s.preco)}</option>)}
                  </select>
                </FormField>
                <FormField label="Preço cobrado (R$)" required>
                  <input type="number" step="0.01" min="0" value={itemPreco} onChange={e => setItemPreco(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </FormField>
                <FormField label="Observação">
                  <input type="text" value={itemObs} onChange={e => setItemObs(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </FormField>
                <div className="mt-2">
                  <div className="text-xs font-medium text-gray-600 mb-1">Colaboradoras</div>
                  {itemColabs.map((colab, idx) => (
                    <div key={idx} className="flex gap-2 mb-1 items-center">
                      <select value={colab.colaboradora_id}
                        onChange={e => setItemColabs(prev => prev.map((c, i) => i === idx ? { ...c, colaboradora_id: e.target.value } : c))}
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                        <option value="">Selecione...</option>
                        {colaboradoras.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                      <input type="number" min="0" max="100" value={colab.percentual}
                        onChange={e => setItemColabs(prev => prev.map((c, i) => i === idx ? { ...c, percentual: e.target.value } : c))}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                      <span className="text-xs text-gray-400">%</span>
                      {itemColabs.length > 1 && (
                        <button onClick={() => setItemColabs(prev => prev.filter((_, i) => i !== idx))} className="text-alert-danger text-lg">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setItemColabs(prev => [...prev, { colaboradora_id: '', percentual: 0 }])}
                    className="text-primary text-xs hover:underline mt-1">+ Adicionar colaboradora</button>
                  <div className={`text-xs font-medium mt-1 ${somaPercColabs === 100 ? 'text-alert-ok' : 'text-alert-danger'}`}>
                    Soma: {somaPercColabs}% {somaPercColabs !== 100 && '(deve ser 100%)'}
                  </div>
                </div>
              </>
            ) : addingType === 'produto' ? (
              <>
                <FormField label="Produto" required>
                  <select value={itemProdutoId} onChange={handleSelectProduct}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                    <option value="">Selecione...</option>
                    {produtosLojinha.map(p => <option key={p.id} value={p.id}>{p.nome} — R$ {formatCurrency(p.preco_venda)}</option>)}
                  </select>
                </FormField>
                <FormField label="Preço cobrado (R$)" required>
                  <input type="number" step="0.01" min="0" value={itemPreco} onChange={e => setItemPreco(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </FormField>
              </>
            ) : addingType === 'freezer' ? (
              <>
                <FormField label="Item do Freezer" required>
                  <select value={itemFreezerId} onChange={handleSelectFreezer}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                    <option value="">Selecione um item...</option>
                    {produtosFreezer.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome}{p.marca ? ` - ${p.marca}` : ''} — R$ {formatCurrency(p.preco_venda)} (estoque: {p.quantidade})
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Preço cobrado (R$)" required>
                  <input type="number" step="0.01" min="0" value={itemPreco} onChange={e => setItemPreco(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </FormField>
              </>
            ) : null}

            <div className="flex justify-end gap-2 mt-3">
              <button onClick={resetItemForm} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={confirmItem} disabled={!currentItemValid}
                className="px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed">
                Confirmar item
              </button>
            </div>
          </div>
        )}

        {!addingType && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setAddingType('servico')}
              className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light">
              + Adicionar serviço
            </button>
            <button onClick={() => setAddingType('produto')}
              className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light">
              + Adicionar produto da lojinha
            </button>
            <button onClick={() => setAddingType('freezer')}
              className="px-3 py-1.5 text-sm text-primary border border-primary rounded-lg hover:bg-primary-light">
              + Adicionar item do freezer
            </button>
          </div>
        )}
      </section>

      {/* PAGAMENTO */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Pagamento</h3>
        {pagamentos.map((pag, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <select value={pag.forma} onChange={e => updatePagamento(idx, 'forma', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
              {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <span className="text-sm text-gray-500">R$</span>
            <input type="number" step="0.01" min="0" value={pag.valor}
              onChange={e => updatePagamento(idx, 'valor', e.target.value)}
              readOnly={pag.forma === 'taxa'}
              className={`w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${pag.forma === 'taxa' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} />
            {pagamentos.length > 1 && (
              <button onClick={() => setPagamentos(prev => prev.filter((_, i) => i !== idx))} className="text-alert-danger text-lg">×</button>
            )}
          </div>
        ))}
        <button onClick={() => setPagamentos(prev => [...prev, { forma: 'pix', valor: '' }])}
          className="text-primary text-sm hover:underline mt-1">+ Adicionar outra forma de pagamento</button>

        <div className="mt-3 pt-3 border-t text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Total dos itens:</span><span className="font-medium">R$ {formatCurrency(totalItens)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Total pago:</span><span className="font-medium">R$ {formatCurrency(totalPago)}</span></div>
          <div className="flex justify-between">
            <span className="text-gray-500">Diferença:</span>
            <span className={`font-semibold ${Math.abs(diferenca) < 0.02 ? 'text-alert-ok' : 'text-alert-danger'}`}>
              R$ {formatCurrency(Math.abs(diferenca))}
              {diferenca > 0.01 && ' (falta)'}
              {diferenca < -0.01 && ' (excesso)'}
            </span>
          </div>
        </div>
      </section>

      {/* OBSERVAÇÃO */}
      <section className="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 className="font-semibold text-gray-700 mb-3">Observação geral</h3>
        <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
          placeholder="Observações sobre o atendimento (opcional)" rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
      </section>

      {/* BOTÕES */}
      <div className="flex justify-end gap-3">
        <button onClick={() => navigate('/atendimentos')}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="px-6 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed">
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {/* Modal novo cliente */}
      <Modal open={modalClienteOpen} onClose={() => setModalClienteOpen(false)} title="Cadastrar nova cliente">
        <FormField label="Nome" required>
          <input type="text" value={novoClienteNome} onChange={e => setNovoClienteNome(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </FormField>
        <FormField label="Telefone">
          <input type="text" value={novoClienteTel} onChange={e => setNovoClienteTel(e.target.value)}
            placeholder="(99) 99999-9999"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModalClienteOpen(false)}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSalvarCliente} disabled={!novoClienteNome.trim() || salvandoCliente}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-40">
            {salvandoCliente ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
