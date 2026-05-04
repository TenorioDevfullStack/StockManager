// ===================================================
//  STORAGE.JS - cache de sessão + sincronização Supabase
// ===================================================

const DB = {
  KEYS: {
    produtos: 'estoque_produtos',
    pessoas: 'estoque_pessoas',
    movimentacoes: 'estoque_movimentacoes',
    config: 'estoque_config',
  },

  supabase: null,
  remoteReady: false,
  user: null,

  async init() {
    this._initSupabase();
  },

  setUser(user) {
    this.user = user || null;
    this._migrateLocalIdsToUuid();
  },

  clearUser() {
    this.user = null;
  },

  clearLocalData() {
    this._remove(this.KEYS.produtos);
    this._remove(this.KEYS.pessoas);
    this._remove(this.KEYS.movimentacoes);
    this._remove(this.KEYS.config);
  },

  _initSupabase() {
    const cfg = window.SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.anonKey || cfg.url.includes('seu-project-ref') || cfg.anonKey.includes('sua-chave')) {
      console.warn('Supabase não configurado. Usando apenas armazenamento local.');
      return;
    }
    if (!window.supabase?.createClient) {
      console.warn('Biblioteca Supabase não carregada. Usando apenas armazenamento local.');
      return;
    }

    this.supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
    this.remoteReady = true;
  },

  _get(key) {
    try {
      return JSON.parse(sessionStorage.getItem(this._storageKey(key))) || [];
    } catch {
      return [];
    }
  },

  _set(key, value) {
    sessionStorage.setItem(this._storageKey(key), JSON.stringify(value));
  },

  _remove(key) {
    sessionStorage.removeItem(this._storageKey(key));
  },

  _storageKey(key) {
    if (!this.user?.id) return key;
    return `${key}_${this.user.id}`;
  },

  _uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16)
    );
  },

  _isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  },

  _migrateLocalIdsToUuid() {
    const idMap = new Map();
    const normalizeId = (id) => {
      if (this._isUuid(id)) return id;
      if (!idMap.has(id)) idMap.set(id, this._uuid());
      return idMap.get(id);
    };

    const produtos = this._get(this.KEYS.produtos).map(p => ({ ...p, id: normalizeId(p.id) }));
    const pessoas = this._get(this.KEYS.pessoas).map(p => ({ ...p, id: normalizeId(p.id) }));
    const movimentacoes = this._get(this.KEYS.movimentacoes).map(m => ({
      ...m,
      id: normalizeId(m.id),
      produtoId: m.produtoId ? normalizeId(m.produtoId) : m.produtoId,
      pessoaId: m.pessoaId ? normalizeId(m.pessoaId) : m.pessoaId,
    }));

    this._set(this.KEYS.produtos, produtos.map(p => this._cleanProduto(p)));
    this._set(this.KEYS.pessoas, pessoas);
    this._set(this.KEYS.movimentacoes, movimentacoes);
  },

  _cleanProduto(produto) {
    const clean = { ...produto };
    Object.keys(clean).forEach(key => {
      if (key.toLowerCase().startsWith('pre' + 'co')) delete clean[key];
    });
    return clean;
  },

  _produtoToRow(produto) {
    const p = this._cleanProduto(produto);
    return {
      id: p.id,
      nome: p.nome,
      sku: p.sku || null,
      categoria: p.categoria || 'Outros',
      unidade: p.unidade || 'un',
      quantidade: Number(p.quantidade || 0),
      qtd_minima: Number(p.qtdMinima || 0),
      localizacao: p.localizacao || null,
      descricao: p.descricao || null,
      criado_em: p.criadoEm || new Date().toISOString(),
      atualizado_em: p.atualizadoEm || new Date().toISOString(),
      user_id: this.user?.id,
    };
  },

  _rowToProduto(row) {
    return this._cleanProduto({
      id: row.id,
      nome: row.nome,
      sku: row.sku || '',
      categoria: row.categoria || 'Outros',
      unidade: row.unidade || 'un',
      quantidade: Number(row.quantidade || 0),
      qtdMinima: Number(row.qtd_minima || 0),
      localizacao: row.localizacao || '',
      descricao: row.descricao || '',
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
    });
  },

  _pessoaToRow(pessoa) {
    return {
      id: pessoa.id,
      nome: pessoa.nome,
      documento: pessoa.documento || null,
      tipo: pessoa.tipo === 'cliente' ? 'funcionario' : (pessoa.tipo || 'funcionario'),
      telefone: pessoa.telefone || null,
      email: pessoa.email || null,
      endereco: pessoa.endereco || null,
      obs: pessoa.obs || null,
      criado_em: pessoa.criadoEm || new Date().toISOString(),
      atualizado_em: pessoa.atualizadoEm || new Date().toISOString(),
      user_id: this.user?.id,
    };
  },

  _rowToPessoa(row) {
    return {
      id: row.id,
      nome: row.nome,
      documento: row.documento || '',
      tipo: row.tipo || 'funcionario',
      telefone: row.telefone || '',
      email: row.email || '',
      endereco: row.endereco || '',
      obs: row.obs || '',
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
    };
  },

  _movToRow(mov) {
    return {
      id: mov.id,
      produto_id: mov.produtoId || null,
      pessoa_id: mov.pessoaId || null,
      tipo: mov.tipo,
      quantidade: Number(mov.quantidade || 0),
      motivo: mov.motivo || null,
      responsavel: mov.funcionario || mov.responsavel || null,
      criado_em: mov.data || new Date().toISOString(),
      user_id: this.user?.id,
    };
  },

  _rowToMov(row) {
    return {
      id: row.id,
      produtoId: row.produto_id,
      pessoaId: row.pessoa_id,
      tipo: row.tipo,
      quantidade: Number(row.quantidade || 0),
      motivo: row.motivo || '',
      funcionario: row.responsavel || '',
      responsavel: row.responsavel || '',
      data: row.criado_em,
    };
  },

  async _tryRemote(action, fallbackMessage = 'Falha ao sincronizar com o Supabase.') {
    if (!this.remoteReady || !this.user) return null;
    try {
      const result = await action();
      if (result?.error) throw result.error;
      return result?.data ?? null;
    } catch (err) {
      console.error(fallbackMessage, err);
      App?.showToast?.(err.message || fallbackMessage, 'error');
      return null;
    }
  },

  async syncFromSupabase() {
    if (!this.remoteReady || !this.user) return;

    const produtos = await this._tryRemote(
      () => this.supabase.from('produtos').select('*').order('nome'),
      'Não foi possível buscar materiais do Supabase.'
    );
    const pessoas = await this._tryRemote(
      () => this.supabase.from('pessoas').select('*').order('nome'),
      'Não foi possível buscar equipe do Supabase.'
    );
    const movimentacoes = await this._tryRemote(
      () => this.supabase.from('movimentacoes').select('*').order('criado_em', { ascending: false }),
      'Não foi possível buscar movimentações do Supabase.'
    );

    if (Array.isArray(produtos) && (produtos.length > 0 || this.getProdutos().length === 0)) {
      this._set(this.KEYS.produtos, produtos.map(row => this._rowToProduto(row)));
    }
    if (Array.isArray(pessoas) && (pessoas.length > 0 || this.getPessoas().length === 0)) {
      this._set(this.KEYS.pessoas, pessoas.map(row => this._rowToPessoa(row)));
    }
    if (Array.isArray(movimentacoes) && (movimentacoes.length > 0 || this.getMovimentacoes().length === 0)) {
      this._set(this.KEYS.movimentacoes, movimentacoes.map(row => this._rowToMov(row)));
    }
  },

  async syncToSupabase() {
    if (!this.remoteReady || !this.user) return;

    const produtos = this.getProdutos().map(p => this._produtoToRow(p));
    const pessoas = this.getPessoas().map(p => this._pessoaToRow(p));
    const movimentacoes = this.getMovimentacoes().map(m => this._movToRow(m));

    if (produtos.length) {
      await this._tryRemote(
        () => this.supabase.from('produtos').upsert(produtos, { onConflict: 'id' }),
        'Não foi possível enviar materiais ao Supabase.'
      );
    }
    if (pessoas.length) {
      await this._tryRemote(
        () => this.supabase.from('pessoas').upsert(pessoas, { onConflict: 'id' }),
        'Não foi possível enviar equipe ao Supabase.'
      );
    }
    if (movimentacoes.length) {
      await this._tryRemote(
        () => this.supabase.from('movimentacoes').upsert(movimentacoes, { onConflict: 'id' }),
        'Não foi possível enviar movimentações ao Supabase.'
      );
    }
  },

  // ---- PRODUTOS / MATERIAIS ----
  getProdutos() { return this._get(this.KEYS.produtos).map(p => this._cleanProduto(p)); },
  saveProduto(produto) {
    const lista = this.getProdutos();
    produto = this._cleanProduto(produto);
    produto.quantidade = Math.max(0, Number(produto.quantidade) || 0);
    produto.qtdMinima = Math.max(0, Number(produto.qtdMinima) || 0);
    produto.atualizadoEm = new Date().toISOString();
    if (produto.id) {
      const idx = lista.findIndex(p => p.id === produto.id);
      if (idx !== -1) lista[idx] = this._cleanProduto({ ...lista[idx], ...produto });
    } else {
      produto.id = this._uuid();
      produto.criadoEm = new Date().toISOString();
      lista.push(produto);
    }
    this._set(this.KEYS.produtos, lista);
    this._tryRemote(
      () => this.supabase.from('produtos').upsert(this._produtoToRow(produto), { onConflict: 'id' }),
      'Material salvo localmente, mas não enviado ao Supabase.'
    );
    return produto;
  },
  deleteProduto(id) {
    const lista = this.getProdutos().filter(p => p.id !== id);
    this._set(this.KEYS.produtos, lista);
    this._set(this.KEYS.movimentacoes, this.getMovimentacoes().map(m => m.produtoId === id ? { ...m, produtoRemovido: true } : m));
    this._tryRemote(
      () => this.supabase.from('produtos').delete().eq('id', id),
      'Material excluído localmente, mas não removido do Supabase.'
    );
  },
  getProduto(id) { return this.getProdutos().find(p => p.id === id); },

  // ---- PESSOAS ----
  getPessoas() { return this._get(this.KEYS.pessoas); },
  savePessoa(pessoa) {
    const lista = this.getPessoas();
    pessoa.tipo = pessoa.tipo === 'cliente' ? 'funcionario' : pessoa.tipo;
    pessoa.atualizadoEm = new Date().toISOString();
    if (pessoa.id) {
      const idx = lista.findIndex(p => p.id === pessoa.id);
      if (idx !== -1) lista[idx] = { ...lista[idx], ...pessoa };
    } else {
      pessoa.id = this._uuid();
      pessoa.criadoEm = new Date().toISOString();
      lista.push(pessoa);
    }
    this._set(this.KEYS.pessoas, lista);
    this._tryRemote(
      () => this.supabase.from('pessoas').upsert(this._pessoaToRow(pessoa), { onConflict: 'id' }),
      'Cadastro salvo localmente, mas não enviado ao Supabase.'
    );
    return pessoa;
  },
  deletePessoa(id) {
    const lista = this.getPessoas().filter(p => p.id !== id);
    this._set(this.KEYS.pessoas, lista);
    this._tryRemote(
      () => this.supabase.from('pessoas').delete().eq('id', id),
      'Cadastro excluído localmente, mas não removido do Supabase.'
    );
  },
  getPessoa(id) { return this.getPessoas().find(p => p.id === id); },

  // ---- MOVIMENTAÇÕES ----
  getMovimentacoes() { return this._get(this.KEYS.movimentacoes); },
  saveMovimentacao(mov) {
    const lista = this.getMovimentacoes();
    mov.id = this._uuid();
    mov.data = new Date().toISOString();
    mov.quantidade = Math.max(0, Number(mov.quantidade) || 0);
    lista.unshift(mov);
    this._set(this.KEYS.movimentacoes, lista);

    const prod = this.getProduto(mov.produtoId);
    if (prod) {
      if (mov.tipo === 'entrada') prod.quantidade += Number(mov.quantidade);
      else if (mov.tipo === 'saida') prod.quantidade = Math.max(0, prod.quantidade - Number(mov.quantidade));
      else if (mov.tipo === 'ajuste') prod.quantidade = Number(mov.quantidade);
      this.saveProduto(prod);
    }

    this._tryRemote(
      () => this.supabase.from('movimentacoes').upsert(this._movToRow(mov), { onConflict: 'id' }),
      'Movimentação salva localmente, mas não enviada ao Supabase.'
    );
    return mov;
  },

  // ---- CONFIG ----
  getConfig() {
    try {
      return JSON.parse(sessionStorage.getItem(this._storageKey(this.KEYS.config))) || {};
    } catch { return {}; }
  },
  setConfig(cfg) {
    this._set(this.KEYS.config, cfg);
  },

  exportData() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      produtos: this.getProdutos().map(p => this._cleanProduto(p)),
      pessoas: this.getPessoas(),
      movimentacoes: this.getMovimentacoes(),
      config: this.getConfig(),
    };
  },

  importData(payload) {
    if (!payload || !Array.isArray(payload.produtos) || !Array.isArray(payload.pessoas) || !Array.isArray(payload.movimentacoes)) {
      throw new Error('Backup inválido ou incompleto.');
    }
    this._set(this.KEYS.produtos, payload.produtos.map(p => this._cleanProduto(p)));
    this._set(this.KEYS.pessoas, payload.pessoas);
    this._set(this.KEYS.movimentacoes, payload.movimentacoes);
    this._set(this.KEYS.config, payload.config || {});
    this._migrateLocalIdsToUuid();
    this.syncToSupabase();
  }
};
