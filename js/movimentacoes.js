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
        ${this.metric('Entradas registradas', movs.filter(m => m.tipo === 'entrada').length)}
        ${this.metric('Retiradas registradas', movs.filter(m => m.tipo === 'saida').length)}
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
              <th>Custo total</th>
              <th>Setor / Referência</th>
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
        const nome = Inventario.movimento(m).nome.toLowerCase();
        return nome.includes(this.filter.search) || funcionario.includes(this.filter.search) || (m.setor || '').toLowerCase().includes(this.filter.search);
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
      const prod = Inventario.movimento(m);
      const icon = m.tipo === 'entrada' ? '▲' : m.tipo === 'saida' ? '▼' : '↕';
      return `
        <tr>
          <td class="date-cell">${App.formatDate(m.data)}</td>
          <td><span class="mov-badge mov-${m.tipo}">${icon} ${m.tipo}</span></td>
          <td>
            <strong>${App.escapeHTML(prod.nome)}</strong>
            ${prod ? `<div class="prod-desc">${App.escapeHTML(prod.sku || '')}</div>` : ''}
          </td>
          <td><strong>${App.formatNum(m.quantidade)} ${App.escapeHTML(prod.unidade)}</strong></td>
          <td>${m.tipo === 'ajuste' ? '—' : Inventario.dinheiro(m.custoTotal)}</td>
          <td>${App.escapeHTML(m.setor || '—')}<div class="prod-desc">${App.escapeHTML(m.documentoReferencia || '')}</div></td>
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

    const operacaoId = DB._uuid();
    const fornecedores = DB.getPessoas().filter(p => ['fornecedor', 'ambos'].includes(p.tipo));
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
            <label for="mf-quantidade" id="mf-qty-label">Quantidade *</label>
            <input type="number" id="mf-quantidade" class="form-input" min="0.001" step="0.001" value="1" required>
          </div>
        </div>
        <div id="mf-compra-campos">
          <div class="form-row">
            <div class="form-group">
              <label for="mf-custo">Custo unitário (R$)</label>
              <input type="number" id="mf-custo" class="form-input" min="0" step="0.000001" placeholder="Não informado">
              <small>Preço por unidade cadastrada. Inclua o frete rateado, se houver. Vazio = desconhecido; zero = gratuito.</small>
            </div>
            <div class="form-group">
              <label for="mf-fornecedor">Fornecedor</label>
              <select id="mf-fornecedor" class="form-input"><option value="">Não informado</option>
                ${fornecedores.map(p => `<option value="${p.id}">${App.escapeHTML(p.nome)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="mf-setor">Setor / Local de aplicação</label>
            <input id="mf-setor" class="form-input" maxlength="120" placeholder="Ex.: Primeiro subsolo"></div>
          <div class="form-group"><label for="mf-referencia">Nota / Referência do serviço</label>
            <input id="mf-referencia" class="form-input" maxlength="120" placeholder="Ex.: NF 1234 ou OS 42"></div>
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
      if (!document.getElementById('mov-form').reportValidity()) return;
      const tipo = document.querySelector('input[name="tipo"]:checked')?.value;
      const produtoId = document.getElementById('mf-produto').value;
      const quantidade = Number(document.getElementById('mf-quantidade').value);
      const funcionario = document.getElementById('mf-funcionario').value.trim();

      if (!tipo || !produtoId || !Number.isFinite(quantidade) || quantidade < 0 || (tipo !== 'ajuste' && quantidade === 0)) {
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

      const custo = document.getElementById('mf-custo').value;
      confirmBtn.disabled = true;
      try {
        const salvo = await DB.saveMovimentacao({
          produtoId, tipo, quantidade,
          motivo: document.getElementById('mf-motivo').value.trim(),
          funcionario, responsavel: funcionario,
          custoUnitario: tipo === 'entrada' && custo !== '' ? Number(custo) : null,
          fornecedorId: document.getElementById('mf-fornecedor').value || null,
          setor: document.getElementById('mf-setor').value.trim(),
          documentoReferencia: document.getElementById('mf-referencia').value.trim(),
          operacaoId,
        });
        if (!salvo) return;
        App.showToast('Movimentação confirmada no servidor!');
        App.closeModal();
        App.navigate(App.currentPage);
      } finally { confirmBtn.disabled = false; }
    };

    document.getElementById('mov-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!confirmBtn.disabled) confirmBtn.click();
    });

    // Radio interativo
    {
      const updateLabels = () => {
        const tipo = document.querySelector('input[name="tipo"]:checked')?.value;
        const qtyLabel = document.getElementById('mf-qty-label');
        const pessoaLabel = document.getElementById('mf-funcionario-label');
        const pessoaInput = document.getElementById('mf-funcionario');
        const motivoInput = document.getElementById('mf-motivo');
        const entrada = tipo === 'entrada';
        document.getElementById('mf-compra-campos').hidden = !entrada;
        document.getElementById('mf-custo').disabled = !entrada;
        document.getElementById('mf-fornecedor').disabled = !entrada;
        document.getElementById('mf-quantidade').min = tipo === 'ajuste' ? '0' : '0.001';
        motivoInput.required = tipo === 'ajuste';
        pessoaInput.required = tipo === 'saida';
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
    }
  }
};
