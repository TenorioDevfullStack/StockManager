// ===================================================
//  AGENDA.JS — tarefas, eventos e lembretes
// ===================================================

const Agenda = {
  filter: { search: '', tipo: '', status: '' },

  TIPO_LABEL: { tarefa: '✅ Tarefa', evento: '📅 Evento', lembrete: '🔔 Lembrete' },
  TIPO_CLASS: { tarefa: 'tipo-cliente', evento: 'tipo-ambos', lembrete: 'tipo-fornecedor' },
  PRIO_LABEL: { baixa: 'Baixa', media: 'Média', alta: 'Alta' },
  PRIO_CLASS: { baixa: 'status-ok', media: 'status-baixo', alta: 'status-sem-estoque' },

  render() {
    const main = document.getElementById('main-content');
    const tarefas = DB.getTarefas();
    const pendentes = tarefas.filter(t => !t.concluida);

    main.innerHTML = `
      <div class="insight-strip">
        ${this.metric('Para hoje', pendentes.filter(t => this.isHoje(t.data)).length)}
        ${this.metric('Atrasadas', pendentes.filter(t => this.isAtrasada(t)).length)}
        ${this.metric('Pendentes', pendentes.length)}
        ${this.metric('Concluídas', tarefas.filter(t => t.concluida).length)}
      </div>
      <div class="page-actions">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input type="text" id="ag-search" placeholder="Buscar tarefa, evento ou lembrete..." class="search-input" value="${App.escapeHTML(this.filter.search)}">
        </div>
        <select id="ag-tipo-filter" class="select-input">
          <option value="">Todos os tipos</option>
          <option value="tarefa" ${this.filter.tipo === 'tarefa' ? 'selected' : ''}>✅ Tarefas</option>
          <option value="evento" ${this.filter.tipo === 'evento' ? 'selected' : ''}>📅 Eventos</option>
          <option value="lembrete" ${this.filter.tipo === 'lembrete' ? 'selected' : ''}>🔔 Lembretes</option>
        </select>
        <select id="ag-status-filter" class="select-input">
          <option value="">Todos os status</option>
          <option value="pendente" ${this.filter.status === 'pendente' ? 'selected' : ''}>Pendentes</option>
          <option value="atrasada" ${this.filter.status === 'atrasada' ? 'selected' : ''}>Atrasadas</option>
          <option value="hoje" ${this.filter.status === 'hoje' ? 'selected' : ''}>Para hoje</option>
          <option value="concluida" ${this.filter.status === 'concluida' ? 'selected' : ''}>Concluídas</option>
        </select>
        <button class="btn btn-primary" onclick="Agenda.openForm()">+ Nova Tarefa</button>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Prioridade</th>
              <th>Data</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="ag-tbody"></tbody>
        </table>
      </div>
      <div id="ag-empty" class="empty-state hidden">
        <div class="empty-icon">🗓️</div>
        <p>Nenhuma tarefa, evento ou lembrete encontrado.</p>
        <button class="btn btn-primary" onclick="Agenda.openForm()">Criar primeira tarefa</button>
      </div>
    `;

    document.getElementById('ag-search').addEventListener('input', (e) => {
      this.filter.search = e.target.value.toLowerCase();
      this.renderTable();
    });
    document.getElementById('ag-tipo-filter').addEventListener('change', (e) => {
      this.filter.tipo = e.target.value;
      this.renderTable();
    });
    document.getElementById('ag-status-filter').addEventListener('change', (e) => {
      this.filter.status = e.target.value;
      this.renderTable();
    });

    this.renderTable();
  },

  renderTable() {
    let tarefas = DB.getTarefas();

    if (this.filter.tipo) tarefas = tarefas.filter(t => t.tipo === this.filter.tipo);
    if (this.filter.status === 'pendente') tarefas = tarefas.filter(t => !t.concluida);
    if (this.filter.status === 'concluida') tarefas = tarefas.filter(t => t.concluida);
    if (this.filter.status === 'atrasada') tarefas = tarefas.filter(t => this.isAtrasada(t));
    if (this.filter.status === 'hoje') tarefas = tarefas.filter(t => !t.concluida && this.isHoje(t.data));
    if (this.filter.search) {
      tarefas = tarefas.filter(t =>
        (t.titulo || '').toLowerCase().includes(this.filter.search) ||
        (t.descricao || '').toLowerCase().includes(this.filter.search)
      );
    }

    // Pendentes primeiro (por data crescente, sem data por último); concluídas no fim.
    tarefas.sort((a, b) => {
      if (a.concluida !== b.concluida) return a.concluida ? 1 : -1;
      if (a.concluida) return new Date(b.concluidaEm || 0) - new Date(a.concluidaEm || 0);
      if (!a.data && !b.data) return new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0);
      if (!a.data) return 1;
      if (!b.data) return -1;
      return new Date(a.data) - new Date(b.data);
    });

    const tbody = document.getElementById('ag-tbody');
    const empty = document.getElementById('ag-empty');
    if (!tbody) return;

    if (tarefas.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      document.querySelector('.table-container').style.display = 'none';
      return;
    }

    empty.classList.add('hidden');
    document.querySelector('.table-container').style.display = '';

    tbody.innerHTML = tarefas.map(t => {
      const status = this.getStatus(t);
      return `
      <tr class="${t.concluida ? 'task-done' : ''}">
        <td>
          <button class="btn btn-sm btn-icon" title="${t.concluida ? 'Reabrir' : 'Concluir'}" onclick="Agenda.toggle('${t.id}')">${t.concluida ? '☑' : '☐'}</button>
        </td>
        <td>
          <button class="link-button prod-name" onclick="Agenda.openDetails('${t.id}')">${App.escapeHTML(t.titulo)}</button>
          ${t.descricao ? `<div class="prod-desc">${App.escapeHTML(t.descricao)}</div>` : ''}
        </td>
        <td><span class="tipo-badge ${this.TIPO_CLASS[t.tipo] || ''}">${this.TIPO_LABEL[t.tipo] || t.tipo}</span></td>
        <td><span class="status-badge ${this.PRIO_CLASS[t.prioridade] || ''}">${this.PRIO_LABEL[t.prioridade] || '—'}</span></td>
        <td class="date-cell">${t.data ? App.formatDate(t.data) : '—'}</td>
        <td><span class="status-badge ${status.cls}">${status.label}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-icon" title="Editar" onclick="Agenda.openForm('${t.id}')">✏️</button>
            <button class="btn btn-sm btn-icon" title="Excluir" onclick="Agenda.delete('${t.id}')">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  metric(label, value) {
    return `<div class="insight-card"><span>${label}</span><strong>${value}</strong></div>`;
  },

  isHoje(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    const hoje = new Date();
    return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate();
  },

  isAtrasada(tarefa) {
    if (tarefa.concluida || !tarefa.data) return false;
    return new Date(tarefa.data) < new Date();
  },

  getStatus(tarefa) {
    if (tarefa.concluida) return { label: 'Concluída', cls: 'status-ok' };
    if (this.isAtrasada(tarefa)) return { label: 'Atrasada', cls: 'status-sem-estoque' };
    if (this.isHoje(tarefa.data)) return { label: 'Hoje', cls: 'status-baixo' };
    return { label: 'Pendente', cls: '' };
  },

  toInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  openForm(id = null) {
    const tarefa = id ? DB.getTarefa(id) : null;
    const title = tarefa ? 'Editar Item da Agenda' : 'Nova Tarefa / Lembrete';

    const formHTML = `
      <form id="ag-form" class="modal-form" autocomplete="off">
        <div class="form-group">
          <label>Título *</label>
          <input type="text" id="agf-titulo" class="form-input" value="${App.escapeHTML(tarefa?.titulo || '')}" required placeholder="O que precisa ser feito ou lembrado">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo *</label>
            <select id="agf-tipo" class="form-input" required>
              <option value="tarefa" ${!tarefa || tarefa?.tipo === 'tarefa' ? 'selected' : ''}>✅ Tarefa</option>
              <option value="evento" ${tarefa?.tipo === 'evento' ? 'selected' : ''}>📅 Evento</option>
              <option value="lembrete" ${tarefa?.tipo === 'lembrete' ? 'selected' : ''}>🔔 Lembrete</option>
            </select>
          </div>
          <div class="form-group">
            <label>Prioridade</label>
            <select id="agf-prioridade" class="form-input">
              <option value="baixa" ${tarefa?.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
              <option value="media" ${!tarefa || tarefa?.prioridade === 'media' ? 'selected' : ''}>Média</option>
              <option value="alta" ${tarefa?.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Data e hora</label>
          <input type="datetime-local" id="agf-data" class="form-input" value="${this.toInputValue(tarefa?.data)}">
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="agf-descricao" class="form-input" rows="3" placeholder="Detalhes, local, materiais necessários...">${App.escapeHTML(tarefa?.descricao || '')}</textarea>
        </div>
      </form>`;

    App.openModal(title, formHTML, () => {
      const titulo = document.getElementById('agf-titulo').value.trim();
      if (!titulo) { App.showToast('Título é obrigatório.', 'error'); return false; }

      const dataVal = document.getElementById('agf-data').value;
      const data = {
        id: tarefa?.id || null,
        titulo,
        tipo: document.getElementById('agf-tipo').value,
        prioridade: document.getElementById('agf-prioridade').value,
        data: dataVal ? new Date(dataVal).toISOString() : null,
        descricao: document.getElementById('agf-descricao').value.trim(),
        concluida: tarefa?.concluida || false,
        concluidaEm: tarefa?.concluidaEm || null,
      };

      DB.saveTarefa(data);
      App.showToast(tarefa ? 'Item atualizado!' : 'Item adicionado à agenda!');
      this.render();
      return true;
    });
  },

  openDetails(id) {
    const t = DB.getTarefa(id);
    if (!t) return;
    const status = this.getStatus(t);
    App.openModal('Detalhes', `
      <div class="detail-grid">
        <div><span>Título</span><strong>${App.escapeHTML(t.titulo)}</strong></div>
        <div><span>Tipo</span><strong>${this.TIPO_LABEL[t.tipo] || App.escapeHTML(t.tipo)}</strong></div>
        <div><span>Prioridade</span><strong>${this.PRIO_LABEL[t.prioridade] || '—'}</strong></div>
        <div><span>Status</span><strong>${status.label}</strong></div>
        <div><span>Data</span><strong>${t.data ? App.formatDate(t.data) : '—'}</strong></div>
        <div><span>${t.concluida ? 'Concluída em' : 'Criada em'}</span><strong>${App.formatDate(t.concluida ? t.concluidaEm : t.criadoEm)}</strong></div>
      </div>
      ${t.descricao ? `<div class="modal-subtitle">Descrição</div><p class="detail-text">${App.escapeHTML(t.descricao)}</p>` : ''}
    `, () => true, 'Fechar');
    document.getElementById('modal-cancel').style.display = 'none';
  },

  toggle(id) {
    const t = DB.getTarefa(id);
    if (!t) return;
    const concluida = !t.concluida;
    DB.saveTarefa({ ...t, concluida, concluidaEm: concluida ? new Date().toISOString() : null });
    App.showToast(concluida ? 'Concluída!' : 'Reaberta.', concluida ? 'success' : 'info');
    this.render();
  },

  delete(id) {
    const t = DB.getTarefa(id);
    App.confirmDelete(`Deseja excluir <strong>"${App.escapeHTML(t?.titulo)}"</strong> da agenda?`, () => {
      DB.deleteTarefa(id);
      App.showToast('Item excluído da agenda.', 'info');
      this.render();
    });
  },

  notifyPending() {
    const pendentes = DB.getTarefas().filter(t => !t.concluida && t.data);
    const atrasadas = pendentes.filter(t => this.isAtrasada(t)).length;
    const hoje = pendentes.filter(t => !this.isAtrasada(t) && this.isHoje(t.data)).length;
    if (!atrasadas && !hoje) return;

    const partes = [];
    if (atrasadas) partes.push(`${atrasadas} atrasada${atrasadas > 1 ? 's' : ''}`);
    if (hoje) partes.push(`${hoje} para hoje`);
    App.showToast(`Agenda: ${partes.join(' e ')}.`, 'info');
  },
};
