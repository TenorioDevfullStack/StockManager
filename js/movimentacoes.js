// ===================================================
//  MOVIMENTACOES.JS
// ===================================================

const Movimentacoes = {
  filter: { tipo: '', search: '' },

  render() {
    const main = document.getElementById('main-content');
    const movs = DB.getMovimentacoes();
    main.innerHTML = `
      <div class="insight-strip">
        ${this.metric('Registros', movs.length)}
        ${this.metric('Entradas', App.formatNum(movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.quantidade || 0), 0)))}
        ${this.metric('Saídas', App.formatNum(movs.filter(m => m.tipo === 'saida').reduce((s, m) => s + Number(m.quantidade || 0), 0)))}
        ${this.metric('Ajustes', App.formatNum(movs.filter(m => m.tipo === 'ajuste').length))}
      </div>
      <div class="page-actions">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input type="text" id="mov-search" placeholder="Buscar por material ou funcionário..." class="search-input" value="${App.escapeHTML(this.filter.search)}">
        </div>
        <select id="mov-tipo-filter" class="select-input">
          <option value="">Todos os tipos</option>
          <option value="entrada" ${this.filter.tipo === 'entrada' ? 'selected' : ''}>▲ Entrada</option>
          <option value="saida" ${this.filter.tipo === 'saida' ? 'selected' : ''}>▼ Saída</option>
          <option value="ajuste" ${this.filter.tipo === 'ajuste' ? 'selected' : ''}>↕ Ajuste</option>
        </select>
        <div class="btn-group">
          <button class="btn btn-success" onclick="Movimentacoes.openForm('entrada')">▲ Entrada</button>
          <button class="btn btn-danger-outline" onclick="Movimentacoes.openForm('saida')">▼ Retirada</button>
          <button class="btn btn-ghost" onclick="Movimentacoes.openForm('ajuste')">↕ Ajuste</button>
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Tipo</th>
              <th>Material</th>
              <th>Quantidade</th>
              <th>Motivo</th>
              <th>Funcionário / Responsável</th>
            </tr>
          </thead>
          <tbody id="mov-tbody"></tbody>
        </table>
      </div>
      <div id="mov-empty" class="empty-state hidden">
        <div class="empty-icon">🔄</div>
        <p>Nenhuma movimentação registrada.</p>
        <button class="btn btn-primary" onclick="Movimentacoes.openForm('entrada')">Registrar primeira entrada</button>
      </div>
    `;

    document.getElementById('mov-search').addEventListener('input', (e) => {
      this.filter.search = e.target.value.toLowerCase();
      this.renderTable();
    });
    document.getElementById('mov-tipo-filter').addEventListener('change', (e) => {
      this.filter.tipo = e.target.value;
      this.renderTable();
    });

    this.renderTable();
  },

  renderTable() {
    let movs = DB.getMovimentacoes();
    if (this.filter.tipo) movs = movs.filter(m => m.tipo === this.filter.tipo);
    if (this.filter.search) {
      movs = movs.filter(m => {
        const prod = DB.getProduto(m.produtoId);
        const funcionario = (m.funcionario || m.responsavel || '').toLowerCase();
        return (prod && prod.nome.toLowerCase().includes(this.filter.search)) || funcionario.includes(this.filter.search);
      });
    }

    const tbody = document.getElementById('mov-tbody');
    const empty = document.getElementById('mov-empty');
    if (!tbody) return;

    if (movs.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      document.querySelector('.table-container').style.display = 'none';
      return;
    }

    empty.classList.add('hidden');
    document.querySelector('.table-container').style.display = '';

    tbody.innerHTML = movs.map(m => {
      const prod = DB.getProduto(m.produtoId);
      const icon = m.tipo === 'entrada' ? '▲' : m.tipo === 'saida' ? '▼' : '↕';
      return `
        <tr>
          <td class="date-cell">${App.formatDate(m.data)}</td>
          <td><span class="mov-badge mov-${m.tipo}">${icon} ${m.tipo}</span></td>
          <td>
            <strong>${prod ? App.escapeHTML(prod.nome) : '<em>Material removido</em>'}</strong>
            ${prod ? `<div class="prod-desc">${App.escapeHTML(prod.sku || '')}</div>` : ''}
          </td>
          <td><strong>${App.formatNum(m.quantidade)} ${prod ? App.escapeHTML(prod.unidade) : 'un'}</strong></td>
          <td>${App.escapeHTML(m.motivo || '—')}</td>
          <td>${App.escapeHTML(m.funcionario || m.responsavel || '—')}</td>
        </tr>`;
    }).join('');
  },

  metric(label, value) {
    return `<div class="insight-card"><span>${label}</span><strong>${value}</strong></div>`;
  },

  openForm(tipoDefault = 'entrada', produtoDefaultId = '') {
    const produtos = DB.getProdutos();
    if (produtos.length === 0) {
      App.showToast('Cadastre pelo menos um material antes de movimentar.', 'error');
      return;
    }

    const formHTML = `
      <form id="mov-form" class="modal-form" autocomplete="off">
        <div class="form-group">
          <label>Tipo de Movimentação *</label>
          <div class="tipo-selector">
            <label class="tipo-option ${tipoDefault === 'entrada' ? 'selected' : ''}">
              <input type="radio" name="tipo" value="entrada" ${tipoDefault === 'entrada' ? 'checked' : ''}> ▲ Entrada
            </label>
            <label class="tipo-option ${tipoDefault === 'saida' ? 'selected' : ''}">
              <input type="radio" name="tipo" value="saida" ${tipoDefault === 'saida' ? 'checked' : ''}> ▼ Retirada
            </label>
            <label class="tipo-option ${tipoDefault === 'ajuste' ? 'selected' : ''}">
              <input type="radio" name="tipo" value="ajuste" ${tipoDefault === 'ajuste' ? 'checked' : ''}> ↕ Ajuste
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Material *</label>
          <select id="mf-produto" class="form-input" required>
            <option value="">Selecione o material...</option>
            ${produtos.map(p => `<option value="${p.id}" ${produtoDefaultId === p.id ? 'selected' : ''}>${App.escapeHTML(p.nome)} (Estoque: ${App.formatNum(p.quantidade)} ${App.escapeHTML(p.unidade)})</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label id="mf-qty-label">Quantidade *</label>
            <input type="number" id="mf-quantidade" class="form-input" min="1" value="1" required>
          </div>
        </div>
        <div class="form-group">
          <label id="mf-motivo-label">Motivo / Observação</label>
          <input type="text" id="mf-motivo" class="form-input" placeholder="Motivo da movimentação">
        </div>
        <div class="form-group">
          <label id="mf-funcionario-label">Responsável</label>
          <input type="text" id="mf-funcionario" class="form-input" placeholder="Nome do responsável">
        </div>
      </form>`;

    // Mantem o modal aberto (() => false) e trata a confirmacao de forma
    // assincrona, pois DB.saveMovimentacao agora usa a RPC atomica.
    App.openModal('Nova Movimentação', formHTML, () => false, 'Registrar');

    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.onclick = async () => {
      const tipo = document.querySelector('input[name="tipo"]:checked')?.value;
      const produtoId = document.getElementById('mf-produto').value;
      const quantidade = Number(document.getElementById('mf-quantidade').value);
      const funcionario = document.getElementById('mf-funcionario').value.trim();

      if (!tipo || !produtoId || !quantidade || quantidade <= 0) {
        App.showToast('Preencha todos os campos obrigatórios.', 'error');
        return;
      }
      if (tipo === 'saida' && !funcionario) {
        App.showToast('Informe o funcionário que retirou o material.', 'error');
        return;
      }

      const prod = DB.getProduto(produtoId);
      if (tipo === 'saida' && prod && quantidade > prod.quantidade) {
        App.showToast(`Estoque insuficiente! Disponível: ${prod.quantidade} ${prod.unidade}`, 'error');
        return;
      }

      confirmBtn.disabled = true;
      const salvo = await DB.saveMovimentacao({
        produtoId,
        tipo,
        quantidade,
        motivo: document.getElementById('mf-motivo').value.trim(),
        funcionario,
        responsavel: funcionario,
      });
      confirmBtn.disabled = false;

      if (!salvo) return; // erro ja exibido via toast pela RPC
      App.showToast('Movimentação registrada!');
      App.closeModal();
      if (App.currentPage === 'movimentacoes') this.render();
    };

    // Radio interativo
    setTimeout(() => {
      const updateLabels = () => {
        const tipo = document.querySelector('input[name="tipo"]:checked')?.value;
        const qtyLabel = document.getElementById('mf-qty-label');
        const pessoaLabel = document.getElementById('mf-funcionario-label');
        const pessoaInput = document.getElementById('mf-funcionario');
        const motivoInput = document.getElementById('mf-motivo');
        if (tipo === 'ajuste') {
          qtyLabel.textContent = 'Nova Quantidade Total *';
          pessoaLabel.textContent = 'Responsável pelo ajuste';
          pessoaInput.placeholder = 'Nome do responsável pelo ajuste';
          motivoInput.placeholder = 'Motivo do ajuste';
        } else if (tipo === 'saida') {
          qtyLabel.textContent = 'Quantidade retirada *';
          pessoaLabel.textContent = 'Funcionário que retirou *';
          pessoaInput.placeholder = 'Nome do funcionário';
          motivoInput.placeholder = 'Setor, OS ou motivo da retirada';
        } else {
          qtyLabel.textContent = 'Quantidade recebida *';
          pessoaLabel.textContent = 'Responsável pelo recebimento';
          pessoaInput.placeholder = 'Nome do responsável';
          motivoInput.placeholder = 'Origem, nota ou observação';
        }
      };
      document.querySelectorAll('input[name="tipo"]').forEach(r => {
        r.addEventListener('change', () => {
          document.querySelectorAll('.tipo-option').forEach(o => o.classList.remove('selected'));
          r.parentElement.classList.add('selected');
          updateLabels();
        });
      });
      updateLabels();
    }, 50);
  }
};
