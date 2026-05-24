export function gerarTextofechamento(dados) {
  const { data_formatada, atendimentos, totais_por_forma, total_dia } = dados;

  let texto = '';

  // Cabeçalho
  texto += '═'.repeat(65) + '\n';
  texto += '                   FECHAMENTO DO DIA\n';
  texto += `                    ${data_formatada}\n`;
  texto += '═'.repeat(65) + '\n\n';

  // Atendimentos
  atendimentos.forEach(atd => {
    texto += `${String(atd.numero).padStart(2, '0')}\n`;
    texto += `Cliente: ${atd.cliente}\n`;

    atd.itens.forEach(item => {
      const profissionais = item.colaboradoras.length > 0 
        ? `${item.colaboradoras.join(', ')}`
        : '';
      
      texto += `  Serviço: ${item.descricao}${item.preco_cobrado ? ` (R$ ${formatarMoeda(item.preco_cobrado)})` : ''}\n`;
      
      if (profissionais) {
        texto += `  Profissional: ${profissionais}\n`;
      }
    });

    if (atd.itens.some(i => i.observacao)) {
      const obs = atd.itens
        .filter(i => i.observacao)
        .map(i => i.observacao)
        .join(', ');
      texto += `  Obs: ${obs}\n`;
    }

    texto += '\n';

    // Formas de pagamento
    if (atd.pagamentos.length > 1) {
      texto += `Formas de pagamento:\n`;
      atd.pagamentos.forEach(pag => {
        const forma = normalizarForma(pag.forma);
        texto += `  ${forma}: R$ ${formatarMoeda(pag.valor)}\n`;
      });
    } else if (atd.pagamentos.length === 1) {
      const forma = normalizarForma(atd.pagamentos[0].forma);
      texto += `Forma de pagamento: ${forma}\n`;
    }

    texto += `\nValor Total: R$ ${formatarMoeda(atd.valor_total)}\n`;
    texto += '\n';
  });

  // Resumo por forma
  texto += '─'.repeat(65) + '\n';
  texto += 'Resumo por forma de pagamento:\n';
  Object.entries(totais_por_forma).forEach(([forma, valor]) => {
    texto += `  ${forma}: R$ ${formatarMoeda(valor)}\n`;
  });

  texto += '─'.repeat(65) + '\n';
  texto += `TOTAL DO DIA: R$ ${formatarMoeda(total_dia)}\n`;
  texto += '═'.repeat(65) + '\n';

  return texto;
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizarForma(forma) {
  const mapa = {
    'dinheiro': 'Dinheiro',
    'credito': 'Crédito',
    'debito': 'Débito',
    'pix': 'Pix',
    'desconto_taxa': 'Desconto taxa',
  };
  return mapa[forma?.toLowerCase()] || forma;
}

export function baixarFechamento(dados) {
  const texto = gerarTextofechamento(dados);
  const [ano, mes, dia] = dados.data.split('-');
  const nomeArquivo = `Fechamento_${dia}_${mes}_${ano}.txt`;

  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
