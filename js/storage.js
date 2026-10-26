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
  inventoryLoaded: false,

  async init() {
    this._initSupabase();
  },

  setUser(user) {
    this.user = user || null;
    this.inventoryLoaded = false;
    this._migrateLocalIdsToUuid();
  },

  clearUser() {
    this.user = null;
    this.inventoryLoaded = false;
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
      qtd_minima: Number(p.qtdMinima || 0),
      localizacao: p.localizacao || null,
      descricao: p.descricao || null,
      criado_em: p.criadoEm || new Date().toISOString(),
      atualizado_em: p.atualizadoEm || new Date().toISOString(),
      excluido_em: p.excluidoEm || null,
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
      custoMedio: Inventario.custo(row.custo_medio),
      qtdMinima: Number(row.qtd_minima || 0),
      localizacao: row.localizacao || '',
      descricao: row.descricao || '',
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
      excluidoEm: row.excluido_em || null,
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
      excluido_em: pessoa.excluidoEm || null,
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
      excluidoEm: row.excluido_em || null,
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
      custoUnitario: Inventario.custo(row.custo_unitario),
      custoTotal: Inventario.custo(row.custo_total),
      setor: row.setor || '',
      documentoReferencia: row.documento_referencia || '',
      fornecedorId: row.fornecedor_id || null,
      operacaoId: row.operacao_id || null,
      produtoSnapshot: row.produto_snapshot || {},
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
      excluido_em: tarefa.excluidoEm || null,
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
      excluidoEm: row.excluido_em || null,
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

  async _readInventoryTable(table, orgId = this.orgId) {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await this.supabase.from(table).select('*')
        .eq('org_id', orgId).order('id').range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Resposta de estoque inválida.');
      rows.push(...data);
      if (data.length < pageSize) return rows;
    }
  },

  async refreshInventory() {
    this.inventoryLoaded = false;
    if (!this.remoteReady || !this.user || !this.orgId) return false;
    const orgId = this.orgId;
    const userId = this.user.id;
    const data = await this._tryRemote(async () => {
      const [produtos, movimentacoes] = await Promise.all([
        this._readInventoryTable('produtos', orgId), this._readInventoryTable('movimentacoes', orgId),
      ]);
      return { data: { produtos, movimentacoes } };
    }, 'Não foi possível atualizar o estoque. Tente novamente antes de emitir o balanço.');
    if (!data || this.orgId !== orgId || this.user?.id !== userId) return false;
    this._set(this.KEYS.produtos, data.produtos.map(row => this._rowToProduto(row)));
    const movs = data.movimentacoes.map(row => this._rowToMov(row));
    movs.sort((a, b) => new Date(b.data) - new Date(a.data));
    this._set(this.KEYS.movimentacoes, movs);
    this.inventoryLoaded = true;
    return true;
  },

  async syncFromSupabase() {
    if (!this.remoteReady || !this.user) return;
    await this.refreshInventory();
    const pessoas = await this._tryRemote(
      () => this.supabase.from('pessoas').select('*').eq('org_id', this.orgId).order('nome'),
      'Não foi possível buscar equipe do Supabase.'
    );
    const documentos = await this._tryRemote(
      () => this.supabase.from('documentos').select('*').order('criado_em', { ascending: false }),
      'Não foi possível buscar documentos do Supabase.'
    );
    const tarefas = await this._tryRemote(
      () => this.supabase.from('tarefas').select('*').order('data', { ascending: true }),
      'Não foi possível buscar a agenda do Supabase.'
    );

    // O merge usa a lista CRUA (this._get), nao os getters filtrados, para
    // preservar as "lapides" (registros com excluido_em) e propagar exclusoes.
    if (Array.isArray(pessoas)) {
      const remotas = pessoas.map(row => this._rowToPessoa(row));
      this._set(this.KEYS.pessoas, this._mergeById(this._get(this.KEYS.pessoas), remotas));
    }
    if (Array.isArray(documentos)) {
      this.setDocumentos(documentos.map(row => this._rowToDocumento(row)));
    }
    if (Array.isArray(tarefas)) {
      const remotas = tarefas.map(row => this._rowToTarefa(row));
      this._set(this.KEYS.tarefas, this._mergeById(this._get(this.KEYS.tarefas), remotas));
    }
  },

  async syncToSupabase() {
    if (!this.remoteReady || !this.user) return;

    // Envia a lista CRUA para que as exclusoes (excluido_em) tambem propaguem.
    // Estoque e histórico são autoritativos no servidor: nunca reenviar o cache.
    const pessoas = this._get(this.KEYS.pessoas).map(p => this._pessoaToRow(p));

    if (pessoas.length) {
      await this._tryRemote(
        () => this.supabase.from('pessoas').upsert(pessoas, { onConflict: 'id' }),
        'Não foi possível enviar equipe ao Supabase.'
      );
    }
    const tarefas = this._get(this.KEYS.tarefas).map(t => this._tarefaToRow(t));
    if (tarefas.length) {
      await this._tryRemote(
        () => this.supabase.from('tarefas').upsert(tarefas, { onConflict: 'id' }),
        'Não foi possível enviar a agenda ao Supabase.'
      );
    }
  },

  // ---- PRODUTOS / MATERIAIS ----
  // Getter publico ignora registros excluidos (soft-delete).
  getProdutos() { return this._get(this.KEYS.produtos).map(p => this._cleanProduto(p)).filter(p => !p.excluidoEm); },
  async saveProduto(produto) {
    if (!this.remoteReady || !this.user || !this.orgId) {
      App.showToast('Conecte-se para salvar materiais.', 'error');
      return null;
    }
    const userId = this.user.id;
    const orgId = this.orgId;
    const row = this._produtoToRow({ ...produto, id: produto.id || this._uuid() });
    const data = await this._tryRemote(() => {
      if (produto.id) {
        const { id, user_id, org_id, criado_em, excluido_em, ...metadata } = row;
        return this.supabase.from('produtos').update(metadata).eq('id', id)
          .eq('org_id', this.orgId).is('excluido_em', null).select('*').single();
      }
      const { excluido_em, ...novo } = row;
      return this.supabase.from('produtos').insert(novo).select('*').single();
    }, 'Não foi possível salvar o material.');
    if (!data || this.user?.id !== userId || this.orgId !== orgId) return null;
    const salvo = this._rowToProduto(data);
    const lista = this._get(this.KEYS.produtos).filter(p => p.id !== salvo.id);
    this._set(this.KEYS.produtos, [...lista, salvo]);
    return salvo;
  },
  async deleteProduto(id) {
    const data = await this._tryRemote(() => this.supabase.from('produtos')
      .update({ excluido_em: new Date().toISOString() }).eq('id', id)
      .eq('org_id', this.orgId).select('*').single(), 'Não foi possível excluir o material.');
    if (!data) return false;
    const lista = this._get(this.KEYS.produtos).filter(p => p.id !== id);
    this._set(this.KEYS.produtos, [...lista, this._rowToProduto(data)]);
    return true;
  },
  getProduto(id) { return this.getProdutos().find(p => p.id === id); },

  // ---- PESSOAS ----
  getPessoas() { return this._get(this.KEYS.pessoas).filter(p => !p.excluidoEm); },
  savePessoa(pessoa) {
    const lista = this._get(this.KEYS.pessoas);
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
    const lista = this._get(this.KEYS.pessoas);
    const idx = lista.findIndex(p => p.id === id);
    if (idx === -1) return;
    const agora = new Date().toISOString();
    lista[idx] = { ...lista[idx], excluidoEm: agora, atualizadoEm: agora };
    this._set(this.KEYS.pessoas, lista);
    this._tryRemote(
      () => this.supabase.from('pessoas').update({ excluido_em: agora, atualizado_em: agora }).eq('id', id),
      'Cadastro excluído localmente, mas não removido do Supabase.'
    );
  },
  getPessoa(id) { return this.getPessoas().find(p => p.id === id); },

  // ---- MOVIMENTAÇÕES ----
  getMovimentacoes() { return this._get(this.KEYS.movimentacoes); },

  // Custos e saldos somente são confirmados após a transação no servidor.
  async saveMovimentacao(mov) {
    if (!this.remoteReady || !this.user || !this.orgId) {
      App.showToast('Conecte-se para registrar movimentações. Nenhum saldo foi alterado.', 'error');
      return null;
    }
    if (mov.custoUnitario != null && (Inventario.custo(mov.custoUnitario) === null || Number(mov.custoUnitario) < 0)) {
      App.showToast('Custo unitário inválido.', 'error');
      return null;
    }
    const userId = this.user.id;
    const orgId = this.orgId;
    const data = await this._tryRemote(() => this.supabase.rpc('registrar_movimentacao_custeada', {
      p_produto_id: mov.produtoId,
      p_tipo: mov.tipo,
      p_quantidade: Number(mov.quantidade),
      p_motivo: mov.motivo || null,
      p_responsavel: mov.funcionario || mov.responsavel || null,
      p_pessoa_id: mov.pessoaId || null,
      p_custo_unitario: mov.tipo === 'entrada' ? Inventario.custo(mov.custoUnitario) : null,
      p_setor: mov.setor || null,
      p_documento_referencia: mov.documentoReferencia || null,
      p_fornecedor_id: mov.tipo === 'entrada' ? mov.fornecedorId || null : null,
      p_operacao_id: mov.operacaoId || this._uuid(),
    }), 'Não foi possível confirmar a movimentação. Verifique a conexão e a migração de custos.');
    if (!data || this.user?.id !== userId || this.orgId !== orgId) return null;
    const salvo = this._rowToMov(Array.isArray(data) ? data[0] : data);
    // Uma repetição da mesma operação não duplica o histórico local.
    this._set(this.KEYS.movimentacoes, [salvo, ...this.getMovimentacoes().filter(m => m.id !== salvo.id)]);
    await this.refreshInventory();
    return salvo;
  },

  // ---- TAREFAS / AGENDA ----
  getTarefas() { return this._get(this.KEYS.tarefas).filter(t => !t.excluidoEm); },
  getTarefa(id) { return this.getTarefas().find(t => t.id === id); },
  saveTarefa(tarefa) {
    const lista = this._get(this.KEYS.tarefas);
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
    const lista = this._get(this.KEYS.tarefas);
    const idx = lista.findIndex(t => t.id === id);
    if (idx === -1) return;
    const agora = new Date().toISOString();
    lista[idx] = { ...lista[idx], excluidoEm: agora, atualizadoEm: agora };
    this._set(this.KEYS.tarefas, lista);
    this._tryRemote(
      () => this.supabase.from('tarefas').update({ excluido_em: agora, atualizado_em: agora }).eq('id', id),
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
      version: 2,
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
    throw new Error('A restauração de estoque exige importação validada no servidor. O backup não foi aplicado; nenhum saldo foi alterado.');
  }
};
