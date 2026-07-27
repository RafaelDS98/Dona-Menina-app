import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
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

/* ---------- Donut SVG (sem dependência externa) ---------- */
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

function Card({ titulo, nota, children }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <h3 className="font-medium text-gray-800">{titulo}</h3>
      {nota && <p className="text-xs text-gray-400 mb-3">{nota}</p>}
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
      // Senha incorreta (ou bloqueio): informa o erro de permissão e volta ao Dashboard
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
  const [comissoes, setComissoes] = useState(null);

  const intervalo = useMemo(() => intervaloPeriodo(periodo), [periodo]);

  const carregar = useCallback(async () => {
    setLoading(true);
    const qs = `data_inicio=${intervalo.data_inicio}&data_fim=${intervalo.data_fim}`;
    try {
      const [r, s, f, c, com] = await Promise.all([
        api.get(`/financeiro/resumo?${qs}`),
        api.get(`/financeiro/por-servico?${qs}`),
        api.get(`/financeiro/por-forma-pagamento?${qs}`),
        api.get(`/financeiro/por-colaboradora?${qs}`),
        api.get(`/comissoes?todas=true&${qs}`),
      ]);
      setResumo(r);
      setPorServico(s.map(x => ({ ...x, quantidade: Number(x.quantidade), valor_total: Number(x.valor_total) })));
      setPorForma(f.map(x => ({ ...x, valor_total: Number(x.valor_total) })));
      setPorColab(c.map(x => ({ ...x, total_atendimentos: Number(x.total_atendimentos), faturamento: Number(x.faturamento) })));
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
  const saidas = resumo ? Number(resumo.total_saidas || 0) : 0;
  const atend = resumo ? Number(resumo.total_atendimentos || 0) : 0;
  const liquido = fat - totalComissoes - saidas;
  const ticket = atend > 0 ? fat / atend : 0;

  const topReceita = [...porServico].sort((a, b) => b.valor_total - a.valor_total);
  const topQtde = [...porServico].sort((a, b) => b.quantidade - a.quantidade);

  function fatiasServico(lista, campo) {
    const top = lista.slice(0, 5).map((x, i) => ({ label: x.servico, valor: x[campo], cor: CORES[i] }));
    const resto = lista.slice(5).reduce((s, x) => s + x[campo], 0);
    if (resto > 0) top.push({ label: `Outros (${lista.length - 5} serviços)`, valor: resto, cor: COR_OUTROS });
    return top;
  }

  const nomesColab = [...new Set([
    ...porColab.map(x => x.colaboradora),
    ...(comissoes?.resultados || []).map(x => x.colaboradora?.nome),
  ])].filter(Boolean).sort();
  const corColab = (nome) => CORES[nomesColab.indexOf(nome) % CORES.length];

  const maxRank = topReceita.length ? topReceita[0].valor_total : 0;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h2 className="font-title text-2xl text-gray-800 font-semibold">Dashboard da Diretoria</h2>
        <span className="text-xs bg-primary-light text-primary rounded-full px-3 py-1 font-medium">Acesso restrito</span>
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
            <KpiCard label="Saídas (despesas)" valor={`R$ ${formatCurrency(saidas)}`} sub={pct(saidas, fat) + ' do faturamento'} />
            <KpiCard label="Saldo (fat. − saídas)" valor={`R$ ${formatCurrency(resumo.saldo)}`} />
            <KpiCard label="Comissões" valor={`R$ ${formatCurrency(totalComissoes)}`} sub={pct(totalComissoes, fat) + ' do faturamento'} />
            <KpiCard label="Resultado do salão" valor={`R$ ${formatCurrency(liquido)}`} sub="fat. − comissões − saídas" />
            <KpiCard label="Ticket médio" valor={atend > 0 ? `R$ ${formatCurrency(ticket)}` : '—'} sub="por atendimento" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <Card titulo="Receita por serviço" nota="Top 5 do período — demais agrupados em Outros.">
              <Donut dados={fatiasServico(topReceita, 'valor_total')} />
            </Card>
            <Card titulo="Atendimentos por serviço" nota="Quantidade de execuções por serviço.">
              <Donut dados={fatiasServico(topQtde, 'quantidade')} formato={(v) => `${v}×`} />
            </Card>
            <Card titulo="Formas de pagamento" nota="Abatimentos não entram, seguindo a regra do app.">
              <Donut dados={porForma.map((x, i) => ({ label: LABEL_FORMA[x.forma] || x.forma, valor: x.valor_total, cor: CORES[i % CORES.length] }))} />
            </Card>
            <Card titulo="Destino da receita" nota="Como o faturamento se divide.">
              <Donut dados={[
                { label: 'Resultado do salão', valor: Math.max(0, liquido), cor: CORES[0] },
                { label: 'Comissões', valor: totalComissoes, cor: CORES[1] },
                { label: 'Saídas', valor: saidas, cor: CORES[2] },
              ]} />
            </Card>
            <Card titulo="Faturamento por colaboradora" nota="Serviços divididos contam para cada participante.">
              <Donut dados={porColab.map(x => ({ label: x.colaboradora, valor: x.faturamento, cor: corColab(x.colaboradora) }))} />
            </Card>
            <Card titulo="Comissões por colaboradora" nota="Comissão apurada no período.">
              <Donut dados={(comissoes?.resultados || []).map(x => ({ label: x.colaboradora?.nome, valor: Number(x.total_comissao || 0), cor: corColab(x.colaboradora?.nome) }))} />
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <Card titulo="Top serviços por receita" nota="Ranking do período selecionado.">
              <div className="space-y-2">
                {topReceita.slice(0, 8).map((s, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span className="truncate">{s.servico}</span>
                      <span className="font-medium whitespace-nowrap">R$ {formatCurrency(s.valor_total)} · {s.quantidade}×</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${maxRank > 0 ? (s.valor_total / maxRank) * 100 : 0}%`, backgroundColor: CORES[0] }} />
                    </div>
                  </div>
                ))}
                {topReceita.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">Sem serviços no período.</p>}
              </div>
            </Card>

            <Card titulo="Comissões — detalhamento" nota="Percentual efetivo = comissão ÷ valor dos serviços.">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    <th className="text-left py-2">Colaboradora</th>
                    <th className="text-right py-2">Serviços (R$)</th>
                    <th className="text-right py-2">Comissão (R$)</th>
                    <th className="text-right py-2">% efetiva</th>
                  </tr>
                </thead>
                <tbody>
                  {(comissoes?.resultados || []).map((c, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: corColab(c.colaboradora?.nome) }} />
                        {c.colaboradora?.nome}
                      </td>
                      <td className="text-right">R$ {formatCurrency(c.total_servicos_valor)}</td>
                      <td className="text-right">R$ {formatCurrency(c.total_comissao)}</td>
                      <td className="text-right">{pct(Number(c.total_comissao || 0), Number(c.total_servicos_valor || 0))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 font-semibold">Total</td>
                    <td />
                    <td className="text-right font-semibold">R$ {formatCurrency(totalComissoes)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
