import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import * as XLSX from 'xlsx';
import api from '../../api.js';
import { useToast } from '../../components/Toast.jsx';

/*
 * DASHBOARD DA DIRETORIA — acesso restrito por senha (interino até a Fase 3).
 * A senha não existe neste código: o frontend envia o que foi digitado para
 * POST /diretoria/verificar e o backend compara apenas hashes (SHA-256 em
 * variável de ambiente). Na Fase 3, substituir o gate de senha pelo
 * usePermissao('dashboard', 'ver') do perfil admin.
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

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function round2(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

/* ---------- Exportação Excel ---------- */
function exportarExcel(nomeArquivo, abas) {
  // abas: [{ nome, linhas: [objetos com chaves = cabeçalhos] }]
  const wb = XLSX.utils.book_new();
  abas.forEach(({ nome, linhas }) => {
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Aviso: 'Sem dados no período' }]);
    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
  });
  XLSX.writeFile(wb, nomeArquivo);
}

function BotaoExportar({ onClick, titulo = 'Exportar para Excel' }) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      className="text-xs border rounded-md px-2.5 py-1 text-gray-500 hover:bg-primary-light hover:text-primary hover:border-primary transition-colors shrink-0"
    >
      ⬇ Excel
    </button>
  );
}

/* ---------- Donut SVG (sem dependência de gráficos) ---------- */
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

