// ===================================================
//  STORAGE.JS - cache de sessão + sincronização Supabase
// ===================================================

const DB = {
  KEYS: {
    produtos: 'estoque_produtos',
    pessoas: 'estoque_pessoas',
    movimentacoes: 'estoque_movimentacoes',
    documentos: 'estoque_documentos',
    tarefas: 'estoque_tarefas',
    config: 'estoque_config',
  },

  supabase: null,
  remoteReady: false,
  remoteError: '',
  user: null,
  orgId: null,
  orgNome: '',
  orgPapel: '',

  async init() {
    this._initSupabase();
  },

  setUser(user) {
    this.user = user || null;
    this._migrateLocalIdsToUuid();
  },

  clearUser() {
    this.user = null;
    this.orgId = null;
    this.orgNome = '';
    this.orgPapel = '';
  },

  // Garante que o usuario pertenca a uma organizacao e carrega
  // org_id/nome/papel atuais. Deve rodar logo apos o login, antes
  // de qualquer sincronizacao, pois todo registro e carimbado com org_id.
  async ensureOrg() {
    if (!this.remoteReady || !this.user) return null;

    const orgId = await this._tryRemote(
      () => this.supabase.rpc('garantir_organizacao'),
      'Nao foi possivel carregar a organizacao.'
    );
    if (!orgId) return null;

    this.orgId = orgId;

    const membro = await this._tryRemote(
      () => this.supabase
        .from('organizacao_membros')
        .select('papel, organizacoes(nome)')
        .eq('org_id', orgId)
        .eq('user_id', this.user.id)
        .maybeSingle(),
      'Nao foi possivel carregar os dados da organizacao.'
    );
    if (membro) {
      this.orgPapel = membro.papel || '';
      this.orgNome = membro.organizacoes?.nome || '';
    }
    return this.orgId;
  },

  isOrgAdmin() {
    return this.orgPapel === 'admin';
  },

  async getMembros() {
    if (!this.orgId) return [];
    const membros = await this._tryRemote(
      () => this.supabase.rpc('listar_membros', { p_org_id: this.orgId }),
      'Nao foi possivel listar os membros.'
    );
    return Array.isArray(membros) ? membros : [];
  },

  adicionarMembro(email, papel = 'membro') {
    return this._tryRemote(
      () => this.supabase.rpc('adicionar_membro', {
        p_org_id: this.orgId,
        p_email: email,
        p_papel: papel,
      }),
      'Nao foi possivel adicionar o membro.'
    );
  },

  removerMembro(userId) {
    return this._tryRemote(
      () => this.supabase.rpc('remover_membro', {
        p_org_id: this.orgId,
        p_user_id: userId,
      }),
      'Nao foi possivel remover o membro.'
    );
  },

  clearLocalData() {
    this._remove(this.KEYS.produtos);
    this._remove(this.KEYS.pessoas);
    this._remove(this.KEYS.movimentacoes);
    this._remove(this.KEYS.documentos);
    this._remove(this.KEYS.tarefas);
    this._remove(this.KEYS.config);
  },

  _initSupabase() {
    const cfg = window.SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.anonKey || cfg.url.includes('seu-project-ref') || cfg.anonKey.includes('sua-chave')) {
      this.remoteError = 'Supabase não está configurado. Configure URL e chave anon public antes de usar o sistema.';
      console.warn(this.remoteError);
      return;
    }
    if (!window.supabase?.createClient) {
      this.remoteError = 'Biblioteca do Supabase não carregou. Verifique a conexão com o CDN no deploy.';
      console.warn(this.remoteError);
      return;
    }

    this.supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
    this.remoteReady = true;
    this.remoteError = '';
  },

  _get(key) {
    const storageKey = this._storageKey(key);
    try {
      let raw = null;
      try {
        raw = localStorage.getItem(storageKey);
      } catch {}
      if (raw === null) {
        raw = sessionStorage.getItem(storageKey);
        if (raw !== null) {
          try {
            localStorage.setItem(storageKey, raw);
          } catch {}
        }
      }
      return JSON.parse(raw) || [];
    } catch {
      return [];
    }
  },

  _set(key, value) {
    const storageKey = this._storageKey(key);
    const payload = JSON.stringify(value);
    try {
      localStorage.setItem(storageKey, payload);
    } catch {
      sessionStorage.setItem(storageKey, payload);
    }
  },

  _remove(key) {
    const storageKey = this._storageKey(key);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
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
      org_id: this.orgId,
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
      tipo: this._normalizePessoaTipo(pessoa.tipo),
      telefone: pessoa.telefone || null,
      email: pessoa.email || null,
      endereco: pessoa.endereco || null,
      obs: pessoa.obs || null,
      criado_em: pessoa.criadoEm || new Date().toISOString(),
      atualizado_em: pessoa.atualizadoEm || new Date().toISOString(),
      user_id: this.user?.id,
      org_id: this.orgId,
    };
  },

  _rowToPessoa(row) {
    return {
      id: row.id,
      nome: row.nome,
      documento: row.documento || '',
      tipo: this._normalizePessoaTipo(row.tipo),
      telefone: row.telefone || '',
      email: row.email || '',
      endereco: row.endereco || '',
      obs: row.obs || '',
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
    };
  },

  _normalizePessoaTipo(tipo) {
    if (tipo === 'cliente') return 'funcionario';
    if (['funcionario', 'fornecedor', 'ambos'].includes(tipo)) return tipo;
    return 'funcionario';
  },

  _mergeById(locais, remotos) {
    const merged = new Map();
    const getTime = (item) => new Date(item?.atualizadoEm || item?.criadoEm || 0).getTime() || 0;

    (locais || []).forEach(item => {
      if (item?.id) merged.set(item.id, item);
    });

    (remotos || []).forEach(item => {
      if (!item?.id) return;
      const atual = merged.get(item.id);
      if (!atual || getTime(item) >= getTime(atual)) {
        merged.set(item.id, item);
      }
    });

    return Array.from(merged.values());
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
      org_id: this.orgId,
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

  _documentoToRow(doc) {
    return {
      id: doc.id,
      user_id: this.user?.id,
      org_id: this.orgId,
      nome: doc.nome,
      descricao: doc.descricao || null,
      arquivo_url: doc.arquivo_url,
      arquivo_caminho: doc.arquivo_caminho,
      tipo_documento: doc.tipo_documento || 'geral',
      produto_id: doc.produto_id || null,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      criado_em: doc.criado_em || new Date().toISOString(),
      atualizado_em: doc.atualizado_em || new Date().toISOString(),
    };
  },

  _rowToDocumento(row) {
    return {
      id: row.id,
      user_id: row.user_id,
      nome: row.nome,
      descricao: row.descricao || '',
      arquivo_url: row.arquivo_url,
      arquivo_caminho: row.arquivo_caminho,
      tipo_documento: row.tipo_documento || 'geral',
      produto_id: row.produto_id || null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
    };
  },

  _tarefaToRow(tarefa) {
    return {
      id: tarefa.id,
      user_id: this.user?.id,
      org_id: this.orgId,
      titulo: tarefa.titulo,
      descricao: tarefa.descricao || null,
      tipo: ['tarefa', 'evento', 'lembrete'].includes(tarefa.tipo) ? tarefa.tipo : 'tarefa',
      prioridade: ['baixa', 'media', 'alta'].includes(tarefa.prioridade) ? tarefa.prioridade : 'media',
      data: tarefa.data || null,
      concluida: !!tarefa.concluida,
      concluida_em: tarefa.concluidaEm || null,
      criado_em: tarefa.criadoEm || new Date().toISOString(),
      atualizado_em: tarefa.atualizadoEm || new Date().toISOString(),
    };
  },

  _rowToTarefa(row) {
    return {
      id: row.id,
      titulo: row.titulo,
      descricao: row.descricao || '',
      tipo: row.tipo || 'tarefa',
      prioridade: row.prioridade || 'media',
      data: row.data || null,
      concluida: !!row.concluida,
      concluidaEm: row.concluida_em || null,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
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
    const documentos = await this._tryRemote(
      () => this.supabase.from('documentos').select('*').order('criado_em', { ascending: false }),
      'Não foi possível buscar documentos do Supabase.'
    );
    const tarefas = await this._tryRemote(
      () => this.supabase.from('tarefas').select('*').order('data', { ascending: true }),
      'Não foi possível buscar a agenda do Supabase.'
    );

    if (Array.isArray(produtos)) {
      const remotos = produtos.map(row => this._rowToProduto(row));
      this._set(this.KEYS.produtos, this._mergeById(this.getProdutos(), remotos).map(p => this._cleanProduto(p)));
    }
    if (Array.isArray(pessoas)) {
      const remotas = pessoas.map(row => this._rowToPessoa(row));
      this._set(this.KEYS.pessoas, this._mergeById(this.getPessoas(), remotas));
    }
    if (Array.isArray(movimentacoes)) {
      const remotas = movimentacoes.map(row => this._rowToMov(row));
      const mescladas = this._mergeById(this.getMovimentacoes(), remotas);
      mescladas.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
      this._set(this.KEYS.movimentacoes, mescladas);
    }
    if (Array.isArray(documentos)) {
      this.setDocumentos(documentos.map(row => this._rowToDocumento(row)));
    }
    if (Array.isArray(tarefas)) {
      const remotas = tarefas.map(row => this._rowToTarefa(row));
      this._set(this.KEYS.tarefas, this._mergeById(this.getTarefas(), remotas));
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

    const tarefas = this.getTarefas().map(t => this._tarefaToRow(t));
    if (tarefas.length) {
      await this._tryRemote(
        () => this.supabase.from('tarefas').upsert(tarefas, { onConflict: 'id' }),
        'Não foi possível enviar a agenda ao Supabase.'
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
    pessoa.tipo = this._normalizePessoaTipo(pessoa.tipo);
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

  // ---- TAREFAS / AGENDA ----
  getTarefas() { return this._get(this.KEYS.tarefas); },
  getTarefa(id) { return this.getTarefas().find(t => t.id === id); },
  saveTarefa(tarefa) {
    const lista = this.getTarefas();
    tarefa.atualizadoEm = new Date().toISOString();
    if (tarefa.id) {
      const idx = lista.findIndex(t => t.id === tarefa.id);
      if (idx !== -1) lista[idx] = { ...lista[idx], ...tarefa };
    } else {
      tarefa.id = this._uuid();
      tarefa.criadoEm = new Date().toISOString();
      lista.push(tarefa);
    }
    this._set(this.KEYS.tarefas, lista);
    this._tryRemote(
      () => this.supabase.from('tarefas').upsert(this._tarefaToRow(tarefa), { onConflict: 'id' }),
      'Tarefa salva localmente, mas não enviada ao Supabase.'
    );
    return tarefa;
  },
  deleteTarefa(id) {
    this._set(this.KEYS.tarefas, this.getTarefas().filter(t => t.id !== id));
    this._tryRemote(
      () => this.supabase.from('tarefas').delete().eq('id', id),
      'Tarefa excluída localmente, mas não removida do Supabase.'
    );
  },

  // ---- DOCUMENTOS ----
  getDocumentos() {
    return this._get(this.KEYS.documentos);
  },

  setDocumentos(documentos) {
    const lista = Array.isArray(documentos) ? documentos.map(doc => this._rowToDocumento(doc)) : [];
    lista.sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
    this._set(this.KEYS.documentos, lista);
  },

  saveDocumentoCache(documento) {
    if (!documento?.id) return documento;
    const doc = this._rowToDocumento(documento);
    const lista = this.getDocumentos().filter(item => item.id !== doc.id);
    lista.unshift(doc);
    this.setDocumentos(lista);
    return doc;
  },

  deleteDocumentoCache(id) {
    this.setDocumentos(this.getDocumentos().filter(doc => doc.id !== id));
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
      tarefas: this.getTarefas(),
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
    if (Array.isArray(payload.tarefas)) this._set(this.KEYS.tarefas, payload.tarefas);
    this._set(this.KEYS.config, payload.config || {});
    this._migrateLocalIdsToUuid();
    this.syncToSupabase();
  }
};
