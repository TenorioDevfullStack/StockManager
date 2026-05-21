// ===================================================
//  PRODUTOS.JS
// ===================================================

const Produtos = {
  filter: { search: '', categoria: '', status: '', sort: 'nome' },
  categorias: ['Elétrica', 'Hidráulica', 'Ferramentas', 'EPI', 'Limpeza', 'Peças', 'Outros'],

  render() {
    const main = document.getElementById('main-content');
    const produtos = DB.getProdutos();
    main.innerHTML = `
      <div class="insight-strip">
        ${this.metric('Materiais cadastrados', produtos.length)}
        ${this.metric('Itens em estoque', App.formatNum(produtos.reduce((s, p) => s + Number(p.quantidade || 0), 0)))}
        ${this.metric('Alertas de estoque', produtos.filter(p => App.getStockStatus(p).key !== 'ok').length)}
      </div>
      <div class="page-actions">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input type="text" id="prod-search" placeholder="Buscar material, SKU..." class="search-input" value="${this.filter.search}">
        </div>
        <select id="prod-cat-filter" class="select-input">
          <option value="">Todas as categorias</option>
          ${this.categorias.map(c => `<option value="${c}" ${this.filter.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <select id="prod-status-filter" class="select-input">
          <option value="">Todos os status</option>
          <option value="ok" ${this.filter.status === 'ok' ? 'selected' : ''}>Normal</option>
          <option value="baixo" ${this.filter.status === 'baixo' ? 'selected' : ''}>Baixo</option>
          <option value="sem-estoque" ${this.filter.status === 'sem-estoque' ? 'selected' : ''}>Sem estoque</option>
        </select>
        <select id="prod-sort" class="select-input">
          <option value="nome" ${this.filter.sort === 'nome' ? 'selected' : ''}>Nome</option>
          <option value="quantidade-asc" ${this.filter.sort === 'quantidade-asc' ? 'selected' : ''}>Menor estoque</option>
          <option value="quantidade-desc" ${this.filter.sort === 'quantidade-desc' ? 'selected' : ''}>Maior estoque</option>
        </select>
        <button class="btn btn-primary" onclick="Produtos.openForm()">+ Novo Material</button>
      </div>
      <div class="table-container">
        <table class="data-table" id="prod-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Qtd</th>
              <th>Mín.</th>
              <th>Local</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="prod-tbody"></tbody>
        </table>
      </div>
      <div id="prod-empty" class="empty-state hidden">
        <div class="empty-icon">📦</div>
        <p>Nenhum material encontrado.</p>
        <button class="btn btn-primary" onclick="Produtos.openForm()">Cadastrar primeiro material</button>
      </div>
    `;

    document.getElementById('prod-search').addEventListener('input', (e) => {
      this.filter.search = e.target.value;
      this.renderTable();
    });
    document.getElementById('prod-cat-filter').addEventListener('change', (e) => {
      this.filter.categoria = e.target.value;
      this.renderTable();
    });
    document.getElementById('prod-status-filter').addEventListener('change', (e) => {
      this.filter.status = e.target.value;
      this.renderTable();
    });
    document.getElementById('prod-sort').addEventListener('change', (e) => {
      this.filter.sort = e.target.value;
      this.renderTable();
    });

    this.renderTable();
  },

  renderTable() {
    const search = this.filter.search.toLowerCase();
    const cat = this.filter.categoria;
    let prods = DB.getProdutos();

    if (search) prods = prods.filter(p => p.nome.toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search));
    if (cat) prods = prods.filter(p => p.categoria === cat);
    if (this.filter.status) prods = prods.filter(p => App.getStockStatus(p).key === this.filter.status);
    prods.sort((a, b) => {
      if (this.filter.sort === 'quantidade-asc') return a.quantidade - b.quantidade;
      if (this.filter.sort === 'quantidade-desc') return b.quantidade - a.quantidade;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    const tbody = document.getElementById('prod-tbody');
    const empty = document.getElementById('prod-empty');

    if (!tbody) return;

    if (prods.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      document.querySelector('.table-container').style.display = 'none';
      return;
    }

    empty.classList.add('hidden');
    document.querySelector('.table-container').style.display = '';

    tbody.innerHTML = prods.map(p => {
      const status = App.getStockStatus(p);
      return `
        <tr class="prod-row ${status.key === 'sem-estoque' ? 'row-danger' : status.key === 'baixo' ? 'row-warning' : ''}">
          <td><span class="sku-badge">${App.escapeHTML(p.sku || '—')}</span></td>
          <td>
            <button class="link-button prod-name" onclick="Produtos.openDetails('${p.id}')">${App.escapeHTML(p.nome)}</button>
            ${p.descricao ? `<div class="prod-desc">${App.escapeHTML(p.descricao)}</div>` : ''}
          </td>
          <td><span class="cat-badge">${App.escapeHTML(p.categoria)}</span></td>
          <td><strong>${App.formatNum(p.quantidade)} ${App.escapeHTML(p.unidade)}</strong></td>
          <td>${App.formatNum(p.qtdMinima)} ${App.escapeHTML(p.unidade)}</td>
          <td>${p.localizacao ? `<span class="sku-badge">${App.escapeHTML(p.localizacao)}</span>` : '—'}</td>
          <td><span class="status-badge status-${status.key}">${status.label}</span></td>
          <td>
            <div class="action-btns">
              <button class="btn btn-sm btn-icon" title="Entrada" onclick="Movimentacoes.openForm('entrada', '${p.id}')">▲</button>
              <button class="btn btn-sm btn-icon" title="Retirada" onclick="Movimentacoes.openForm('saida', '${p.id}')">▼</button>
              <button class="btn btn-sm btn-icon" title="Editar" onclick="Produtos.openForm('${p.id}')">✏️</button>
              <button class="btn btn-sm btn-icon" title="Excluir" onclick="Produtos.delete('${p.id}')">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  },

  metric(label, value) {
    return `<div class="insight-card"><span>${label}</span><strong>${value}</strong></div>`;
  },

  openForm(id = null) {
    const prod = id ? DB.getProduto(id) : null;
    const title = prod ? 'Editar Material' : 'Novo Material';

    const formHTML = `
      <form id="prod-form" class="modal-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label>Nome do Material *</label>
            <input type="text" id="pf-nome" class="form-input" value="${App.escapeHTML(prod?.nome || '')}" required placeholder="Nome do material">
          </div>
          <div class="form-group form-group-sm">
            <label>SKU / Código</label>
            <input type="text" id="pf-sku" class="form-input" value="${App.escapeHTML(prod?.sku || '')}" placeholder="Código interno">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Categoria *</label>
            <select id="pf-categoria" class="form-input" required>
              ${this.categorias.map(c => `<option value="${c}" ${prod?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group form-group-sm">
            <label>Unidade</label>
            <select id="pf-unidade" class="form-input">
              ${['un','cx','kg','lt','mt','pc','pr'].map(u => `<option value="${u}" ${prod?.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Quantidade Atual *</label>
            <input type="number" id="pf-quantidade" class="form-input" value="${prod?.quantidade ?? 0}" min="0" required>
          </div>
          <div class="form-group">
            <label>Quantidade Mínima</label>
            <input type="number" id="pf-qtdMinima" class="form-input" value="${prod?.qtdMinima ?? 5}" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Localização no Estoque</label>
            <input type="text" id="pf-localizacao" class="form-input" value="${App.escapeHTML(prod?.localizacao || '')}" placeholder="Corredor, prateleira ou posição">
          </div>
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="pf-descricao" class="form-input" rows="2" placeholder="Descrição do material">${App.escapeHTML(prod?.descricao || '')}</textarea>
        </div>
      </form>`;

    App.openModal(title, formHTML, () => {
      const nome = document.getElementById('pf-nome').value.trim();
      if (!nome) { App.showToast('Nome é obrigatório', 'error'); return false; }
      const sku = document.getElementById('pf-sku').value.trim();
      const skuDuplicado = sku && DB.getProdutos().some(item => item.id !== prod?.id && (item.sku || '').toLowerCase() === sku.toLowerCase());
      if (skuDuplicado) { App.showToast('Já existe um material com este SKU.', 'error'); return false; }

      const data = {
        id: prod?.id || null,
        nome,
        sku,
        categoria: document.getElementById('pf-categoria').value,
        unidade: document.getElementById('pf-unidade').value,
        quantidade: Number(document.getElementById('pf-quantidade').value) || 0,
        qtdMinima: Number(document.getElementById('pf-qtdMinima').value) || 0,
        localizacao: document.getElementById('pf-localizacao').value.trim(),
        descricao: document.getElementById('pf-descricao').value.trim(),
      };

      DB.saveProduto(data);
      App.showToast(prod ? 'Material atualizado!' : 'Material cadastrado!');
      this.render();
      return true;
    });
  },

  openDetails(id) {
    const p = DB.getProduto(id);
    if (!p) return;
    const status = App.getStockStatus(p);
    const movs = DB.getMovimentacoes().filter(m => m.produtoId === id).slice(0, 6);
    App.openModal('Detalhes do Material', `
      <div class="detail-grid">
        <div><span>Material</span><strong>${App.escapeHTML(p.nome)}</strong></div>
        <div><span>SKU</span><strong>${App.escapeHTML(p.sku || '—')}</strong></div>
        <div><span>Status</span><strong>${status.label}</strong></div>
        <div><span>Estoque</span><strong>${App.formatNum(p.quantidade)} ${App.escapeHTML(p.unidade)}</strong></div>
        <div><span>Estoque mínimo</span><strong>${App.formatNum(p.qtdMinima)} ${App.escapeHTML(p.unidade)}</strong></div>
        <div><span>Localização</span><strong>${App.escapeHTML(p.localizacao || '—')}</strong></div>
      </div>
      <div class="modal-subtitle">Últimas movimentações</div>
      <div class="mov-list">
        ${movs.length ? movs.map(m => `<div class="mov-item"><span class="mov-badge mov-${m.tipo}">${m.tipo}</span><div class="mov-info"><strong>${App.formatNum(m.quantidade)} ${App.escapeHTML(p.unidade)}</strong><span>${App.formatDate(m.data)} · ${App.escapeHTML(m.motivo || 'Sem motivo')}</span></div></div>`).join('') : '<p class="empty-state-sm">Sem movimentações para este material.</p>'}
      </div>
    `, () => true, 'Fechar');
    document.getElementById('modal-cancel').style.display = 'none';
    document.getElementById('modal-confirm').onclick = () => {
      document.getElementById('modal-cancel').style.display = '';
      App.closeModal();
      return true;
    };
  },

  delete(id) {
    const prod = DB.getProduto(id);
    App.confirmDelete(`Deseja excluir o material <strong>"${App.escapeHTML(prod?.nome)}"</strong>?`, () => {
      DB.deleteProduto(id);
      App.showToast('Material excluído.', 'info');
      this.render();
    });
  }
};
