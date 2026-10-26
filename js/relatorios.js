// Balanço gerencial: movimentações do período e posição atual do estoque.
const Relatorios = {
  inicio: null,
  fim: null,
  categoria: '',
  status: '',

  render() {
    const hoje = Inventario.dataLocal();
    if (this.inicio === null) this.inicio = `${hoje.slice(0, 7)}-01`;
    if (this.fim === null) this.fim = hoje;
    document.getElementById('main-content').innerHTML = `
      <div class="relatorios-grid">
        <section class="dash-section">
          <div class="section-header"><h2 class="section-title">Balanço de materiais</h2>
            <button class="btn btn-sm btn-ghost" id="rel-atualizar">Atualizar dados</button></div>
          <p class="report-note">Entradas e consumo no período selecionado. Datas no horário de São Paulo. Valores em reais.</p>
          <div class="rel-filters">
            <div class="form-group"><label for="rel-data-ini">De</label><input type="date" id="rel-data-ini" class="form-input" value="${this.inicio}"></div>
            <div class="form-group"><label for="rel-data-fim">Até</label><input type="date" id="rel-data-fim" class="form-input" value="${this.fim}"></div>
            <button class="btn btn-sm btn-ghost" id="rel-csv-mov">Exportar movimentações</button>
            <button class="btn btn-sm btn-primary" id="rel-imprimir">Imprimir / Salvar PDF</button>
          </div>
          <div id="rel-aviso" role="status" aria-live="polite"></div>
          <div class="summary-cards" id="rel-financeiro"></div>
          <div class="table-container"><table class="data-table">
            <thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Quantidade</th><th>Custo unitário</th><th>Custo total</th><th>Setor</th><th>Referência</th><th>Responsável</th></tr></thead>
            <tbody id="rel-mov-tbody"></tbody></table></div>
        </section>
        <section class="dash-section">
          <div class="section-header"><h2 class="section-title">Posição atual do estoque</h2>
            <button class="btn btn-sm btn-ghost" id="rel-csv-est">Exportar estoque</button></div>
          <p class="report-note">Saldo atual, independente do período acima. Custo médio ponderado móvel. Não representa um fechamento contábil.</p>
          <div class="rel-filters">
            <select id="rel-cat" class="select-input" aria-label="Categoria"><option value="">Todas as categorias</option>
              ${[...new Set(DB.getProdutos().map(p => p.categoria))].sort().map(c => `<option value="${App.escapeHTML(c)}" ${this.categoria === c ? 'selected' : ''}>${App.escapeHTML(c)}</option>`).join('')}
            </select>
            <select id="rel-status" class="select-input" aria-label="Situação do estoque"><option value="">Todos os status</option>
              <option value="ok" ${this.status === 'ok' ? 'selected' : ''}>Normal</option>
              <option value="baixo" ${this.status === 'baixo' ? 'selected' : ''}>Estoque baixo</option>
              <option value="sem-estoque" ${this.status === 'sem-estoque' ? 'selected' : ''}>Sem estoque</option></select>
          </div>
          <div class="table-container"><table class="data-table">
            <thead><tr><th>SKU</th><th>Material</th><th>Categoria</th><th>Saldo</th><th>Mínimo</th><th>Custo médio</th><th>Valor atual</th><th>Repor até o mínimo</th><th>Local</th></tr></thead>
            <tbody id="rel-est-tbody"></tbody></table></div>
          <div class="rel-totals" id="rel-totals"></div>
        </section>
      </div>`;
    for (const id of ['rel-data-ini', 'rel-data-fim', 'rel-cat', 'rel-status']) {
      document.getElementById(id).addEventListener('change', () => {
        this.inicio = document.getElementById('rel-data-ini').value;
        this.fim = document.getElementById('rel-data-fim').value;
        this.categoria = document.getElementById('rel-cat').value;
        this.status = document.getElementById('rel-status').value;
        this.atualizar();
      });
    }
    document.getElementById('rel-csv-mov').onclick = () => this.exportCSV('movimentacoes');
    document.getElementById('rel-csv-est').onclick = () => this.exportCSV('estoque');
    document.getElementById('rel-imprimir').onclick = () => this.imprimir();
    document.getElementById('rel-atualizar').onclick = async event => {
      event.currentTarget.disabled = true;
      try { await DB.refreshInventory(); this.render(); }
      finally { if (document.getElementById('rel-atualizar')) document.getElementById('rel-atualizar').disabled = false; }
    };
    this.atualizar();
  },
  periodoValido() { return !this.inicio || !this.fim || this.inicio <= this.fim; },
  estoqueFiltrado() {
    return DB.getProdutos().filter(p => (!this.categoria || p.categoria === this.categoria)
      && (!this.status || App.getStockStatus(p).key === this.status));
  },
  dados() { return Inventario.consolidar(DB.getProdutos(), DB.getMovimentacoes(), this.inicio, this.fim); },
  atualizar() {
    const valido = this.periodoValido();
    const r = this.dados();
    const avisos = [];
    if (!DB.inventoryLoaded) avisos.push('Dados sem atualização confirmada. Atualize antes de emitir ou exportar o balanço.');
    if (!valido) avisos.push('A data inicial deve ser anterior ou igual à data final.');
    if (r.entradasSemCusto || r.saidasSemCusto || r.materiaisSemCusto) avisos.push(
      `Valores parciais: ${r.entradasSemCusto} entrada(s), ${r.saidasSemCusto} retirada(s) e ${r.materiaisSemCusto} material(is) com saldo sem custo informado. Valores desconhecidos não são zero.`);
    document.getElementById('rel-aviso').textContent = avisos.join(' ');
    document.getElementById('rel-aviso').className = avisos.length ? 'report-warning' : 'report-note';
    for (const id of ['rel-csv-mov', 'rel-csv-est', 'rel-imprimir']) document.getElementById(id).disabled = !valido || !DB.inventoryLoaded;
    document.getElementById('rel-financeiro').innerHTML = valido ? [
      this.card('Entradas no período', App.formatMoney(r.valorEntradas), r.entradasSemCusto ? 'Parcial: há entradas sem custo' : `${r.entradas.length} entrada(s)`),
      this.card('Consumo no período', App.formatMoney(r.valorSaidas), r.saidasSemCusto ? 'Parcial: há retiradas sem custo' : `${r.saidas.length} retirada(s)`),
      this.card('Valor do estoque atual', App.formatMoney(r.valorEstoque), r.materiaisSemCusto ? 'Parcial: há materiais sem custo' : 'Posição atual, fora do filtro de datas'),
      this.card('Materiais para reposição', r.reposicao.length, 'Saldo menor ou igual ao mínimo'),
    ].join('') : '';
    document.getElementById('rel-mov-tbody').innerHTML = valido ? this.buildMovRows(r.periodo) : '';
    const produtos = this.estoqueFiltrado();
    document.getElementById('rel-est-tbody').innerHTML = this.buildEstoqueRows(produtos);
    document.getElementById('rel-totals').innerHTML = `<div class="totals-row"><span>Materiais: <strong>${produtos.length}</strong></span><span>Saldo por unidade: <strong>${Inventario.textoUnidades(produtos)}</strong></span></div>`;
  },
  card(label, value, note) {
    return `<div class="summary-card"><div class="card-content"><div class="card-value">${value}</div><div class="card-title">${label}</div><small>${note}</small></div></div>`;
  },
  buildEstoqueRows(produtos) {
    return produtos.map(p => `<tr><td>${App.escapeHTML(p.sku || '—')}</td><td>${App.escapeHTML(p.nome)}</td><td>${App.escapeHTML(p.categoria)}</td>
      <td>${App.formatNum(p.quantidade)} ${App.escapeHTML(p.unidade)}</td><td>${App.formatNum(p.qtdMinima)} ${App.escapeHTML(p.unidade)}</td>
      <td>${Inventario.dinheiro(p.custoMedio)}</td><td>${Number(p.quantidade) === 0 ? App.formatMoney(0) : Inventario.dinheiro(Inventario.custo(p.custoMedio) === null ? null : p.quantidade * p.custoMedio)}</td>
      <td>${App.formatNum(Math.max(0, p.qtdMinima - p.quantidade))} ${App.escapeHTML(p.unidade)}</td><td>${App.escapeHTML(p.localizacao || '—')}</td></tr>`).join('')
      || '<tr><td colspan="9" class="empty-cell">Nenhum material.</td></tr>';
  },
  buildMovRows(movs) {
    return movs.map(m => {
      const p = Inventario.movimento(m);
      return `<tr><td>${App.escapeHTML(App.formatDate(m.data))}</td><td>${App.escapeHTML(m.tipo)}</td><td>${App.escapeHTML(p.nome)}</td>
        <td>${App.formatNum(m.quantidade)} ${App.escapeHTML(p.unidade)}</td><td>${m.tipo === 'ajuste' ? '—' : Inventario.dinheiro(m.custoUnitario)}</td>
        <td>${m.tipo === 'ajuste' ? '—' : Inventario.dinheiro(m.custoTotal)}</td><td>${App.escapeHTML(m.setor || '—')}</td>
        <td>${App.escapeHTML(m.documentoReferencia || '—')}</td><td>${App.escapeHTML(m.funcionario || m.responsavel || '—')}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty-cell">Nenhuma movimentação no período.</td></tr>';
  },
  csvCell(value) {
    let text = typeof value === 'number' && Number.isFinite(value)
      ? value.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 6 }) : String(value ?? '');
    // Impede fórmulas ao abrir textos cadastrados em Excel/LibreOffice.
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  },
  csv(tipo) {
    let rows;
    if (tipo === 'estoque') {
      rows = [['SKU','Material','Categoria','Saldo','Unidade','Mínimo','Custo médio BRL','Valor atual BRL','Repor até o mínimo','Local']];
      this.estoqueFiltrado().forEach(p => rows.push([p.sku,p.nome,p.categoria,p.quantidade,p.unidade,p.qtdMinima,
        p.custoMedio ?? 'Não informado', Number(p.quantidade) === 0 ? 0 : p.custoMedio == null ? 'Não informado' : Number((p.quantidade*p.custoMedio).toFixed(2)),
        Math.max(0,p.qtdMinima-p.quantidade),p.localizacao]));
    } else {
      rows = [['Data','Tipo','Material','Quantidade','Unidade','Custo unitário BRL','Custo total BRL','Setor','Referência','Responsável','Motivo']];
      this.dados().periodo.forEach(m => {
        const p = Inventario.movimento(m);
        rows.push([App.formatDate(m.data),m.tipo,p.nome,m.quantidade,p.unidade,
          m.tipo === 'ajuste' ? '' : m.custoUnitario ?? 'Não informado',m.tipo === 'ajuste' ? '' : m.custoTotal ?? 'Não informado',
          m.setor,m.documentoReferencia,m.funcionario || m.responsavel,m.motivo]);
      });
    }
    return '\uFEFF' + rows.map(row => row.map(value => this.csvCell(value)).join(';')).join('\r\n');
  },
  podeEmitir() {
    if (DB.inventoryLoaded && this.periodoValido()) return true;
    App.showToast('Atualize os dados e confira as datas antes de emitir o relatório.', 'error');
    return false;
  },
  exportCSV(tipo) {
    if (!this.podeEmitir()) return;
    const url = URL.createObjectURL(new Blob([this.csv(tipo)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_${tipo}_${Inventario.dataLocal()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  htmlImpressao() {
    const r = this.dados();
    const esc = value => App.escapeHTML(value);
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Balanço de materiais</title>
      <style>body{font:12px Arial,sans-serif;color:#111;margin:24px}h1{font-size:22px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{padding:6px;border:1px solid #ccc;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{line-height:1.5}@page{size:A4 landscape;margin:12mm}</style></head><body>
      <h1>Balanço de materiais — StockManager</h1><p>${esc(DB.orgNome)}<br>Emitido em ${esc(App.formatDate(new Date().toISOString()))}. Período: ${esc(this.inicio || 'início do histórico')} a ${esc(this.fim || 'hoje')} (São Paulo).</p>
      <p>Entradas no período: <strong>${App.formatMoney(r.valorEntradas)}</strong> · Consumo no período: <strong>${App.formatMoney(r.valorSaidas)}</strong><br>
      Pendências de custo no período: ${r.entradasSemCusto} entrada(s), ${r.saidasSemCusto} retirada(s). Valores parciais quando houver pendências. Ajustes não são compras nem consumo.</p>
      <h2>Movimentações no período</h2><table><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Quantidade</th><th>Custo unitário</th><th>Custo total</th><th>Setor</th><th>Referência</th><th>Responsável</th></tr></thead><tbody>${this.buildMovRows(r.periodo)}</tbody></table>
      <h2>Posição atual do estoque — independente do período</h2><p>Valor conhecido: ${App.formatMoney(r.valorEstoque)}. ${r.materiaisSemCusto} material(is) com saldo sem custo. Custo médio ponderado móvel; relatório gerencial.<br>Filtros da tabela: categoria ${esc(this.categoria || 'todas')}, situação ${esc(this.status || 'todas')}. O valor conhecido considera todo o estoque ativo.</p>
      <table><thead><tr><th>SKU</th><th>Material</th><th>Categoria</th><th>Saldo</th><th>Mínimo</th><th>Custo médio</th><th>Valor atual</th><th>Repor até o mínimo</th><th>Local</th></tr></thead><tbody>${this.buildEstoqueRows(this.estoqueFiltrado())}</tbody></table>
      <p>Saldo por unidade na tabela: ${Inventario.textoUnidades(this.estoqueFiltrado())}. Valores não informados permanecem desconhecidos.</p></body></html>`;
  },
  imprimir() {
    if (!this.podeEmitir()) return;
    const popup = window.open('', '_blank');
    if (!popup) { App.showToast('Permita a abertura do relatório neste navegador.', 'error'); return; }
    popup.opener = null;
    popup.document.write(this.htmlImpressao());
    popup.document.close();
    popup.focus();
    popup.print();
  },
};
