// ===================================================
//  RELATORIOS.JS
// ===================================================

const Relatorios = {
  render() {
    const main = document.getElementById('main-content');
    const produtos = DB.getProdutos();
    const movs = DB.getMovimentacoes();

    main.innerHTML = `
      <div class="relatorios-grid">

        <!-- Estoque Atual -->
        <div class="dash-section">
          <div class="section-header">
            <h2 class="section-title">📦 Estoque Atual</h2>
            <button class="btn btn-sm btn-ghost" onclick="Relatorios.exportCSV('estoque')">Exportar CSV</button>
          </div>
          <div class="rel-filters">
            <select id="rel-cat" class="select-input">
              <option value="">Todas as categorias</option>
              ${[...new Set(produtos.map(p => p.categoria))].map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <select id="rel-status" class="select-input">
              <option value="">Todos os status</option>
              <option value="ok">✅ Normal</option>
              <option value="baixo">⚠️ Estoque Baixo</option>
              <option value="sem-estoque">❌ Sem Estoque</option>
            </select>
          </div>
          <div class="table-container" style="max-height:380px">
            <table class="data-table">
              <thead>
                <tr><th>SKU</th><th>Material</th><th>Categoria</th><th>Qtd</th><th>Mín.</th><th>Local</th><th>Status</th></tr>
              </thead>
              <tbody id="rel-est-tbody">${this.buildEstoqueRows(produtos)}</tbody>
            </table>
          </div>
          <div class="rel-totals" id="rel-totals">${this.buildTotals(produtos)}</div>
        </div>

        <!-- Movimentações por período -->
        <div class="dash-section">
          <div class="section-header">
            <h2 class="section-title">🔄 Movimentações por Período</h2>
            <button class="btn btn-sm btn-ghost" onclick="Relatorios.exportCSV('movimentacoes')">Exportar CSV</button>
          </div>
          <div class="rel-filters">
            <div class="date-range">
              <input type="date" id="rel-data-ini" class="form-input" title="Data inicial">
              <span>até</span>
              <input type="date" id="rel-data-fim" class="form-input" title="Data final">
            </div>
            <select id="rel-mov-tipo" class="select-input">
              <option value="">Todos os tipos</option>
              <option value="entrada">▲ Entrada</option>
              <option value="saida">▼ Saída</option>
              <option value="ajuste">↕ Ajuste</option>
            </select>
          </div>
          <div class="table-container" style="max-height:340px">
            <table class="data-table">
              <thead>
                <tr><th>Data</th><th>Tipo</th><th>Material</th><th>Qtd</th><th>Motivo</th><th>Funcionário / Responsável</th></tr>
              </thead>
              <tbody id="rel-mov-tbody">${this.buildMovRows(movs)}</tbody>
            </table>
          </div>
        </div>

        <!-- Resumo Geral -->
        <div class="dash-section">
          <div class="section-header">
            <h2 class="section-title">📊 Resumo Geral</h2>
          </div>
          <div class="summary-cards" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            ${this.buildResumo(produtos, movs)}
          </div>
        </div>
      </div>
    `;

    // Filtros estoque
    ['rel-cat', 'rel-status'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.filterEstoque());
    });

    // Filtros movimentações
    ['rel-data-ini', 'rel-data-fim', 'rel-mov-tipo'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.filterMovs());
    });
  },

  buildEstoqueRows(prods) {
    if (prods.length === 0) return '<tr><td colspan="7" class="empty-cell">Nenhum material.</td></tr>';
    return prods.map(p => {
      const status = App.getStockStatus(p);
      return `
        <tr data-status="${status.key}" data-cat="${App.escapeHTML(p.categoria)}">
          <td><span class="sku-badge">${App.escapeHTML(p.sku||'—')}</span></td>
          <td>${App.escapeHTML(p.nome)}</td>
          <td>${App.escapeHTML(p.categoria)}</td>
          <td><strong>${App.formatNum(p.quantidade)} ${App.escapeHTML(p.unidade)}</strong></td>
          <td>${App.formatNum(p.qtdMinima)}</td>
          <td>${App.escapeHTML(p.localizacao || '—')}</td>
          <td><span class="status-badge status-${status.key}">${status.label}</span></td>
        </tr>`;
    }).join('');
  },

  buildTotals(prods) {
    const totalItens = prods.reduce((s,p) => s + Number(p.quantidade || 0), 0);
    return `
      <div class="totals-row">
        <span>Total de materiais: <strong>${prods.length}</strong></span>
        <span>Total de itens em estoque: <strong>${App.formatNum(totalItens)}</strong></span>
      </div>`;
  },

  buildMovRows(movs) {
    if (movs.length === 0) return '<tr><td colspan="6" class="empty-cell">Nenhuma movimentação.</td></tr>';
    const icon = { entrada:'▲', saida:'▼', ajuste:'↕' };
    return movs.map(m => {
      const prod = DB.getProduto(m.produtoId);
      return `
        <tr data-tipo="${m.tipo}" data-data="${m.data}">
          <td class="date-cell">${App.formatDate(m.data)}</td>
          <td><span class="mov-badge mov-${m.tipo}">${icon[m.tipo]||''} ${m.tipo}</span></td>
          <td>${prod ? App.escapeHTML(prod.nome) : '—'}</td>
          <td>${App.formatNum(m.quantidade)} ${prod ? App.escapeHTML(prod.unidade) : 'un'}</td>
          <td>${App.escapeHTML(m.motivo||'—')}</td>
          <td>${App.escapeHTML(m.funcionario || m.responsavel || '—')}</td>
        </tr>`;
    }).join('');
  },

  buildResumo(produtos, movs) {
    const totalProd = produtos.length;
    const baixo = produtos.filter(p => p.quantidade > 0 && p.quantidade <= p.qtdMinima).length;
    const sem = produtos.filter(p => p.quantidade === 0).length;
    const totalEntradas = movs.filter(m => m.tipo === 'entrada').reduce((s,m) => s + Number(m.quantidade), 0);
    const totalSaidas = movs.filter(m => m.tipo === 'saida').reduce((s,m) => s + Number(m.quantidade), 0);
    const pessoas = DB.getPessoas();

    const card = (icon, title, value, color) => `
      <div class="summary-card card-${color}">
        <div class="card-icon">${icon}</div>
        <div class="card-content">
          <div class="card-value">${value}</div>
          <div class="card-title">${title}</div>
        </div>
      </div>`;

    return card('📦', 'Total de Materiais', totalProd, 'indigo')
         + card('⚠️', 'Estoque Baixo', baixo, baixo > 0 ? 'amber' : 'green')
         + card('❌', 'Sem Estoque', sem, sem > 0 ? 'red' : 'green')
         + card('▲', 'Total Entradas', totalEntradas + ' itens', 'green')
         + card('▼', 'Total Saídas', totalSaidas + ' itens', 'blue')
         + card('👥', 'Equipe', pessoas.length, 'indigo');
  },

  filterEstoque() {
    const cat = document.getElementById('rel-cat').value;
    const status = document.getElementById('rel-status').value;
    const rows = document.querySelectorAll('#rel-est-tbody tr[data-cat]');
    rows.forEach(row => {
      const matchCat = !cat || row.dataset.cat === cat;
      const matchStatus = !status || row.dataset.status === status;
      row.style.display = (matchCat && matchStatus) ? '' : 'none';
    });
  },

  filterMovs() {
    const tipo = document.getElementById('rel-mov-tipo').value;
    const ini = document.getElementById('rel-data-ini').value;
    const fim = document.getElementById('rel-data-fim').value;
    const rows = document.querySelectorAll('#rel-mov-tbody tr[data-tipo]');
    rows.forEach(row => {
      const matchTipo = !tipo || row.dataset.tipo === tipo;
      const d = row.dataset.data ? row.dataset.data.slice(0, 10) : '';
      const matchIni = !ini || d >= ini;
      const matchFim = !fim || d <= fim;
      row.style.display = (matchTipo && matchIni && matchFim) ? '' : 'none';
    });
  },

  exportCSV(tipo) {
    let csv = '';
    if (tipo === 'estoque') {
      csv = 'SKU,Nome,Categoria,Quantidade,Unidade,Qt.Min,Localizacao,Status\n';
      const cat = document.getElementById('rel-cat')?.value || '';
      const statusFilter = document.getElementById('rel-status')?.value || '';
      DB.getProdutos().filter(p => {
        const status = App.getStockStatus(p).key;
        return (!cat || p.categoria === cat) && (!statusFilter || status === statusFilter);
      }).forEach(p => {
        const status = App.getStockStatus(p).label;
        csv += `${this.csvCell(p.sku||'')},${this.csvCell(p.nome)},${this.csvCell(p.categoria)},${p.quantidade},${this.csvCell(p.unidade)},${p.qtdMinima},${this.csvCell(p.localizacao||'')},${this.csvCell(status)}\n`;
      });
    } else {
      csv = 'Data,Tipo,Material,Quantidade,Unidade,Motivo,Funcionario/Responsavel\n';
      const tipoFilter = document.getElementById('rel-mov-tipo')?.value || '';
      const ini = document.getElementById('rel-data-ini')?.value || '';
      const fim = document.getElementById('rel-data-fim')?.value || '';
      DB.getMovimentacoes().filter(m => {
        const d = m.data ? m.data.slice(0, 10) : '';
        return (!tipoFilter || m.tipo === tipoFilter) && (!ini || d >= ini) && (!fim || d <= fim);
      }).forEach(m => {
        const prod = DB.getProduto(m.produtoId);
        csv += `${this.csvCell(App.formatDate(m.data))},${this.csvCell(m.tipo)},${this.csvCell(prod ? prod.nome : 'N/A')},${m.quantidade},${this.csvCell(prod ? prod.unidade : 'un')},${this.csvCell(m.motivo||'')},${this.csvCell(m.funcionario || m.responsavel || '')}\n`;
      });
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${tipo}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    App.showToast('CSV exportado com sucesso!');
  },

  csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }
};
