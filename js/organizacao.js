// ===================================================
//  ORGANIZACAO.JS — Membros da equipe
// ===================================================

const Organizacao = {
  async render() {
    const main = document.getElementById('main-content');
    const isAdmin = DB.isOrgAdmin();

    main.innerHTML = `
      <div class="insight-strip">
        ${this.metric('Organização', App.escapeHTML(DB.orgNome || '—'))}
        ${this.metric('Seu papel', isAdmin ? 'Administrador' : 'Membro')}
        ${this.metric('Membros', '…')}
      </div>
      <div class="page-actions">
        <div></div>
        ${isAdmin ? `<button class="btn btn-primary" onclick="Organizacao.openAddForm()">+ Adicionar membro</button>` : ''}
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Desde</th>
              ${isAdmin ? '<th>Ações</th>' : ''}
            </tr>
          </thead>
          <tbody id="org-tbody">
            <tr><td colspan="${isAdmin ? 4 : 3}" class="muted">Carregando membros…</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const membros = await DB.getMembros();
    this._membros = membros; // cache para lookups por user_id (evita dados no HTML inline)
    this.renderTable(membros, isAdmin);

    const totalCard = document.querySelectorAll('.insight-card strong')[2];
    if (totalCard) totalCard.textContent = membros.length;
  },

  renderTable(membros, isAdmin) {
    const tbody = document.getElementById('org-tbody');
    if (!tbody) return;

    if (!membros.length) {
      tbody.innerHTML = `<tr><td colspan="${isAdmin ? 4 : 3}" class="muted">Nenhum membro encontrado.</td></tr>`;
      return;
    }

    const papelLabel = { admin: '🛡️ Administrador', membro: '👤 Membro' };

    tbody.innerHTML = membros.map(m => {
      const isSelf = m.user_id === DB.user?.id;
      return `
      <tr>
        <td>${App.escapeHTML(m.email || '—')}${isSelf ? ' <span class="sku-badge">você</span>' : ''}</td>
        <td><span class="tipo-badge ${m.papel === 'admin' ? 'tipo-ambos' : 'tipo-cliente'}">${papelLabel[m.papel] || App.escapeHTML(m.papel)}</span></td>
        <td class="date-cell">${App.formatDate(m.criado_em)}</td>
        ${isAdmin ? `<td>
          <div class="action-btns">
            <button class="btn btn-sm btn-icon" title="Alterar papel" onclick="Organizacao.toggleRole('${m.user_id}')">🔁</button>
            ${isSelf ? '' : `<button class="btn btn-sm btn-icon" title="Remover" onclick="Organizacao.remove('${m.user_id}')">🗑️</button>`}
          </div>
        </td>` : ''}
      </tr>`;
    }).join('');
  },

  metric(label, value) {
    return `<div class="insight-card"><span>${label}</span><strong>${value}</strong></div>`;
  },

  openAddForm() {
    const formHTML = `
      <form id="org-form" class="modal-form" autocomplete="off">
        <div class="form-group">
          <label>E-mail do usuário *</label>
          <input type="email" id="orgf-email" class="form-input" placeholder="colega@empresa.com" required>
          <p class="detail-text">O usuário já precisa ter acesso criado no Supabase Auth.</p>
        </div>
        <div class="form-group">
          <label>Papel</label>
          <select id="orgf-papel" class="form-input">
            <option value="membro">👤 Membro</option>
            <option value="admin">🛡️ Administrador</option>
          </select>
        </div>
      </form>`;

    App.openModal('Adicionar membro', formHTML, () => false, 'Adicionar');

    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.onclick = async () => {
      const email = document.getElementById('orgf-email').value.trim();
      const papel = document.getElementById('orgf-papel').value;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        App.showToast('Informe um e-mail válido.', 'error');
        return;
      }
      confirmBtn.disabled = true;
      const res = await DB.adicionarMembro(email, papel);
      confirmBtn.disabled = false;
      if (res) {
        App.showToast('Membro adicionado!');
        App.closeModal();
        this.render();
      }
    };
  },

  _findMembro(userId) {
    return (this._membros || []).find(m => m.user_id === userId);
  },

  async toggleRole(userId) {
    const membro = this._findMembro(userId);
    if (!membro) return;
    const novo = membro.papel === 'admin' ? 'membro' : 'admin';
    const res = await DB.adicionarMembro(membro.email, novo);
    if (res) {
      App.showToast(`${membro.email} agora é ${novo === 'admin' ? 'administrador' : 'membro'}.`);
      this.render();
    }
  },

  remove(userId) {
    const membro = this._findMembro(userId);
    if (!membro) return;
    App.confirmDelete(`Remover <strong>"${App.escapeHTML(membro.email)}"</strong> da organização?`, async () => {
      const res = await DB.removerMembro(userId);
      if (res) {
        App.showToast('Membro removido.', 'info');
        this.render();
      }
    });
  },
};
