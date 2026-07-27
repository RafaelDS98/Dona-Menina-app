import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import * as XLSX from 'xlsx';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';

/*
 * DASHBOARD DA DIRETORIA — acesso restrito por senha (interino até a Fase 3).
 * A senha não existe neste código: o backend compara apenas hashes (SHA-256
 * em variável de ambiente). Na Fase 3, substituir o gate de senha pelo
 * usePermissao('dashboard', 'ver') do perfil admin.
 *
 * Filtros de exibição (marcar/desmarcar serviços, formas e colaboradoras)
 * são 100% no navegador: nenhuma chamada extra à API.
 */

const CHAVE_SESSAO = 'dm_diretoria_autorizada';

const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const COR_OUTROS = '#b5b3ab';
const LABEL_FORMA = { pix: 'PIX', credito: 'Crédito', debito: 'Débito', especie: 'Dinheiro', taxa: 'Taxa de agendamento' };

const PERIODOS = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'd7', label: 'Últimos 7 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'mes_passado', label: 'Mês passado' },
  { key: 'tudo', label: 'Tudo' },
  { key: 'personalizado', label: 'Personalizado 📆' },
];

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function intervaloPeriodo(key) {
  const hoje = new Date();
  switch (key) {
    case 'hoje':
      return { data_inicio: localISO(hoje), data_fim: localISO(hoje) };
    case 'd7': {
      const ini = new Date(hoje);
      ini.setDate(hoje.getDate() - 6);
      return { data_inicio: localISO(ini), data_fim: localISO(hoje) };
    }
    case 'mes':
      return { data_inicio: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`, data_fim: localISO(hoje) };
    case 'mes_passado': {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { data_inicio: localISO(ini), data_fim: localISO(fim) };
    }
    default:
      return { data_inicio: '2026-05-01', data_fim: localISO(hoje) };
  }
}

function formatCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function pct(parte, todo) {
  if (!todo || todo <= 0) return '0%';
  return (100 * parte / todo).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
}

function fmtPctNum(v) {
  return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function round2(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

/* ---------- Seleção (exibir/ocultar itens de uma dimensão) ---------- */
function useSelecao(ids) {
  const chave = ids.join('|');
  const [sel, setSel] = useState(null); // null = todos selecionados
  useEffect(() => { setSel(null); }, [chave]);
  const ativo = useCallback((id) => sel === null || sel.has(id), [sel]);
  const toggle = useCallback((id) => {
    setSel(prev => {
      const base = prev === null ? new Set(ids) : new Set(prev);
      if (base.has(id)) base.delete(id); else base.add(id);
      return base.size === ids.length ? null : base;
    });
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const todos = useCallback(() => setSel(null), []);
  const nenhum = useCallback(() => setSel(new Set()), []);
  const filtrando = sel !== null;
  const qtdAtivos = sel === null ? ids.length : sel.size;
  return { ativo, toggle, todos, nenhum, filtrando, qtdAtivos, total: ids.length };
}

function BarraSelecao({ sel, resumoSelecao }) {
  return (
    <div className="flex items-center justify-between gap-2 mt-2 text-xs">
      <span className={sel.filtrando ? 'text-primary font-medium' : 'text-gray-400'}>
        {sel.filtrando ? `Exibindo ${sel.qtdAtivos} de ${sel.total} · ${resumoSelecao}` : `Todos os ${sel.total} itens`}
      </span>
      <span className="flex gap-1 shrink-0">
        <button onClick={sel.todos} className="border rounded px-2 py-0.5 text-gray-500 hover:bg-gray-50">Todos</button>
        <button onClick={sel.nenhum} className="border rounded px-2 py-0.5 text-gray-500 hover:bg-gray-50">Nenhum</button>
      </span>
    </div>
  );
}

/* ---------- Exportação Excel ---------- */
function exportarExcel(nomeArquivo, abas) {
  const wb = XLSX.utils.book_new();
  abas.forEach(({ nome, linhas }) => {
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Aviso: 'Sem dados na seleção/período' }]);
    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
  });
  XLSX.writeFile(wb, nomeArquivo);
}

function BotaoExportar({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Exporta a seleção atual para Excel"
      className="text-xs border rounded-md px-2.5 py-1 text-gray-500 hover:bg-primary-light hover:text-primary hover:border-primary transition-colors shrink-0"
    >
      ⬇ Excel
    </button>
  );
}

/* ---------- Donut SVG ---------- */
function arco(cx, cy, R, r, a0, a1) {
  const x = (rad, radius) => cx + radius * Math.cos(rad);
  const y = (rad, radius) => cy + radius * Math.sin(rad);
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${x(a0, R)} ${y(a0, R)}`,
    `A ${R} ${R} 0 ${grande} 1 ${x(a1, R)} ${y(a1, R)}`,
    `L ${x(a1, r)} ${y(a1, r)}`,
    `A ${r} ${r} 0 ${grande} 0 ${x(a0, r)} ${y(a0, r)}`,
    'Z',
  ].join(' ');
}

/*
 * Donut com legenda interativa: cada item da legenda é um checkbox que
 * exibe/oculta a fatia. Percentuais sempre recalculados sobre a seleção.
 * dados: [{ id, label, valor, cor }] — todos os itens (ativos e ocultos).
 */
function DonutFiltravel({ dados, sel, formato = (v) => 'R$ ' + formatCurrency(v), maxFatias = 8 }) {
  const ativos = dados.filter(d => sel.ativo(d.id) && d.valor > 0);
  const total = ativos.reduce((s, d) => s + d.valor, 0);

  let exibidos = ativos;
  if (ativos.length > maxFatias) {
    const resto = ativos.slice(maxFatias - 1).reduce((s, d) => s + d.valor, 0);
    exibidos = [...ativos.slice(0, maxFatias - 1), { id: '__outros__', label: `Outros (${ativos.length - maxFatias + 1})`, valor: resto, cor: COR_OUTROS }];
  }

  let ang = -Math.PI / 2;
  const fatias = total > 0 ? exibidos.map(d => {
    const a0 = ang;
    const frac = d.valor / total;
    ang += frac * 2 * Math.PI;
    const a1 = frac >= 0.9999 ? a0 + 2 * Math.PI - 0.0001 : ang;
    return { ...d, a0, a1 };
  }) : [];

  return (
    <div className="flex flex-col items-center gap-3">
      {total > 0 ? (
        <svg viewBox="0 0 180 180" className="w-44 h-44">
          {fatias.map((f, i) => (
            <path key={i} d={arco(90, 90, 82, 50, f.a0, f.a1)} fill={f.cor} stroke="#ffffff" strokeWidth="2">
              <title>{`${f.label}: ${formato(f.valor)} (${pct(f.valor, total)})`}</title>
            </path>
          ))}
        </svg>
      ) : (
        <p className="text-sm text-gray-400 py-10 text-center">Nenhum item selecionado.</p>
      )}
      <ul className="w-full text-xs text-gray-600 space-y-1">
        {dados.map((d) => {
          const on = sel.ativo(d.id);
          return (
            <li key={d.id}>
              <button
                onClick={() => sel.toggle(d.id)}
                title={on ? 'Clique para ocultar' : 'Clique para exibir'}
                className={`w-full flex items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-50 transition-opacity ${on ? '' : 'opacity-40'}`}
              >
                <span className={`w-3 h-3 rounded-sm shrink-0 border ${on ? '' : 'bg-transparent!'}`} style={{ backgroundColor: on ? d.cor : 'transparent', borderColor: d.cor }} />
                <span className={`truncate ${on ? '' : 'line-through'}`}>{d.label}</span>
                <span className="ml-auto whitespace-nowrap font-medium text-gray-700">
                  {formato(d.valor)}{on && total > 0 ? ` · ${pct(d.valor, total)}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Tabela com busca (e seleção opcional por linha) ---------- */
function TabelaBusca({ colunas, linhas, sel, idCol, aberta = false, rotulo = 'Ver tabela' }) {
  const [busca, setBusca] = useState('');
  const filtradas = useMemo(() => {
    if (!busca) return linhas;
    const q = normalizar(busca);
    return linhas.filter(l => colunas.some(c => normalizar(l[c.k]).includes(q)));
  }, [busca, linhas, colunas]);
  return (
    <details className="mt-3" open={aberta}>
      <summary className="text-xs text-primary font-medium cursor-pointer select-none">{rotulo} ({linhas.length})</summary>
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar…"
        className="w-full max-w-xs border rounded-lg px-3 py-1.5 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="max-h-72 overflow-auto mt-2">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-xs text-gray-500 border-b">
              {sel && <th className="py-2 w-8" title="Exibir/ocultar no gráfico">👁</th>}
              {colunas.map(c => (
                <th key={c.k} className={`py-2 ${c.num ? 'text-right' : 'text-left'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l, i) => {
              const on = sel ? sel.ativo(l[idCol]) : true;
              return (
                <tr key={i} className={`border-b border-gray-100 ${on ? '' : 'opacity-40'}`}>
                  {sel && (
                    <td className="py-1.5">
                      <input type="checkbox" checked={on} onChange={() => sel.toggle(l[idCol])} className="accent-primary cursor-pointer" />
                    </td>
                  )}
                  {colunas.map(c => (
                    <td key={c.k} className={`py-1.5 ${c.num ? 'text-right' : 'text-left'}`}>
                      {c.fmt ? c.fmt(l[c.k]) : l[c.k]}
                    </td>
                  ))}
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={colunas.length + (sel ? 1 : 0)} className="py-4 text-center text-gray-400 text-xs">Nada encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Card({ titulo, nota, onExportar, children }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-gray-800">{titulo}</h3>
          {nota && <p className="text-xs text-gray-400 mb-3">{nota}</p>}
        </div>
        {onExportar && <BotaoExportar onClick={onExportar} />}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ label, valor, sub, destaque }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${destaque ? 'text-primary' : 'text-gray-800'}`}>{valor}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

/* ---------- Tela de senha ---------- */
function GateSenha({ onAutorizado }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [verificando, setVerificando] = useState(false);

  async function verificar(e) {
    e.preventDefault();
    if (!senha || verificando) return;
    setVerificando(true);
    try {
      await api.post('/diretoria/verificar', { senha });
      sessionStorage.setItem(CHAVE_SESSAO, '1');
      onAutorizado();
    } catch (err) {
      toast.error(`Acesso negado ao Dashboard da Diretoria: ${err.message || 'você não tem permissão para acessar esta área.'}`);
      navigate('/');
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <form onSubmit={verificar} className="bg-white rounded-lg border shadow-sm p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-2">🔐</div>
        <h2 className="font-title text-xl text-primary font-semibold mb-1">Área da Diretoria</h2>
        <p className="text-sm text-gray-500 mb-5">Acesso restrito. Informe a senha da diretoria para continuar.</p>
        <input
          type="password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha da diretoria"
          className="w-full border rounded-lg px-4 py-2.5 mb-4 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={verificando || !senha}
          className="w-full bg-primary text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {verificando ? 'Verificando…' : 'Entrar'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 py-1"
        >
          Voltar ao Dashboard
        </button>
      </form>
    </div>
  );
}

/* ---------- Página ---------- */
export default function Diretoria() {
  const toast = useToast();
  const [autorizada, setAutorizada] = useState(() => sessionStorage.getItem(CHAVE_SESSAO) === '1');
  const [periodo, setPeriodo] = useState('tudo');
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [porServico, setPorServico] = useState([]);
  const [porForma, setPorForma] = useState([]);
  const [porColab, setPorColab] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [comissoes, setComissoes] = useState(null);
  const [adAbertos, setAdAbertos] = useState([]);
  const [custom, setCustom] = useState({ data_inicio: '', data_fim: '' });

  const intervalo = useMemo(() => {
    if (periodo === 'personalizado') {
      if (custom.data_inicio && custom.data_fim && custom.data_inicio <= custom.data_fim) return custom;
      return null; // intervalo incompleto ou invertido: não busca
    }
    return intervaloPeriodo(periodo);
  }, [periodo, custom]);
  const sufixoArquivo = intervalo ? `${intervalo.data_inicio}_a_${intervalo.data_fim}` : '';

  const carregar = useCallback(async () => {
    if (!intervalo) return;
    setLoading(true);
    const qs = `data_inicio=${intervalo.data_inicio}&data_fim=${intervalo.data_fim}`;
    try {
      const [r, s, f, c, sd, com, ads] = await Promise.all([
        api.get(`/financeiro/resumo?${qs}`),
        api.get(`/financeiro/por-servico?${qs}`),
        api.get(`/financeiro/por-forma-pagamento?${qs}`),
        api.get(`/financeiro/por-colaboradora?${qs}`),
        api.get(`/financeiro/saidas?${qs}`),
        api.get(`/comissoes?todas=true&${qs}`),
        api.get(`/adiantamentos?status=aberto`).catch(() => []),
      ]);
      setAdAbertos(Array.isArray(ads) ? ads : []);
      setResumo(r);
      setPorServico(s.map(x => ({ ...x, quantidade: Number(x.quantidade), valor_total: Number(x.valor_total) })));
      setPorForma(f.map(x => ({ ...x, valor_total: Number(x.valor_total) })));
      setPorColab(c.map(x => ({ ...x, total_atendimentos: Number(x.total_atendimentos), faturamento: Number(x.faturamento) })));
      setSaidas(sd.map(x => ({ ...x, valor_unit: Number(x.valor_unit), quantidade: Number(x.quantidade), valor_total: Number(x.valor_total) })));
      setComissoes(com);
    } catch (err) {
      toast.error('Erro ao carregar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [intervalo, toast]);

  useEffect(() => {
    if (autorizada) carregar();
  }, [autorizada, carregar]);

  /* Seleções por dimensão (compartilhadas entre os cards da mesma dimensão) */
  const topReceita = useMemo(() => [...porServico].sort((a, b) => b.valor_total - a.valor_total), [porServico]);
  const idsServ = useMemo(() => topReceita.map(x => x.servico), [topReceita]);
  const selServ = useSelecao(idsServ);

  const idsFormas = useMemo(() => porForma.map(x => x.forma), [porForma]);
  const selFormas = useSelecao(idsFormas);

  const listaComissoes = useMemo(() => comissoes?.resultados || [], [comissoes]);
  const nomesColab = useMemo(() => [...new Set([
    ...porColab.map(x => x.colaboradora),
    ...listaComissoes.map(x => x.colaboradora?.nome),
  ])].filter(Boolean).sort(), [porColab, listaComissoes]);
  const selColab = useSelecao(nomesColab);

  if (!autorizada) return <GateSenha onAutorizado={() => setAutorizada(true)} />;

  const totalComissoes = comissoes ? Number(comissoes.total_geral_comissao || 0) : 0;
  const fat = resumo ? Number(resumo.faturamento_bruto || 0) : 0;
  const totSaidas = resumo ? Number(resumo.total_saidas || 0) : 0;
  const atend = resumo ? Number(resumo.total_atendimentos || 0) : 0;
  const liquido = fat - totalComissoes - totSaidas;
  const ticket = atend > 0 ? fat / atend : 0;

  const corColab = (nome) => CORES[nomesColab.indexOf(nome) % CORES.length];
  const corServ = (servico) => CORES[topReceita.findIndex(x => x.servico === servico) % CORES.length];

  const topQtde = [...porServico].sort((a, b) => b.quantidade - a.quantidade);
  const totalReceitaServ = porServico.reduce((s, x) => s + x.valor_total, 0);
  const totalQtdeServ = porServico.reduce((s, x) => s + x.quantidade, 0);
  const totalFormas = porForma.reduce((s, x) => s + x.valor_total, 0);

  /* Agregados da seleção de serviços (o coração do "filtrar A, B, C") */
  const servSelecionados = topReceita.filter(x => selServ.ativo(x.servico));
  const receitaSel = servSelecionados.reduce((s, x) => s + x.valor_total, 0);
  const qtdeSel = servSelecionados.reduce((s, x) => s + x.quantidade, 0);
  const formasSelValor = porForma.filter(x => selFormas.ativo(x.forma)).reduce((s, x) => s + x.valor_total, 0);
  const colabSelFat = porColab.filter(x => selColab.ativo(x.colaboradora)).reduce((s, x) => s + x.faturamento, 0);
  const comissaoSel = listaComissoes.filter(c => selColab.ativo(c.colaboradora?.nome)).reduce((s, c) => s + Number(c.total_comissao || 0), 0);

  /* ---------- Linhas para tabelas/exportação (respeitam a seleção) ---------- */
  const linhaServ = (x) => ({
    'Serviço': x.servico,
    'Quantidade': x.quantidade,
    'Receita (R$)': round2(x.valor_total),
    '% da receita': totalReceitaServ > 0 ? round2(100 * x.valor_total / totalReceitaServ) : 0,
  });
  const linhasServTodas = topReceita.map(linhaServ);
  const linhasServSel = servSelecionados.map(linhaServ);
  const linhaQtde = (x) => ({
    'Serviço': x.servico,
    'Quantidade': x.quantidade,
    '% dos atendimentos': totalQtdeServ > 0 ? round2(100 * x.quantidade / totalQtdeServ) : 0,
    'Receita (R$)': round2(x.valor_total),
  });
  const linhasQtdeTodas = topQtde.map(linhaQtde);
  const linhasQtdeSel = topQtde.filter(x => selServ.ativo(x.servico)).map(linhaQtde);
  const linhaForma = (x) => ({
    _id: x.forma,
    'Forma de pagamento': LABEL_FORMA[x.forma] || x.forma,
    'Valor (R$)': round2(x.valor_total),
    '% do recebido (período)': totalFormas > 0 ? round2(100 * x.valor_total / totalFormas) : 0,
  });
  const linhasFormasTodas = porForma.map(linhaForma);
  const linhasFormasSel = porForma.filter(x => selFormas.ativo(x.forma)).map(x => {
    const { _id, ...resto } = linhaForma(x);
    return resto;
  });
  const linhasDestino = [
    { 'Destino': 'Resultado do salão', 'Valor (R$)': round2(Math.max(0, liquido)), '% do faturamento': fat > 0 ? round2(100 * Math.max(0, liquido) / fat) : 0 },
    { 'Destino': 'Comissões', 'Valor (R$)': round2(totalComissoes), '% do faturamento': fat > 0 ? round2(100 * totalComissoes / fat) : 0 },
    { 'Destino': 'Saídas', 'Valor (R$)': round2(totSaidas), '% do faturamento': fat > 0 ? round2(100 * totSaidas / fat) : 0 },
  ];
  const linhaColab = (x) => ({
    'Colaboradora': x.colaboradora,
    'Atendimentos': x.total_atendimentos,
    'Faturamento (R$)': round2(x.faturamento),
  });
  const linhasColabTodas = porColab.map(linhaColab);
  const linhasColabSel = porColab.filter(x => selColab.ativo(x.colaboradora)).map(linhaColab);
  const linhaComissao = (c) => ({
    'Colaboradora': c.colaboradora?.nome,
    'Serviços (R$)': round2(c.total_servicos_valor),
    'Comissão (R$)': round2(c.total_comissao),
    '% efetiva': Number(c.total_servicos_valor) > 0 ? round2(100 * Number(c.total_comissao) / Number(c.total_servicos_valor)) : 0,
  });
  const linhasComissoesTodas = listaComissoes.map(linhaComissao);
  const linhasComissoesSel = listaComissoes.filter(c => selColab.ativo(c.colaboradora?.nome)).map(linhaComissao);
  const linhasSaidas = saidas.map(x => ({
    'Data': x.data?.slice(0, 10),
    'Descrição': x.descricao,
    'Marca': x.marca || '',
    'Fornecedor': x.fornecedor || '',
    'Valor unit. (R$)': round2(x.valor_unit),
    'Quantidade': x.quantidade,
    'Total (R$)': round2(x.valor_total),
  }));
  const linhasResumo = [{
    'Período': `${intervalo.data_inicio} a ${intervalo.data_fim}`,
    'Faturamento bruto (R$)': round2(fat),
    'Saídas (R$)': round2(totSaidas),
    'Saldo (R$)': round2(resumo?.saldo),
    'Comissões (R$)': round2(totalComissoes),
    'Resultado do salão (R$)': round2(liquido),
    'Atendimentos': atend,
    'Ticket médio (R$)': round2(ticket),
  }];

  function exportarTudo() {
    exportarExcel(`diretoria_completo_${sufixoArquivo}.xlsx`, [
      { nome: 'Resumo', linhas: linhasResumo },
      { nome: 'Serviços', linhas: linhasServTodas },
      { nome: 'Formas de pagamento', linhas: porForma.map(x => ({ 'Forma de pagamento': LABEL_FORMA[x.forma] || x.forma, 'Valor (R$)': round2(x.valor_total), '% do recebido': totalFormas > 0 ? round2(100 * x.valor_total / totalFormas) : 0 })) },
      { nome: 'Destino da receita', linhas: linhasDestino },
      { nome: 'Colaboradoras', linhas: porColab.map(x => ({ 'Colaboradora': x.colaboradora, 'Atendimentos': x.total_atendimentos, 'Faturamento (R$)': round2(x.faturamento) })) },
      { nome: 'Comissões', linhas: listaComissoes.map(c => ({ 'Colaboradora': c.colaboradora?.nome, 'Serviços (R$)': round2(c.total_servicos_valor), 'Comissão (R$)': round2(c.total_comissao) })) },
      { nome: 'Saídas', linhas: linhasSaidas },
    ]);
    toast.success('Excel completo exportado!');
  }

  const exportar = (nome, aba, linhas) => () => {
    exportarExcel(`diretoria_${nome}_${sufixoArquivo}.xlsx`, [{ nome: aba, linhas }]);
    toast.success('Exportado para Excel!');
  };

  const fmtP = (v) => fmtPctNum(v);
  const fmtR = (v) => 'R$ ' + formatCurrency(v);

  const colServ = [
    { k: 'Serviço', label: 'Serviço' },
    { k: 'Quantidade', label: 'Qtde', num: true },
    { k: 'Receita (R$)', label: 'Receita', num: true, fmt: fmtR },
    { k: '% da receita', label: '%', num: true, fmt: fmtP },
  ];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h2 className="font-title text-2xl text-gray-800 font-semibold">Dashboard da Diretoria</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-primary-light text-primary rounded-full px-3 py-1 font-medium">Acesso restrito</span>
          <button
            onClick={exportarTudo}
            className="text-sm bg-primary text-white rounded-lg px-4 py-1.5 font-medium hover:opacity-90"
          >
            ⬇ Exportar tudo (Excel)
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Visão financeira completa{intervalo ? ` — ${intervalo.data_inicio.split('-').reverse().join('/')} a ${intervalo.data_fim.split('-').reverse().join('/')}` : ''} ·
        clique nos itens das legendas ou marque nas tabelas para exibir/ocultar e analisar só o que interessa
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {PERIODOS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
              periodo === p.key ? 'bg-primary text-white border-primary font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        {periodo === 'personalizado' && (
          <span className="flex items-center gap-2 text-sm bg-white border rounded-full px-3 py-1">
            <input
              type="date"
              value={custom.data_inicio}
              max={custom.data_fim || undefined}
              onChange={(e) => setCustom(c => ({ ...c, data_inicio: e.target.value }))}
              className="text-sm text-gray-700 focus:outline-none"
            />
            <span className="text-gray-400">até</span>
            <input
              type="date"
              value={custom.data_fim}
              min={custom.data_inicio || undefined}
              onChange={(e) => setCustom(c => ({ ...c, data_fim: e.target.value }))}
              className="text-sm text-gray-700 focus:outline-none"
            />
          </span>
        )}
      </div>

      {periodo === 'personalizado' && !intervalo && (
        <p className="text-sm text-gray-400 mb-4">Informe a data inicial e a final para carregar o período.</p>
      )}
      {loading && <p className="text-sm text-gray-400 mb-4">Carregando dados…</p>}

      {resumo && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
            <KpiCard label="Faturamento bruto" valor={fmtR(fat)} sub={`${atend} atendimentos`} destaque />
            <KpiCard label="Saídas (despesas)" valor={fmtR(totSaidas)} sub={pct(totSaidas, fat) + ' do faturamento'} />
            <KpiCard label="Saldo (fat. − saídas)" valor={fmtR(resumo.saldo)} />
            <KpiCard label="Comissões" valor={fmtR(totalComissoes)} sub={pct(totalComissoes, fat) + ' do faturamento'} />
            <KpiCard label="Resultado do salão" valor={fmtR(liquido)} sub="fat. − comissões − saídas" />
            <KpiCard label="Ticket médio" valor={atend > 0 ? fmtR(ticket) : '—'} sub="por atendimento" />
          </div>

          {adAbertos.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 mb-3 text-sm text-amber-800">
              <span className="font-semibold">⚠ Adiantamentos em aberto ({adAbertos.length}):</span>{' '}
              {adAbertos.map(a => `${a.cliente_nome} R$ ${formatCurrency(a.valor)} (${a.data?.split('-').reverse().join('/')})`).join(' · ')}
              {' — '}total <b>R$ {formatCurrency(adAbertos.reduce((s, a) => s + Number(a.valor), 0))}</b>. Sinais recebidos e ainda não aplicados em comandas.
            </div>
          )}

          {(selServ.filtrando || selFormas.filtrando || selColab.filtrando) && (
            <div className="bg-primary-light border border-primary/30 rounded-lg px-4 py-3 mb-5 text-sm text-gray-700 flex flex-wrap gap-x-6 gap-y-1">
              <span className="font-semibold text-primary">Análise da seleção:</span>
              {selServ.filtrando && (
                <span>Serviços ({selServ.qtdAtivos}/{selServ.total}): <b>{fmtR(receitaSel)}</b> · {qtdeSel} execuções · {pct(receitaSel, totalReceitaServ)} da receita de serviços</span>
              )}
              {selFormas.filtrando && (
                <span>Formas ({selFormas.qtdAtivos}/{selFormas.total}): <b>{fmtR(formasSelValor)}</b> · {pct(formasSelValor, totalFormas)} do recebido</span>
              )}
              {selColab.filtrando && (
                <span>Colaboradoras ({selColab.qtdAtivos}/{selColab.total}): <b>{fmtR(colabSelFat)}</b> faturados · {fmtR(comissaoSel)} em comissões</span>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <Card titulo="Receita por serviço" nota="Marque/desmarque serviços na tabela ou legenda."
              onExportar={exportar('receita_por_servico', 'Receita por serviço', linhasServSel)}>
              <DonutFiltravel
                sel={selServ}
                dados={topReceita.slice(0, 12).map(x => ({ id: x.servico, label: x.servico, valor: x.valor_total, cor: corServ(x.servico) }))}
              />
              <BarraSelecao sel={selServ} resumoSelecao={`${fmtR(receitaSel)} (${pct(receitaSel, totalReceitaServ)} da receita)`} />
              <TabelaBusca colunas={colServ} linhas={linhasServTodas} sel={selServ} idCol="Serviço" rotulo="Ver todos os serviços" />
            </Card>

            <Card titulo="Atendimentos por serviço" nota="Mesma seleção do card de receita — compare volume × receita."
              onExportar={exportar('atendimentos_por_servico', 'Atendimentos por serviço', linhasQtdeSel)}>
              <DonutFiltravel
                sel={selServ}
                formato={(v) => `${v}×`}
                dados={topQtde.slice(0, 12).map(x => ({ id: x.servico, label: x.servico, valor: x.quantidade, cor: corServ(x.servico) }))}
              />
              <BarraSelecao sel={selServ} resumoSelecao={`${qtdeSel} execuções (${pct(qtdeSel, totalQtdeServ)} do total)`} />
              <TabelaBusca
                colunas={[
                  { k: 'Serviço', label: 'Serviço' },
                  { k: 'Quantidade', label: 'Qtde', num: true },
                  { k: '% dos atendimentos', label: '%', num: true, fmt: fmtP },
                ]}
                linhas={linhasQtdeTodas}
                sel={selServ}
                idCol="Serviço"
                rotulo="Ver todos os serviços"
              />
            </Card>

            <Card titulo="Formas de pagamento" nota="Abatimentos não entram, seguindo a regra do app."
              onExportar={exportar('formas_de_pagamento', 'Formas de pagamento', linhasFormasSel)}>
              <DonutFiltravel
                sel={selFormas}
                dados={porForma.map((x, i) => ({ id: x.forma, label: LABEL_FORMA[x.forma] || x.forma, valor: x.valor_total, cor: CORES[i % CORES.length] }))}
              />
              <BarraSelecao sel={selFormas} resumoSelecao={`${fmtR(formasSelValor)} (${pct(formasSelValor, totalFormas)} do recebido)`} />
              <TabelaBusca
                colunas={[
                  { k: 'Forma de pagamento', label: 'Forma' },
                  { k: 'Valor (R$)', label: 'Valor', num: true, fmt: fmtR },
                  { k: '% do recebido (período)', label: '%', num: true, fmt: fmtP },
                ]}
                linhas={linhasFormasTodas}
                sel={selFormas}
                idCol="_id"
                rotulo="Ver tabela"
              />
            </Card>

            <Card titulo="Destino da receita" nota="Como o faturamento do período se divide."
              onExportar={exportar('destino_da_receita', 'Destino da receita', linhasDestino)}>
              <DonutFiltravel
                sel={{ ativo: () => true, toggle: () => {}, filtrando: false, qtdAtivos: 3, total: 3, todos: () => {}, nenhum: () => {} }}
                dados={[
                  { id: 'resultado', label: 'Resultado do salão', valor: Math.max(0, liquido), cor: CORES[0] },
                  { id: 'comissoes', label: 'Comissões', valor: totalComissoes, cor: CORES[1] },
                  { id: 'saidas', label: 'Saídas', valor: totSaidas, cor: CORES[2] },
                ]}
              />
              <TabelaBusca
                colunas={[
                  { k: 'Destino', label: 'Destino' },
                  { k: 'Valor (R$)', label: 'Valor', num: true, fmt: fmtR },
                  { k: '% do faturamento', label: '%', num: true, fmt: fmtP },
                ]}
                linhas={linhasDestino}
                rotulo="Ver tabela"
              />
            </Card>

            <Card titulo="Faturamento por colaboradora" nota="Seleção compartilhada com o card de comissões."
              onExportar={exportar('faturamento_colaboradoras', 'Colaboradoras', linhasColabSel)}>
              <DonutFiltravel
                sel={selColab}
                dados={porColab.map(x => ({ id: x.colaboradora, label: x.colaboradora, valor: x.faturamento, cor: corColab(x.colaboradora) }))}
              />
              <BarraSelecao sel={selColab} resumoSelecao={`${fmtR(colabSelFat)} faturados`} />
              <TabelaBusca
                colunas={[
                  { k: 'Colaboradora', label: 'Colaboradora' },
                  { k: 'Atendimentos', label: 'Atend.', num: true },
                  { k: 'Faturamento (R$)', label: 'Faturamento', num: true, fmt: fmtR },
                ]}
                linhas={linhasColabTodas}
                sel={selColab}
                idCol="Colaboradora"
                rotulo="Ver tabela"
              />
            </Card>

            <Card titulo="Comissões por colaboradora" nota="Comissão apurada no período."
              onExportar={exportar('comissoes', 'Comissões', linhasComissoesSel)}>
              <DonutFiltravel
                sel={selColab}
                dados={listaComissoes.map(x => ({ id: x.colaboradora?.nome, label: x.colaboradora?.nome, valor: Number(x.total_comissao || 0), cor: corColab(x.colaboradora?.nome) }))}
              />
              <BarraSelecao sel={selColab} resumoSelecao={`${fmtR(comissaoSel)} em comissões`} />
              <TabelaBusca
                colunas={[
                  { k: 'Colaboradora', label: 'Colaboradora' },
                  { k: 'Serviços (R$)', label: 'Serviços', num: true, fmt: fmtR },
                  { k: 'Comissão (R$)', label: 'Comissão', num: true, fmt: fmtR },
                  { k: '% efetiva', label: '% efetiva', num: true, fmt: fmtP },
                ]}
                linhas={linhasComissoesTodas}
                sel={selColab}
                idCol="Colaboradora"
                rotulo="Ver detalhamento"
              />
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <Card titulo="Top serviços por receita" nota="Ranking apenas dos serviços selecionados."
              onExportar={exportar('ranking_servicos', 'Ranking de serviços', linhasServSel)}>
              <div className="space-y-2">
                {servSelecionados.slice(0, 10).map((s, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span className="truncate">{s.servico}</span>
                      <span className="font-medium whitespace-nowrap">{fmtR(s.valor_total)} · {s.quantidade}×</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${servSelecionados[0]?.valor_total > 0 ? (s.valor_total / servSelecionados[0].valor_total) * 100 : 0}%`, backgroundColor: CORES[0] }} />
                    </div>
                  </div>
                ))}
                {servSelecionados.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Nenhum serviço selecionado.</p>}
              </div>
            </Card>

            <Card titulo="Saídas do período" nota="Todas as despesas lançadas no período."
              onExportar={exportar('saidas', 'Saídas', linhasSaidas)}>
              <TabelaBusca
                aberta
                rotulo="Ver lançamentos"
                colunas={[
                  { k: 'Data', label: 'Data', fmt: (v) => v ? v.split('-').reverse().join('/') : '' },
                  { k: 'Descrição', label: 'Descrição' },
                  { k: 'Marca', label: 'Marca' },
                  { k: 'Fornecedor', label: 'Fornecedor' },
                  { k: 'Quantidade', label: 'Qtde', num: true },
                  { k: 'Total (R$)', label: 'Total', num: true, fmt: fmtR },
                ]}
                linhas={linhasSaidas}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
