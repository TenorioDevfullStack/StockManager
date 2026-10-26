// Regras de apresentação e consolidação. O banco calcula e persiste os custos.
const Inventario = {
  custo(value) {
    return value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
      ? null : Number(value);
  },
  dinheiro(value) {
    return this.custo(value) === null ? 'Não informado' : App.formatMoney(value);
  },
  dataLocal(value = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  },
  unidades(items, quantidade = p => p.quantidade, unidade = p => p.unidade) {
    const totals = new Map();
    items.forEach(item => {
      const unit = unidade(item) || 'não informada';
      totals.set(unit, (totals.get(unit) || 0) + Number(quantidade(item) || 0));
    });
    return [...totals].sort(([a], [b]) => a.localeCompare(b));
  },
  textoUnidades(items, quantidade, unidade) {
    return this.unidades(items, quantidade, unidade)
      .map(([unit, qty]) => `${App.formatNum(qty)} ${App.escapeHTML(unit)}`).join(' · ') || 'Sem saldo';
  },
  movimento(m) {
    const snapshot = m.produtoSnapshot || {};
    const p = DB.getProduto(m.produtoId);
    return { nome: snapshot.nome || p?.nome || 'Material removido',
      sku: snapshot.sku || p?.sku || '', unidade: snapshot.unidade || p?.unidade || '' };
  },
  consolidar(produtos, movimentos, inicio, fim) {
    const periodo = movimentos.filter(m => {
      const day = this.dataLocal(m.data);
      return day && (!inicio || day >= inicio) && (!fim || day <= fim);
    });
    const entradas = periodo.filter(m => m.tipo === 'entrada');
    const saidas = periodo.filter(m => m.tipo === 'saida');
    const soma = list => list.reduce((s, m) => s + (this.custo(m.custoTotal) ?? 0), 0);
    const pendentes = list => list.filter(m => this.custo(m.custoTotal) === null).length;
    const comSaldo = produtos.filter(p => Number(p.quantidade) > 0);
    const semCusto = comSaldo.filter(p => this.custo(p.custoMedio) === null);
    return { periodo, entradas, saidas, valorEntradas: soma(entradas), valorSaidas: soma(saidas),
      entradasSemCusto: pendentes(entradas), saidasSemCusto: pendentes(saidas),
      valorEstoque: comSaldo.reduce((s, p) => s + Number(p.quantidade) * (this.custo(p.custoMedio) ?? 0), 0),
      materiaisSemCusto: semCusto.length,
      reposicao: produtos.filter(p => Number(p.quantidade) <= Number(p.qtdMinima || 0)) };
  },
};