function Donut({ dados, formato = (v) => 'R$ ' + formatCurrency(v) }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) return <p className="text-sm text-gray-400 py-10 text-center">Sem dados no período.</p>;
  let ang = -Math.PI / 2;
  const fatias = dados.filter(d => d.valor > 0).map(d => {
    const a0 = ang;
    const frac = d.valor / total;
    ang += frac * 2 * Math.PI;
    const a1 = frac >= 0.9999 ? a0 + 2 * Math.PI - 0.0001 : ang;
    return { ...d, a0, a1 };
  });
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 180 180" className="w-44 h-44">
        {fatias.map((f, i) => (
          <path key={i} d={arco(90, 90, 82, 50, f.a0, f.a1)} fill={f.cor} stroke="#ffffff" strokeWidth="2">
            <title>{`${f.label}: ${formato(f.valor)} (${pct(f.valor, total)})`}</title>
          </path>
        ))}
      </svg>
      <ul className="w-full text-xs text-gray-600 space-y-1">
        {fatias.map((f, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: f.cor }} />
            <span className="truncate">{f.label}</span>
            <span className="ml-auto whitespace-nowrap font-medium text-gray-700">
              {formato(f.valor)} · {pct(f.valor, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Tabela com busca (usada em todos os cards) ---------- */
function TabelaBusca({ colunas, linhas, aberta = false, rotulo = 'Ver tabela' }) {
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
              {colunas.map(c => (
                <th key={c.k} className={`py-2 ${c.num ? 'text-right' : 'text-left'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l, i) => (
              <tr key={i} className="border-b border-gray-100">
                {colunas.map(c => (
                  <td key={c.k} className={`py-1.5 ${c.num ? 'text-right' : 'text-left'}`}>
                    {c.fmt ? c.fmt(l[c.k]) : l[c.k]}
                  </td>
                ))}
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={colunas.length} className="py-4 text-center text-gray-400 text-xs">Nada encontrado.</td></tr>
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

  const intervalo = useMemo(() => intervaloPeriodo(periodo), [periodo]);
  const sufixoArquivo = `${intervalo.data_inicio}_a_${intervalo.data_fim}`;

  const carregar = useCallback(async () => {
    setLoading(true);
    const qs = `data_inicio=${intervalo.data_inicio}&data_fim=${intervalo.data_fim}`;
    try {
      const [r, s, f, c, sd, com] = await Promise.all([
        api.get(`/financeiro/resumo?${qs}`),
        api.get(`/financeiro/por-servico?${qs}`),
        api.get(`/financeiro/por-forma-pagamento?${qs}`),
        api.get(`/financeiro/por-colaboradora?${qs}`),
        api.get(`/financeiro/saidas?${qs}`),
        api.get(`/comissoes?todas=true&${qs}`),
      ]);
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

  if (!autorizada) return <GateSenha onAutorizado={() => setAutorizada(true)} />;

  const totalComissoes = comissoes ? Number(comissoes.total_geral_comissao || 0) : 0;
  const fat = resumo ? Number(resumo.faturamento_bruto || 0) : 0;
  const totSaidas = resumo ? Number(resumo.total_saidas || 0) : 0;
  const atend = resumo ? Number(resumo.total_atendimentos || 0) : 0;
  const liquido = fat - totalComissoes - totSaidas;
  const ticket = atend > 0 ? fat / atend : 0;

  const topReceita = [...porServico].sort((a, b) => b.valor_total - a.valor_total);
  const topQtde = [...porServico].sort((a, b) => b.quantidade - a.quantidade);
  const totalReceitaServ = porServico.reduce((s, x) => s + x.valor_total, 0);
  const totalQtdeServ = porServico.reduce((s, x) => s + x.quantidade, 0);
  const totalFormas = porForma.reduce((s, x) => s + x.valor_total, 0);
  const listaComissoes = comissoes?.resultados || [];

  function fatiasServico(lista, campo) {
    const top = lista.slice(0, 5).map((x, i) => ({ label: x.servico, valor: x[campo], cor: CORES[i] }));
    const resto = lista.slice(5).reduce((s, x) => s + x[campo], 0);
    if (resto > 0) top.push({ label: `Outros (${lista.length - 5} serviços)`, valor: resto, cor: COR_OUTROS });
    return top;
  }

  const nomesColab = [...new Set([
    ...porColab.map(x => x.colaboradora),
    ...listaComissoes.map(x => x.colaboradora?.nome),
  ])].filter(Boolean).sort();
  const corColab = (nome) => CORES[nomesColab.indexOf(nome) % CORES.length];

  /* ---------- Conjuntos de dados para tabelas e exportação ---------- */
  const linhasServicos = topReceita.map(x => ({
    'Serviço': x.servico,
    'Quantidade': x.quantidade,
    'Receita (R$)': round2(x.valor_total),
    '% da receita': totalReceitaServ > 0 ? round2(100 * x.valor_total / totalReceitaServ) : 0,
  }));
  const linhasQtde = topQtde.map(x => ({
    'Serviço': x.servico,
    'Quantidade': x.quantidade,
    '% dos atendimentos': totalQtdeServ > 0 ? round2(100 * x.quantidade / totalQtdeServ) : 0,
    'Receita (R$)': round2(x.valor_total),
  }));
  const linhasFormas = porForma.map(x => ({
    'Forma de pagamento': LABEL_FORMA[x.forma] || x.forma,
    'Valor (R$)': round2(x.valor_total),
    '% do recebido': totalFormas > 0 ? round2(100 * x.valor_total / totalFormas) : 0,
  }));
  const linhasDestino = [
    { 'Destino': 'Resultado do salão', 'Valor (R$)': round2(Math.max(0, liquido)), '% do faturamento': fat > 0 ? round2(100 * Math.max(0, liquido) / fat) : 0 },
    { 'Destino': 'Comissões', 'Valor (R$)': round2(totalComissoes), '% do faturamento': fat > 0 ? round2(100 * totalComissoes / fat) : 0 },
    { 'Destino': 'Saídas', 'Valor (R$)': round2(totSaidas), '% do faturamento': fat > 0 ? round2(100 * totSaidas / fat) : 0 },
  ];
  const linhasColab = porColab.map(x => ({
    'Colaboradora': x.colaboradora,
    'Atendimentos': x.total_atendimentos,
    'Faturamento (R$)': round2(x.faturamento),
  }));
  const linhasComissoes = listaComissoes.map(c => ({
    'Colaboradora': c.colaboradora?.nome,
    'Serviços (R$)': round2(c.total_servicos_valor),
    'Comissão (R$)': round2(c.total_comissao),
    '% efetiva': Number(c.total_servicos_valor) > 0 ? round2(100 * Number(c.total_comissao) / Number(c.total_servicos_valor)) : 0,
  }));
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
      { nome: 'Serviços', linhas: linhasServicos },
      { nome: 'Formas de pagamento', linhas: linhasFormas },
      { nome: 'Destino da receita', linhas: linhasDestino },
      { nome: 'Colaboradoras', linhas: linhasColab },
      { nome: 'Comissões', linhas: linhasComissoes },
      { nome: 'Saídas', linhas: linhasSaidas },
    ]);
    toast.success('Excel completo exportado!');
  }

  const exportar = (nome, aba, linhas) => () => {
    exportarExcel(`diretoria_${nome}_${sufixoArquivo}.xlsx`, [{ nome: aba, linhas }]);
    toast.success('Exportado para Excel!');
  };

  const colServ = [
    { k: 'Serviço', label: 'Serviço' },
    { k: 'Quantidade', label: 'Qtde', num: true },
    { k: 'Receita (R$)', label: 'Receita', num: true, fmt: (v) => 'R$ ' + formatCurrency(v) },
    { k: '% da receita', label: '%', num: true, fmt: (v) => formatCurrency(v).replace(',00', '') + '%' },
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
        Visão financeira completa — {intervalo.data_inicio.split('-').reverse().join('/')} a {intervalo.data_fim.split('-').reverse().join('/')}
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
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
      </div>

      {loading && <p className="text-sm text-gray-400 mb-4">Carregando dados…</p>}

      {resumo && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <KpiCard label="Faturamento bruto" valor={`R$ ${formatCurrency(fat)}`} sub={`${atend} atendimentos`} destaque />
            <KpiCard label="Saídas (despesas)" valor={`R$ ${formatCurrency(totSaidas)}`} sub={pct(totSaidas, fat) + ' do faturamento'} />
            <KpiCard label="Saldo (fat. − saídas)" valor={`R$ ${formatCurrency(resumo.saldo)}`} />
            <KpiCard label="Comissões" valor={`R$ ${formatCurrency(totalComissoes)}`} sub={pct(totalComissoes, fat) + ' do faturamento'} />
            <KpiCard label="Resultado do salão" valor={`R$ ${formatCurrency(liquido)}`} sub="fat. − comissões − saídas" />
            <KpiCard label="Ticket médio" valor={atend > 0 ? `R$ ${formatCurrency(ticket)}` : '—'} sub="por atendimento" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <Card titulo="Receita por serviço" nota="Top 5 do período — demais em Outros."
              onExportar={exportar('receita_por_servico', 'Receita por serviço', linhasServicos)}>
              <Donut dados={fatiasServico(topReceita, 'valor_total')} />
              <TabelaBusca colunas={colServ} linhas={linhasServicos} />
            </Card>

            <Card titulo="Atendimentos por serviço" nota="Quantidade de execuções por serviço."
              onExportar={exportar('atendimentos_por_servico', 'Atendimentos por serviço', linhasQtde)}>
              <Donut dados={fatiasServico(topQtde, 'quantidade')} formato={(v) => `${v}×`} />
              <TabelaBusca
                colunas={[
                  { k: 'Serviço', label: 'Serviço' },
                  { k: 'Quantidade', label: 'Qtde', num: true },
                  { k: '% dos atendimentos', label: '%', num: true, fmt: (v) => formatCurrency(v).replace(',00', '') + '%' },
                ]}
                linhas={linhasQtde}
              />
            </Card>

            <Card titulo="Formas de pagamento" nota="Abatimentos não entram, seguindo a regra do app."
              onExportar={exportar('formas_de_pagamento', 'Formas de pagamento', linhasFormas)}>
              <Donut dados={porForma.map((x, i) => ({ label: LABEL_FORMA[x.forma] || x.forma, valor: x.valor_total, cor: CORES[i % CORES.length] }))} />
              <TabelaBusca
                colunas={[
                  { k: 'Forma de pagamento', label: 'Forma' },
                  { k: 'Valor (R$)', label: 'Valor', num: true, fmt: (v) => 'R$ ' + formatCurrency(v) },
                  { k: '% do recebido', label: '%', num: true, fmt: (v) => formatCurrency(v).replace(',00', '') + '%' },
                ]}
                linhas={linhasFormas}
              />
            </Card>

            <Card titulo="Destino da receita" nota="Como o faturamento se divide."
              onExportar={exportar('destino_da_receita', 'Destino da receita', linhasDestino)}>
              <Donut dados={[
                { label: 'Resultado do salão', valor: Math.max(0, liquido), cor: CORES[0] },
                { label: 'Comissões', valor: totalComissoes, cor: CORES[1] },
                { label: 'Saídas', valor: totSaidas, cor: CORES[2] },
              ]} />
              <TabelaBusca
                colunas={[
                  { k: 'Destino', label: 'Destino' },
                  { k: 'Valor (R$)', label: 'Valor', num: true, fmt: (v) => 'R$ ' + formatCurrency(v) },
                  { k: '% do faturamento', label: '%', num: true, fmt: (v) => formatCurrency(v).replace(',00', '') + '%' },
                ]}
                linhas={linhasDestino}
              />
            </Card>

            <Card titulo="Faturamento por colaboradora" nota="Serviços divididos contam para cada participante."
              onExportar={exportar('faturamento_colaboradoras', 'Colaboradoras', linhasColab)}>
              <Donut dados={porColab.map(x => ({ label: x.colaboradora, valor: x.faturamento, cor: corColab(x.colaboradora) }))} />
              <TabelaBusca
                colunas={[
                  { k: 'Colaboradora', label: 'Colaboradora' },
                  { k: 'Atendimentos', label: 'Atend.', num: true },
                  { k: 'Faturamento (R$)', label: 'Faturamento', num: true, fmt: (v) => 'R$ ' + formatCurrency(v) },
                ]}
                linhas={linhasColab}
              />
            </Card>

            <Card titulo="Comissões por colaboradora" nota="Comissão apurada no período."
              onExportar={exportar('comissoes', 'Comissões', linhasComissoes)}>
              <Donut dados={listaComissoes.map(x => ({ label: x.colaboradora?.nome, valor: Number(x.total_comissao || 0), cor: corColab(x.colaboradora?.nome) }))} />
              <TabelaBusca
                colunas={[
                  { k: 'Colaboradora', label: 'Colaboradora' },
                  { k: 'Serviços (R$)', label: 'Serviços', num: true, fmt: (v) => 'R$ ' + formatCurrency(v) },
                  { k: 'Comissão (R$)', label: 'Comissão', num: true, fmt: (v) => 'R$ ' + formatCurrency(v) },
                  { k: '% efetiva', label: '% efetiva', num: true, fmt: (v) => formatCurrency(v).replace(',00', '') + '%' },
                ]}
                linhas={linhasComissoes}
              />
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <Card titulo="Top serviços por receita" nota="Ranking do período selecionado."
              onExportar={exportar('ranking_servicos', 'Ranking de serviços', linhasServicos)}>
              <div className="space-y-2">
                {topReceita.slice(0, 8).map((s, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span className="truncate">{s.servico}</span>
                      <span className="font-medium whitespace-nowrap">R$ {formatCurrency(s.valor_total)} · {s.quantidade}×</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${topReceita[0].valor_total > 0 ? (s.valor_total / topReceita[0].valor_total) * 100 : 0}%`, backgroundColor: CORES[0] }} />
                    </div>
                  </div>
                ))}
                {topReceita.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Sem serviços no período.</p>}
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
                  { k: 'Total (R$)', label: 'Total', num: true, fmt: (v) => 'R$ ' + formatCurrency(v) },
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
