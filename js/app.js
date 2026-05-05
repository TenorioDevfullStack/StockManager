// ===================================================
//  APP.JS — Roteamento SPA e estado global
// ===================================================

const App = {
  currentPage: 'dashboard',
  initializedShell: false,

  routes: {
    dashboard: { label: 'Dashboard', icon: '⊞', render: () => Dashboard.render() },
    produtos: { label: 'Materiais', icon: '📦', render: () => Produtos.render() },
    movimentacoes: { label: 'Movimentações', icon: '🔄', render: () => Movimentacoes.render() },
    pessoas: { label: 'Equipe', icon: '👥', render: () => Pessoas.render() },
    relatorios: { label: 'Relatórios', icon: '📊', render: () => Relatorios.render() },
  },

  async init() {
    await DB.init?.();
    this.bindAuthActions();

    if (!DB.remoteReady) {
      this.showAuthMessage(DB.remoteError || 'Supabase não está configurado. Configure o acesso antes de usar o sistema.', 'error');
      return;
    }

    const { data } = await DB.supabase.auth.getSession();
    if (data?.session?.user) {
      await this.startAuthenticated(data.session.user);
    } else {
      this.showAuth();
    }

    DB.supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) await this.startAuthenticated(session.user);
      if (event === 'SIGNED_OUT') this.showAuth();
    });
  },

  bindAuthActions() {
    document.getElementById('auth-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.signIn();
    });
    const registerBtn = document.getElementById('auth-register');
    if (window.SUPABASE_CONFIG?.allowSignUp) {
      registerBtn?.addEventListener('click', async () => this.signUp());
    } else {
      registerBtn?.remove();
    }
    document.getElementById('logout-btn')?.addEventListener('click', async () => this.signOut());
  },

  showAuth() {
    document.body.classList.add('auth-active');
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-email')?.focus();
    DB.clearUser?.();
  },

  async startAuthenticated(user) {
    DB.setUser(user);
    document.body.classList.remove('auth-active');
    document.getElementById('session-user').textContent = user.email || 'Conectado';

    if (!this.initializedShell) {
      this.buildSidebar();
      this.bindSidebarToggle();
      this.bindGlobalActions();
      this.initializedShell = true;
    }

    await DB.syncFromSupabase();
    await DB.syncToSupabase();
    this.navigate(this.currentPage || 'dashboard');
  },

  async signIn() {
    if (!DB.supabase) {
      this.showAuthMessage(DB.remoteError || 'Supabase não está configurado.', 'error');
      return;
    }
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    this.setAuthLoading(true, 'Entrando...');
    const { error } = await DB.supabase.auth.signInWithPassword({ email, password });
    this.setAuthLoading(false);
    if (error) {
      this.showAuthMessage(this.authErrorMessage(error), 'error');
      return;
    }
    this.showAuthMessage('');
  },

  async signUp() {
    if (!DB.supabase) {
      this.showAuthMessage(DB.remoteError || 'Supabase não está configurado.', 'error');
      return;
    }
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || password.length < 6) {
      this.showAuthMessage('Informe e-mail e senha com pelo menos 6 caracteres.', 'error');
      return;
    }

    this.setAuthLoading(true, 'Criando...');
    const { data, error } = await DB.supabase.auth.signUp({ email, password });
    this.setAuthLoading(false);
    if (error) {
      this.showAuthMessage(this.authErrorMessage(error), 'error');
      return;
    }
    if (!data?.session) {
      this.showAuthMessage('Acesso criado. Confirme o e-mail antes de entrar.', 'success');
      return;
    }
    this.showAuthMessage('Acesso criado.', 'success');
  },

  async signOut() {
    await DB.supabase?.auth.signOut();
    DB.clearLocalData?.();
    DB.clearUser?.();
    this.currentPage = 'dashboard';
    this.showAuth();
  },

  setAuthLoading(isLoading, label = 'Entrar') {
    const submit = document.getElementById('auth-submit');
    const register = document.getElementById('auth-register');
    if (!submit || !register) return;
    submit.disabled = isLoading;
    register.disabled = isLoading;
    submit.textContent = isLoading ? label : 'Entrar';
  },

  showAuthMessage(message, type = '') {
    const el = document.getElementById('auth-message');
    if (!el) return;
    el.textContent = message || '';
    el.className = `auth-message ${type}`.trim();
  },

  authErrorMessage(error) {
    const msg = String(error?.message || '');
    if (msg.includes('Invalid login credentials')) return 'E-mail ou senha inválidos.';
    if (msg.includes('Email not confirmed')) return 'Confirme o e-mail antes de entrar.';
    if (msg.includes('User already registered')) return 'Este e-mail já possui acesso.';
    return msg || 'Não foi possível concluir o acesso.';
  },

  buildSidebar() {
    const nav = document.getElementById('nav-links');
    nav.innerHTML = '';
    Object.entries(this.routes).forEach(([key, route]) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <a href="#" class="nav-link" data-page="${key}" id="nav-${key}">
          <span class="nav-icon">${route.icon}</span>
          <span class="nav-label">${route.label}</span>
        </a>`;
      li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(key);
      });
      nav.appendChild(li);
    });
  },

  navigate(page) {
    if (!DB.user) return;
    if (!this.routes[page]) return;
    this.currentPage = page;

    // Atualiza menu ativo
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const activeLink = document.getElementById(`nav-${page}`);
    if (activeLink) activeLink.classList.add('active');

    // Atualiza título
    document.getElementById('page-title').textContent = this.routes[page].label;

    // Renderiza conteúdo
    const main = document.getElementById('main-content');
    main.innerHTML = '';
    main.classList.remove('fade-in');
    void main.offsetWidth; // trigger reflow
    main.classList.add('fade-in');
    this.routes[page].render();

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  },

  bindSidebarToggle() {
    const btn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    btn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  },

  // ---- Helpers UI ----
  showToast(msg, type = 'success') {
    const toasts = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span> ${this.escapeHTML(msg)}`;
    toasts.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
  },

  openModal(title, bodyHTML, onConfirm, confirmLabel = 'Salvar') {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    const confirmBtn = document.getElementById('modal-confirm');
    document.getElementById('modal-cancel').style.display = '';
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = 'btn btn-primary';
    overlay.classList.add('active');

    confirmBtn.onclick = () => {
      if (onConfirm()) this.closeModal();
    };

    const firstInput = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea');
    setTimeout(() => firstInput?.focus(), 40);
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('modal-cancel').style.display = '';
  },

  confirmDelete(msg, onConfirm) {
    this.openModal('Confirmar Exclusão',
      `<div class="delete-confirm-msg">
        <div class="delete-icon">🗑️</div>
        <p>${msg}</p>
        <p class="delete-warn">Esta ação não pode ser desfeita.</p>
      </div>`,
      () => { onConfirm(); return true; },
      'Excluir'
    );
    document.getElementById('modal-confirm').classList.add('btn-danger');
  },

  bindGlobalActions() {
    document.getElementById('backup-export')?.addEventListener('click', () => this.exportBackup());
    document.getElementById('backup-import')?.addEventListener('click', () => document.getElementById('backup-file')?.click());
    document.getElementById('backup-file')?.addEventListener('change', (event) => this.importBackup(event));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeModal();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.search-input')?.focus();
      }
    });
  },

  escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  getStockStatus(produto) {
    if (!produto || Number(produto.quantidade) <= 0) {
      return { key: 'sem-estoque', label: 'Sem estoque', tone: 'red' };
    }
    if (Number(produto.quantidade) <= Number(produto.qtdMinima || 0)) {
      return { key: 'baixo', label: 'Baixo', tone: 'amber' };
    }
    return { key: 'ok', label: 'Normal', tone: 'green' };
  },

  exportBackup() {
    const payload = DB.exportData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `controle_estoque_backup_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.showToast('Backup exportado.');
  },

  importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        DB.importData(payload);
        this.showToast('Backup importado.');
        this.navigate(this.currentPage);
      } catch (err) {
        this.showToast(err.message || 'Arquivo inválido.', 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  },

  formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  formatMoney(val) {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatNum(val) {
    return Number(val || 0).toLocaleString('pt-BR');
  },

  uid(prefix) {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
};

// Fecha modal ao clicar fora
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') App.closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', () => App.closeModal());
  document.getElementById('modal-cancel').addEventListener('click', () => App.closeModal());
  App.init();
});
