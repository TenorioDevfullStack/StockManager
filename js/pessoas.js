// ===================================================
//  PESSOAS.JS
// ===================================================

const Pessoas = {
  filter: { search: '', tipo: '' },

  render() {
    const main = document.getElementById('main-content');
    const pessoas = DB.getPessoas();
    main.innerHTML = `
      <div class="insight-strip">
        ${this.metric('Total', pessoas.length)}
        ${this.metric('Funcionários', pessoas.filter(p => p.tipo === 'funcionario' || p.tipo === 'cliente' || p.tipo === 'ambos').length)}
        ${this.metric('Fornecedores', pessoas.filter(p => p.tipo === 'fornecedor' || p.tipo === 'ambos').length)}
        ${this.metric('Com e-mail', pessoas.filter(p => p.email).length)}
      </div>
      <div class="page-actions">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input type="text" id="pes-search" placeholder="Buscar nome, matrícula ou empresa..." class="search-input" value="${App.escapeHTML(this.filter.search)}">
        </div>
        <select id="pes-tipo-filter" class="select-input">
          <option value="">Todos os tipos</option>
          <option value="funcionario" ${this.filter.tipo === 'funcionario' ? 'selected' : ''}>👤 Funcionários</option>
          <option value="fornecedor" ${this.filter.tipo === 'fornecedor' ? 'selected' : ''}>🏭 Fornecedores</option>
          <option value="ambos" ${this.filter.tipo === 'ambos' ? 'selected' : ''}>🔗 Ambos</option>
        </select>
        <button class="btn btn-primary" onclick="Pessoas.openForm()">+ Novo Cadastro</button>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Matrícula / ID</th>
              <th>Tipo</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Cadastrado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="pes-tbody"></tbody>
        </table>
      </div>
      <div id="pes-empty" class="empty-state hidden">
        <div class="empty-icon">👥</div>
        <p>Nenhum cadastro encontrado.</p>
        <button class="btn btn-primary" onclick="Pessoas.openForm()">Cadastrar primeiro funcionário</button>
      </div>
    `;

    document.getElementById('pes-search').addEventListener('input', (e) => {
      this.filter.search = e.target.value.toLowerCase();
      this.renderTable();
    });
    document.getElementById('pes-tipo-filter').addEventListener('change', (e) => {
      this.filter.tipo = e.target.value;
      this.renderTable();
    });

    this.renderTable();
  },

  renderTable() {
    let pessoas = DB.getPessoas();
    if (this.filter.tipo) {
      pessoas = pessoas.filter(p => {
        if (this.filter.tipo === 'funcionario') return p.tipo === 'funcionario' || p.tipo === 'cliente' || p.tipo === 'ambos';
        return p.tipo === this.filter.tipo;
      });
    }
    if (this.filter.search) {
      pessoas = pessoas.filter(p =>
        p.nome.toLowerCase().includes(this.filter.search) ||
        (p.documento || '').toLowerCase().includes(this.filter.search)
      );
    }

    const tbody = document.getElementById('pes-tbody');
    const empty = document.getElementById('pes-empty');
    if (!tbody) return;

    if (pessoas.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      document.querySelector('.table-container').style.display = 'none';
      return;
    }

    empty.classList.add('hidden');
    document.querySelector('.table-container').style.display = '';

    const tipoLabel = { funcionario: '👤 Funcionário', cliente: '👤 Funcionário', fornecedor: '🏭 Fornecedor', ambos: '🔗 Funcionário/Fornecedor' };
    const tipoClass = { funcionario: 'tipo-cliente', cliente: 'tipo-cliente', fornecedor: 'tipo-fornecedor', ambos: 'tipo-ambos' };

    tbody.innerHTML = pessoas.map(p => `
      <tr>
        <td>
          <button class="link-button prod-name" onclick="Pessoas.openDetails('${p.id}')">${App.escapeHTML(p.nome)}</button>
          ${p.endereco ? `<div class="prod-desc">${App.escapeHTML(p.endereco)}</div>` : ''}
        </td>
        <td><span class="sku-badge">${App.escapeHTML(p.documento || '—')}</span></td>
        <td><span class="tipo-badge ${tipoClass[p.tipo] || ''}">${tipoLabel[p.tipo] || p.tipo}</span></td>
        <td>${App.escapeHTML(p.telefone || '—')}</td>
        <td>${p.email ? `<a href="mailto:${App.escapeHTML(p.email)}" class="link">${App.escapeHTML(p.email)}</a>` : '—'}</td>
        <td class="date-cell">${App.formatDate(p.criadoEm)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-icon" title="Editar" onclick="Pessoas.openForm('${p.id}')">✏️</button>
            <button class="btn btn-sm btn-icon" title="Excluir" onclick="Pessoas.delete('${p.id}')">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  },

  metric(label, value) {
    return `<div class="insight-card"><span>${label}</span><strong>${value}</strong></div>`;
  },

  openForm(id = null) {
    const pessoa = id ? DB.getPessoa(id) : null;
    const title = pessoa ? 'Editar Cadastro' : 'Novo Cadastro';

    const formHTML = `
      <form id="pes-form" class="modal-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label>Nome *</label>
            <input type="text" id="pef-nome" class="form-input" value="${App.escapeHTML(pessoa?.nome || '')}" required placeholder="Nome do funcionário ou fornecedor">
          </div>
          <div class="form-group form-group-sm">
            <label>Tipo *</label>
            <select id="pef-tipo" class="form-input" required>
              <option value="funcionario" ${pessoa?.tipo === 'funcionario' || pessoa?.tipo === 'cliente' || !pessoa?.tipo ? 'selected' : ''}>👤 Funcionário</option>
              <option value="fornecedor" ${pessoa?.tipo === 'fornecedor' ? 'selected' : ''}>🏭 Fornecedor</option>
              <option value="ambos" ${pessoa?.tipo === 'ambos' ? 'selected' : ''}>🔗 Funcionário/Fornecedor</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Matrícula / ID interno</label>
            <input type="text" id="pef-documento" class="form-input" value="${App.escapeHTML(pessoa?.documento || '')}" placeholder="Matrícula, crachá ou código interno">
          </div>
          <div class="form-group">
            <label>Telefone</label>
            <input type="tel" id="pef-telefone" class="form-input" value="${App.escapeHTML(pessoa?.telefone || '')}" placeholder="(00) 00000-0000">
          </div>
        </div>
        <div class="form-group">
          <label>E-mail</label>
          <input type="email" id="pef-email" class="form-input" value="${App.escapeHTML(pessoa?.email || '')}" placeholder="E-mail">
        </div>
        <div class="form-group">
          <label>Setor / Empresa</label>
          <input type="text" id="pef-endereco" class="form-input" value="${App.escapeHTML(pessoa?.endereco || '')}" placeholder="Setor interno ou empresa fornecedora">
        </div>
        <div class="form-group">
          <label>Observações</label>
          <textarea id="pef-obs" class="form-input" rows="2" placeholder="Informações adicionais">${App.escapeHTML(pessoa?.obs || '')}</textarea>
        </div>
      </form>`;

    App.openModal(title, formHTML, () => {
      const nome = document.getElementById('pef-nome').value.trim();
      if (!nome) { App.showToast('Nome é obrigatório.', 'error'); return false; }
      const email = document.getElementById('pef-email').value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        App.showToast('Informe um e-mail válido.', 'error');
        return false;
      }

      const data = {
        id: pessoa?.id || null,
        nome,
        tipo: document.getElementById('pef-tipo').value,
        documento: document.getElementById('pef-documento').value.trim(),
        telefone: document.getElementById('pef-telefone').value.trim(),
        email,
        endereco: document.getElementById('pef-endereco').value.trim(),
        obs: document.getElementById('pef-obs').value.trim(),
      };

      DB.savePessoa(data);
      App.showToast(pessoa ? 'Cadastro atualizado!' : 'Cadastro criado!');
      this.render();
      return true;
    });
  },

  openDetails(id) {
    const p = DB.getPessoa(id);
    if (!p) return;
    const tipoLabel = { funcionario: 'Funcionário', cliente: 'Funcionário', fornecedor: 'Fornecedor', ambos: 'Funcionário e fornecedor' };
    App.openModal('Detalhes do Cadastro', `
      <div class="detail-grid">
        <div><span>Nome</span><strong>${App.escapeHTML(p.nome)}</strong></div>
        <div><span>Tipo</span><strong>${tipoLabel[p.tipo] || App.escapeHTML(p.tipo)}</strong></div>
        <div><span>Matrícula / ID</span><strong>${App.escapeHTML(p.documento || '—')}</strong></div>
        <div><span>Telefone</span><strong>${App.escapeHTML(p.telefone || '—')}</strong></div>
        <div><span>E-mail</span><strong>${App.escapeHTML(p.email || '—')}</strong></div>
        <div><span>Cadastro</span><strong>${App.formatDate(p.criadoEm)}</strong></div>
      </div>
      ${p.endereco ? `<div class="modal-subtitle">Setor / Empresa</div><p class="detail-text">${App.escapeHTML(p.endereco)}</p>` : ''}
      ${p.obs ? `<div class="modal-subtitle">Observações</div><p class="detail-text">${App.escapeHTML(p.obs)}</p>` : ''}
    `, () => true, 'Fechar');
    document.getElementById('modal-cancel').style.display = 'none';
    document.getElementById('modal-confirm').onclick = () => {
      document.getElementById('modal-cancel').style.display = '';
      App.closeModal();
      return true;
    };
  },

  delete(id) {
    const p = DB.getPessoa(id);
    App.confirmDelete(`Deseja excluir <strong>"${App.escapeHTML(p?.nome)}"</strong> do cadastro?`, () => {
      DB.deletePessoa(id);
      App.showToast('Cadastro excluído.', 'info');
      this.render();
    });
  }
};
