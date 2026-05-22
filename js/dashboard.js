// ===================================================
//  DASHBOARD.JS
// ===================================================

const Dashboard = {
  render() {
    const main = document.getElementById('main-content');
    const produtos = DB.getProdutos();
    const pessoas = DB.getPessoas();
    const movs = DB.getMovimentacoes();

    const totalMateriais = produtos.length;
    const totalPessoas = pessoas.length;
    const estoqueBaixo = produtos.filter(p => p.quantidade <= p.qtdMinima).length;
    const semEstoque = produtos.filter(p => p.quantidade === 0).length;
    const totalItens = produtos.reduce((sum, p) => sum + Number(p.quantidade || 0), 0);

    // Categorias
    const catMap = {};
    produtos.forEach(p => {
      catMap[p.categoria] = (catMap[p.categoria] || 0) + p.quantidade;
    });

    main.innerHTML = `
      <div class="dashboard-grid">
        <!-- Cards de resumo -->
        <div class="summary-cards">
          ${this.card('📦', 'Materiais', totalMateriais + ' cadastrados', 'indigo')}
          ${this.card('⊞', 'Itens em Estoque', App.formatNum(totalItens), 'green')}
          ${this.card('👥', 'Equipe', totalPessoas + ' cadastrados', 'blue')}
          ${this.card('⚠️', 'Alertas', estoqueBaixo + ' material(is)', estoqueBaixo > 0 ? 'amber' : 'green')}
        </div>

        <!-- Alertas de estoque crítico -->
        ${semEstoque > 0 || estoqueBaixo > 0 ? `
        <div class="dash-section">
          <div class="section-header">
            <h2 class="section-title">🚨 Alertas de Estoque</h2>
          </div>
          <div class="alert-list">
            ${produtos.filter(p => p.quantidade === 0).map(p => `
              <div class="alert-item alert-danger">
                <div class="alert-icon">❌</div>
                <div class="alert-info">
                  <strong>${App.escapeHTML(p.nome)}</strong>
                  <span>Sem estoque (mínimo: ${App.formatNum(p.qtdMinima)} ${App.escapeHTML(p.unidade)})</span>
                </div>
                <button class="btn btn-sm btn-ghost" onclick="Movimentacoes.openForm('entrada', '${p.id}')">Registrar entrada</button>
              </div>
            `).join('')}
            ${produtos.filter(p => p.quantidade > 0 && p.quantidade <= p.qtdMinima).map(p => `
              <div class="alert-item alert-warning">
                <div class="alert-icon">⚠️</div>
                <div class="alert-info">
                  <strong>${App.escapeHTML(p.nome)}</strong>
                  <span>Estoque baixo: ${App.formatNum(p.quantidade)} ${App.escapeHTML(p.unidade)} (mínimo: ${App.formatNum(p.qtdMinima)})</span>
                </div>
                <button class="btn btn-sm btn-ghost" onclick="Movimentacoes.openForm('entrada', '${p.id}')">Registrar entrada</button>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <div class="dash-two-col">
          <!-- Gráfico de categorias -->
          <div class="dash-section">
            <div class="section-header">
              <h2 class="section-title">📊 Estoque por Categoria</h2>
            </div>
            <div class="bar-chart">
              ${this.buildBarChart(catMap)}
            </div>
          </div>

          <!-- Últimas movimentações -->
          <div class="dash-section">
            <div class="section-header">
              <h2 class="section-title">🔄 Últimas Movimentações</h2>
              <button class="btn btn-sm btn-ghost" onclick="App.navigate('movimentacoes')">Ver todas</button>
            </div>
            <div class="mov-list">
              ${movs.length === 0 ? '<p class="empty-state-sm">Nenhuma movimentação registrada.</p>' :
                movs.slice(0, 6).map(m => {
                  const prod = DB.getProduto(m.produtoId);
                  return `
                  <div class="mov-item">
                    <span class="mov-badge mov-${m.tipo}">${m.tipo === 'entrada' ? '▲' : m.tipo === 'saida' ? '▼' : '↕'} ${m.tipo}</span>
                    <div class="mov-info">
                      <strong>${prod ? App.escapeHTML(prod.nome) : 'Material removido'}</strong>
                      <span>${App.formatNum(m.quantidade)} ${prod ? App.escapeHTML(prod.unidade) : 'un'} · ${App.formatDate(m.data)}</span>
                    </div>
                  </div>`;
                }).join('')}
            </div>
          </div>
        </div>

        <!-- Atalhos rápidos -->
        <div class="dash-section">
          <div class="section-header">
            <h2 class="section-title">⚡ Ações Rápidas</h2>
          </div>
          <div class="quick-actions">
            <button class="quick-btn" onclick="Produtos.openForm()">
              <span class="quick-icon">📦</span>
              <span>Novo Material</span>
            </button>
            <button class="quick-btn" onclick="Movimentacoes.openForm('entrada')">
              <span class="quick-icon">⬆️</span>
              <span>Entrada de Estoque</span>
            </button>
            <button class="quick-btn" onclick="Movimentacoes.openForm('saida')">
              <span class="quick-icon">⬇️</span>
              <span>Retirada de Material</span>
            </button>
            <button class="quick-btn" onclick="Pessoas.openForm()">
              <span class="quick-icon">👥</span>
              <span>Novo Funcionário</span>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  card(icon, title, value, color) {
    return `
      <div class="summary-card card-${color}">
        <div class="card-icon">${icon}</div>
        <div class="card-content">
          <div class="card-value">${value}</div>
          <div class="card-title">${title}</div>
        </div>
        <div class="card-glow"></div>
      </div>`;
  },

  buildBarChart(catMap) {
    const entries = Object.entries(catMap);
    if (entries.length === 0) return '<p class="empty-state-sm">Sem dados.</p>';
    const max = Math.max(...entries.map(([, v]) => v), 1);
    const colors = [
      'var(--primary)',
      'var(--green)',
      'var(--amber)',
      'var(--red)',
      'var(--blue)',
      'var(--primary-soft)',
    ];
    return entries.map(([cat, qty], i) => `
      <div class="bar-row">
        <div class="bar-label">${App.escapeHTML(cat)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(qty/max*100).toFixed(1)}%;background:${colors[i % colors.length]}"></div>
        </div>
        <div class="bar-value">${qty}</div>
      </div>
    `).join('');
  }
};
