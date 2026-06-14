// ===================================================
//  DOCUMENTOS.JS — Gerenciamento de PDFs e Documentos
// ===================================================

const Documentos = {
  docs: [],
  selecionados: new Set(),
  filtroAtual: "todos",
  buscaAtual: "",
  pdfJsLoaded: false,
  tipoManualValue: "__manual__",
  tiposBase: [
    { valor: "geral", rotulo: "Geral", filtro: "Geral" },
    { valor: "manual", rotulo: "Manual", filtro: "Manuais" },
    {
      valor: "especificacao",
      rotulo: "Especificação",
      filtro: "Especificações",
    },
    { valor: "certificado", rotulo: "Certificado", filtro: "Certificados" },
  ],

  async render() {
    if (!this.pdfJsLoaded) {
      await this.carregarBibliotecaPDF();
    }

    const html = `
      <div class="documentos-container">
        <div class="documentos-header">
          <h2>Documentos & PDFs</h2>
          <button type="button" class="btn btn-primary" data-doc-action="upload">
            📤 Upload de PDF
          </button>
        </div>

        <div class="documentos-filtros">
          <div class="documentos-filtro-botoes" id="docs-filter-buttons">
            ${this.renderBotoesFiltro()}
          </div>
          <input type="text" id="busca-docs" placeholder="Buscar documentos..." class="search-input">
        </div>

        <div class="documentos-lote-toolbar" id="docs-bulk-toolbar">
          <span id="docs-selection-count">0 selecionados</span>
          <button type="button" class="btn btn-sm btn-ghost" data-doc-action="select-visible">
            Selecionar visíveis
          </button>
          <button type="button" class="btn btn-sm btn-primary" data-doc-action="bulk-move" disabled>
            Mover selecionados
          </button>
          <button type="button" class="btn btn-sm btn-ghost" data-doc-action="clear-selection" disabled>
            Limpar seleção
          </button>
        </div>

        <div class="documentos-grid" id="docs-grid">
          <p class="empty-state">Carregando documentos...</p>
        </div>
      </div>
    `;

    document.getElementById("main-content").innerHTML = html;
    this.bindEventos();
    await this.listar();
  },

  bindEventos() {
    const container = document.querySelector(".documentos-container");
    if (!container || container.dataset.bound === "true") return;
    container.dataset.bound = "true";

    container.addEventListener("click", (event) => {
      const actionEl = event.target.closest("[data-doc-action]");
      if (!actionEl || !container.contains(actionEl)) return;

      const action = actionEl.dataset.docAction;
      const docId = actionEl.dataset.docId;

      if (action !== "filter") {
        event.preventDefault();
      }

      if (action === "upload") {
        this.abrirModalUpload();
      } else if (action === "filter") {
        this.filtrar(actionEl.dataset.filter || "todos", event);
      } else if (action === "menu") {
        this.abrirMenu(event, docId);
      } else if (action === "visualizar") {
        this.visualizar(docId);
      } else if (action === "descarregar") {
        this.descarregar(docId, actionEl.dataset.docName || "");
      } else if (action === "editar") {
        this.editarDoc(docId);
      } else if (action === "deletar") {
        this.deletar(docId);
      } else if (action === "select-visible") {
        this.selecionarVisiveis();
      } else if (action === "clear-selection") {
        this.limparSelecao();
      } else if (action === "bulk-move") {
        this.abrirModalMoverSelecionados();
      }
    });

    container.addEventListener("change", (event) => {
      if (event.target.matches("[data-doc-select]")) {
        this.alternarSelecao(
          event.target.dataset.docId,
          event.target.checked,
          event.target,
        );
      }
    });

    container.addEventListener("input", (event) => {
      if (event.target.id === "busca-docs") {
        this.buscar(event.target.value);
      }
    });
  },

  async carregarBibliotecaPDF() {
    // Carregar PDF.js do CDN
    if (!window.pdfjsLib) {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        this.pdfJsLoaded = true;
      };
      document.head.appendChild(script);

      // Aguardar carregamento
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (window.pdfjsLib) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }
  },

  async listar() {
    this.docs = (DB.getDocumentos?.() || []).map((doc) =>
      this.normalizarDocumento(doc),
    );
    this.sincronizarSelecao();
    this.atualizarFiltros();
    this.renderGrid();

    if (!DB.remoteReady || !DB.user) return;

    try {
      const { data, error } = await DB.supabase
        .from("documentos")
        .select("*")
        .order("criado_em", { ascending: false });

      if (error) throw error;
      this.docs = (data || []).map((doc) => this.normalizarDocumento(doc));
      DB.setDocumentos?.(this.docs);
      this.sincronizarSelecao();
      this.atualizarFiltros();
      this.renderGrid();
    } catch (error) {
      console.error("Erro ao listar documentos:", error);
      if (this.docs.length) {
        UI.toast("Mostrando documentos salvos localmente.", "info");
      } else {
        UI.toast("Erro ao carregar documentos", "error");
      }
    }
  },

  filtrar(tipo, event) {
    this.filtroAtual = tipo || "todos";
    this.renderGrid();
    this.atualizarFiltros();
  },

  buscar(termo) {
    this.buscaAtual = termo.trim().toLowerCase();
    this.renderGrid();
  },

  obterDocsVisiveis() {
    let docs = this.aplicarFiltroTipo(this.docs);

    if (!this.buscaAtual) return docs;

    docs = docs.filter(
      (doc) =>
        doc.nome.toLowerCase().includes(this.buscaAtual) ||
        (doc.descricao && doc.descricao.toLowerCase().includes(this.buscaAtual)) ||
        this.rotuloTipo(doc.tipo_documento).toLowerCase().includes(this.buscaAtual) ||
        (doc.tags &&
          doc.tags.some((t) => t.toLowerCase().includes(this.buscaAtual))),
    );

    return docs;
  },

  renderGrid() {
    const docs = this.obterDocsVisiveis();

    const grid = document.getElementById("docs-grid");
    if (!grid) return;
    if (!docs.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum documento encontrado</p>';
      this.atualizarAcoesLote();
      return;
    }

    grid.innerHTML = docs.map((doc) => this.renderCard(doc)).join("");
    this.atualizarAcoesLote();
  },

  renderGridFiltered(docs) {
    const grid = document.getElementById("docs-grid");
    if (!grid) return;
    if (!docs.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum documento encontrado</p>';
      this.atualizarAcoesLote();
      return;
    }
    grid.innerHTML = docs.map((doc) => this.renderCard(doc)).join("");
    this.atualizarAcoesLote();
  },

  renderCard(doc) {
    const data = new Date(doc.criado_em);
    const dataFormatada = data.toLocaleDateString("pt-BR");
    const docId = this.attr(doc.id);
    const docNome = this.attr(doc.nome);
    const selecionado = this.selecionados.has(String(doc.id));

    return `
      <div class="doc-card ${selecionado ? "doc-card-selected" : ""}">
        <div class="doc-header">
          <div class="doc-header-info">
            <label class="doc-select" title="Selecionar documento">
              <input type="checkbox" data-doc-select data-doc-id="${docId}" ${selecionado ? "checked" : ""}>
              <span>Selecionar</span>
            </label>
            <div class="doc-tipo">${this.sanitize(this.rotuloTipo(doc.tipo_documento))}</div>
          </div>
          <div class="doc-menu">
            <button type="button" class="btn-icon" data-doc-action="menu" data-doc-id="${docId}">⋮</button>
            <div class="dropdown-menu" id="menu-${docId}" style="display:none;">
              <button type="button" data-doc-action="visualizar" data-doc-id="${docId}">👁️ Visualizar</button>
              <button type="button" data-doc-action="descarregar" data-doc-id="${docId}" data-doc-name="${docNome}">⬇️ Descarregar</button>
              <button type="button" data-doc-action="editar" data-doc-id="${docId}">✏️ Editar</button>
              <button type="button" class="dropdown-danger" data-doc-action="deletar" data-doc-id="${docId}">🗑️ Deletar</button>
            </div>
          </div>
        </div>
        <h3 class="doc-nome">${this.sanitize(doc.nome)}</h3>
        <p class="doc-desc">${this.sanitize(doc.descricao || "Sem descrição")}</p>
        ${
          doc.tags && doc.tags.length > 0
            ? `
          <div class="doc-tags">
            ${doc.tags.map((tag) => `<span class="tag">${this.sanitize(tag)}</span>`).join("")}
          </div>
        `
            : ""
        }
        <div class="doc-footer">
          <small>${dataFormatada}</small>
          <div class="doc-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-doc-action="editar" data-doc-id="${docId}">Editar</button>
            <button type="button" class="btn btn-sm btn-primary" data-doc-action="visualizar" data-doc-id="${docId}">Abrir</button>
          </div>
        </div>
      </div>
    `;
  },

  abrirMenu(event, docId) {
    event.stopPropagation();
    const menu = document.getElementById(`menu-${docId}`);
    if (!menu) return;

    // Fechar outros menus
    document.querySelectorAll(".dropdown-menu").forEach((m) => {
      if (m !== menu) m.style.display = "none";
    });

    menu.style.display = menu.style.display === "none" ? "block" : "none";
  },

  abrirModalUpload() {
    const modal = `
      <div class="modal-upload">
        <h3>Upload de PDF</h3>
        <form id="form-upload">
          <div class="form-group">
            <label>Nome do Documento*</label>
            <input type="text" id="doc-nome" required class="form-input" placeholder="Ex: Manual de Operação">
          </div>

          <div class="form-group">
            <label>Descrição</label>
            <textarea id="doc-descricao" class="form-input" placeholder="Detalhes sobre o documento..." rows="3"></textarea>
          </div>

          <div class="form-group">
            <label>Tipo de Documento*</label>
            <select id="doc-tipo" required class="form-input">
              ${this.renderOpcoesTipo()}
              <option value="${this.tipoManualValue}">Outro tipo...</option>
            </select>
            <input type="text" id="doc-tipo-manual" class="form-input doc-tipo-manual" placeholder="Digite o tipo do documento" maxlength="60" hidden>
          </div>

          <div class="form-group">
            <label>Arquivo PDF*</label>
            <div class="file-input-wrapper">
              <input type="file" id="doc-arquivo" accept="application/pdf,.pdf" required class="file-input">
              <label for="doc-arquivo" class="file-input-label">
                <span id="file-name">Clique para selecionar um PDF</span>
              </label>
            </div>
            <small>Máximo: 50MB</small>
          </div>

          <div class="form-group">
            <label>Tags (separadas por vírgula)</label>
            <input type="text" id="doc-tags" class="form-input" placeholder="Ex: importante, operação, manutenção">
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn btn-ghost" data-doc-modal-cancel>Cancelar</button>
            <button type="submit" class="btn btn-primary">Enviar PDF</button>
          </div>
        </form>
      </div>
    `;

    UI.openModal("Upload de PDF", modal, false);
    document
      .getElementById("form-upload")
      ?.addEventListener("submit", (event) => this.enviarPDF(event));
    document
      .getElementById("doc-arquivo")
      ?.addEventListener("change", (event) => this.previewArquivo(event.target));
    this.bindTipoManual("doc-tipo", "doc-tipo-manual");
    document
      .querySelector("[data-doc-modal-cancel]")
      ?.addEventListener("click", () => UI.closeModal());
  },

  previewArquivo(input, targetId = "file-name") {
    const label = document.getElementById(targetId);
    if (!label) return;
    const fallback =
      targetId === "edit-file-name"
        ? "Manter PDF atual"
        : "Clique para selecionar um PDF";
    label.textContent = input.files[0]?.name || fallback;
  },

  async enviarPDF(event) {
    event.preventDefault();

    if (!DB.remoteReady || !DB.user?.id) {
      UI.toast("Faça login para enviar documentos ao Supabase.", "error");
      return;
    }

    const nome = document.getElementById("doc-nome").value.trim();
    const descricao = document.getElementById("doc-descricao").value.trim();
    const tipo = this.obterTipoFormulario("doc-tipo", "doc-tipo-manual");
    const arquivo = document.getElementById("doc-arquivo").files[0];
    const tagsStr = document.getElementById("doc-tags").value;

    if (!tipo) {
      UI.toast("Informe o tipo de documento.", "error");
      return;
    }

    if (!this.ehPDF(arquivo)) {
      UI.toast("Por favor, selecione um arquivo PDF válido", "error");
      return;
    }

    if (arquivo.size > 50 * 1024 * 1024) {
      UI.toast("Arquivo muito grande. Máximo: 50MB", "error");
      return;
    }

    const submitBtn = event.submitter || event.target.querySelector('button[type="submit"]');
    const loading = UI.toast("Enviando arquivo...", "loading");
    let caminhoArquivo = "";
    let metadadosSalvos = false;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando...";
    }

    try {
      // Gerar caminho único para o arquivo
      const timestamp = Date.now();
      // Pasta nomeada pela organizacao para que todos os membros acessem o arquivo.
      caminhoArquivo = `${DB.orgId}/${this.slugArquivo(tipo)}/${timestamp}_${this.slugArquivo(nome)}.pdf`;

      // Fazer upload para Supabase Storage
      const { error: uploadError } = await DB.supabase.storage
        .from("documentos")
        .upload(caminhoArquivo, arquivo, {
          cacheControl: "3600",
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const arquivoUrl = caminhoArquivo;

      // Salvar metadados no banco de dados
      const tags = tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t);

      const { data: docSalvo, error: dbError } = await DB.supabase
        .from("documentos")
        .insert([
          {
            nome,
            descricao,
            tipo_documento: tipo,
            arquivo_url: arquivoUrl,
            arquivo_caminho: caminhoArquivo,
            tags,
            user_id: DB.user.id,
            org_id: DB.orgId,
          },
        ])
        .select("*")
        .single();

      if (dbError) {
        await DB.supabase.storage.from("documentos").remove([caminhoArquivo]);
        throw dbError;
      }

      metadadosSalvos = true;
      this.salvarDocumentoLocal(
        docSalvo || {
          nome,
          descricao,
          tipo_documento: tipo,
          arquivo_url: arquivoUrl,
          arquivo_caminho: caminhoArquivo,
          tags,
          user_id: DB.user.id,
          org_id: DB.orgId,
        },
      );

      UI.closeModal();
      UI.closeToast(loading);
      UI.toast("PDF enviado com sucesso!", "success");
      await this.listar();
    } catch (error) {
      console.error("Erro ao enviar PDF:", error);
      if (caminhoArquivo && !metadadosSalvos) {
        await DB.supabase.storage.from("documentos").remove([caminhoArquivo]);
      }
      UI.closeToast(loading);
      UI.toast("Erro ao enviar PDF: " + this.mensagemErroUpload(error), "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar PDF";
      }
    }
  },

  ehPDF(arquivo) {
    if (!arquivo) return false;
    const tipo = String(arquivo.type || "").toLowerCase();
    const nome = String(arquivo.name || "").toLowerCase();
    return tipo === "application/pdf" || nome.endsWith(".pdf");
  },

  slugArquivo(nome) {
    const slug = String(nome || "documento")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return slug || "documento";
  },

  mensagemErroUpload(error) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("bucket not found")) {
      return "bucket 'documentos' não encontrado. Execute a migration de Storage no Supabase.";
    }
    return message || "falha ao salvar arquivo.";
  },

  async obterUrlDocumento(doc, expiresIn = 300) {
    const arquivoUrl = String(doc?.arquivo_url || "");
    const caminho = doc?.arquivo_caminho || (!/^https?:\/\//i.test(arquivoUrl) ? arquivoUrl : "");

    if (DB.remoteReady && DB.user && caminho) {
      try {
        const { data, error } = await DB.supabase.storage
          .from("documentos")
          .createSignedUrl(caminho, expiresIn);

        if (error) throw error;
        if (data?.signedUrl) return data.signedUrl;
      } catch (error) {
        console.warn("Não foi possível gerar URL assinada para o PDF.", error);
      }
    }

    if (DB.remoteReady && caminho) {
      const { data } = DB.supabase.storage
        .from("documentos")
        .getPublicUrl(caminho);

      if (data?.publicUrl) return data.publicUrl;
    }

    if (/^https?:\/\//i.test(arquivoUrl)) return arquivoUrl;
    throw new Error("Arquivo sem caminho no Storage.");
  },

  async visualizar(docId) {
    const doc = this.encontrarDocumento(docId);
    if (!doc) {
      UI.toast("Documento não encontrado para visualização.", "error");
      return;
    }

    const modal = `
      <div class="modal-visualizador">
        <div class="visualizador-header">
          <h3>${this.sanitize(doc.nome)}</h3>
          <div class="visualizador-header-actions">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-pdf-action="fullscreen"
              aria-label="Abrir PDF em tela cheia"
              title="Tela cheia"
            >
              ⛶ Tela cheia
            </button>
            <button type="button" class="btn-icon" data-doc-viewer-close>✕</button>
          </div>
        </div>
        <div id="pdf-viewer">
          <canvas id="pdf-canvas"></canvas>
        </div>
        <div class="visualizador-controls">
          <button type="button" class="btn btn-sm" data-pdf-action="prev">← Anterior</button>
          <span id="pagina-info">Página 1</span>
          <button type="button" class="btn btn-sm" data-pdf-action="next">Próxima →</button>
          <button type="button" class="btn btn-primary btn-sm" data-pdf-action="download">Descarregar</button>
        </div>
      </div>
    `;

    UI.openModal(`Visualizador - ${doc.nome}`, modal, false);
    this.bindEventosTelaCheia();
    document
      .querySelector("[data-doc-viewer-close]")
      ?.addEventListener("click", () => this.fecharVisualizador());
    document
      .querySelector('[data-pdf-action="prev"]')
      ?.addEventListener("click", () => this.paginaAnterior());
    document
      .querySelector('[data-pdf-action="next"]')
      ?.addEventListener("click", () => this.proximaPagina());
    document
      .querySelector('[data-pdf-action="fullscreen"]')
      ?.addEventListener("click", () => this.alternarTelaCheia());
    document
      .querySelector('[data-pdf-action="download"]')
      ?.addEventListener("click", () => this.descarregar(doc.id, doc.nome));

    try {
      const arquivoUrl = await this.obterUrlDocumento(doc);
      await this.renderizarPDF(arquivoUrl);
    } catch (error) {
      console.error("Erro ao gerar URL do PDF:", error);
      UI.toast("Erro ao carregar PDF", "error");
    }
  },

  paginaAtual: 1,
  pdfDocumento: null,
  fullscreenBound: false,
  pdfRenderTimer: null,
  pdfRenderTask: null,

  async renderizarPDF(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Falha ao carregar PDF.");
      const arrayBuffer = await response.arrayBuffer();
      this.pdfDocumento = await window.pdfjsLib.getDocument({
        data: arrayBuffer,
      }).promise;
      this.paginaAtual = 1;
      await this.renderPagina(1);
    } catch (error) {
      console.error("Erro ao renderizar PDF:", error);
      UI.toast("Erro ao carregar PDF", "error");
    }
  },

  async renderPagina(num) {
    if (!this.pdfDocumento) return;

    try {
      const pagina = await this.pdfDocumento.getPage(num);
      const canvas = document.getElementById("pdf-canvas");
      if (!canvas) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      const viewer = document.getElementById("pdf-viewer");
      const viewportBase = pagina.getViewport({ scale: 1 });
      const larguraDisponivel = Math.max(320, (viewer?.clientWidth || 900) - 32);
      const escala = Math.min(
        2.5,
        Math.max(0.9, larguraDisponivel / viewportBase.width),
      );

      const viewport = pagina.getViewport({ scale: escala });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      this.pdfRenderTask?.cancel();
      const renderTask = pagina.render({
        canvasContext: context,
        viewport: viewport,
      });
      this.pdfRenderTask = renderTask;
      await renderTask.promise;

      if (this.pdfRenderTask === renderTask) {
        this.pdfRenderTask = null;
      }

      const paginaInfo = document.getElementById("pagina-info");
      if (paginaInfo) {
        paginaInfo.textContent = `Página ${num} de ${this.pdfDocumento.numPages}`;
      }
      this.paginaAtual = num;
    } catch (error) {
      if (error?.name === "RenderingCancelledException") return;
      console.error("Erro ao renderizar página:", error);
    }
  },

  async proximaPagina() {
    if (this.pdfDocumento && this.paginaAtual < this.pdfDocumento.numPages) {
      await this.renderPagina(this.paginaAtual + 1);
    }
  },

  async paginaAnterior() {
    if (this.paginaAtual > 1) {
      await this.renderPagina(this.paginaAtual - 1);
    }
  },

  bindEventosTelaCheia() {
    if (this.fullscreenBound) return;

    document.addEventListener("fullscreenchange", () => {
      this.atualizarEstadoTelaCheia();
      this.agendarRenderizacaoPDF();
    });
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || !this.estaEmTelaCheia()) return;

        event.preventDefault();
        event.stopPropagation();
        this.sairTelaCheia(document.querySelector(".modal-visualizador")).then(
          () => {
            this.atualizarEstadoTelaCheia();
            this.agendarRenderizacaoPDF();
          },
        );
      },
      true,
    );
    window.addEventListener("resize", () => this.agendarRenderizacaoPDF());
    this.fullscreenBound = true;
  },

  async alternarTelaCheia() {
    const visualizador = document.querySelector(".modal-visualizador");
    if (!visualizador) return;

    if (this.estaEmTelaCheia()) {
      await this.sairTelaCheia(visualizador);
    } else {
      await this.entrarTelaCheia(visualizador);
    }

    this.atualizarEstadoTelaCheia();
    this.agendarRenderizacaoPDF();
  },

  async entrarTelaCheia(visualizador) {
    const requestFullscreen = visualizador.requestFullscreen;

    if (!requestFullscreen) {
      visualizador.classList.add("pdf-fullscreen-fallback");
      return;
    }

    try {
      await requestFullscreen.call(visualizador);
    } catch (error) {
      console.warn("Tela cheia indisponível, usando modo expandido:", error);
      visualizador.classList.add("pdf-fullscreen-fallback");
    }
  },

  async sairTelaCheia(visualizador) {
    visualizador?.classList.remove("pdf-fullscreen-fallback");

    if (!document.fullscreenElement || !document.exitFullscreen) return;

    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn("Erro ao sair da tela cheia:", error);
    }
  },

  estaEmTelaCheia() {
    const visualizador = document.querySelector(".modal-visualizador");
    return Boolean(
      visualizador &&
        (document.fullscreenElement === visualizador ||
          visualizador.classList.contains("pdf-fullscreen-fallback")),
    );
  },

  atualizarEstadoTelaCheia() {
    const visualizador = document.querySelector(".modal-visualizador");
    if (!visualizador) return;

    const botao = document.querySelector('[data-pdf-action="fullscreen"]');
    const ativo = this.estaEmTelaCheia();

    if (botao) {
      botao.textContent = ativo ? "↙ Sair" : "⛶ Tela cheia";
      botao.setAttribute(
        "aria-label",
        ativo ? "Sair da tela cheia" : "Abrir PDF em tela cheia",
      );
      botao.title = ativo ? "Sair da tela cheia" : "Tela cheia";
    }
  },

  agendarRenderizacaoPDF() {
    if (!this.pdfDocumento) return;

    clearTimeout(this.pdfRenderTimer);
    this.pdfRenderTimer = setTimeout(() => {
      this.renderPagina(this.paginaAtual);
    }, 120);
  },

  async fecharVisualizador() {
    clearTimeout(this.pdfRenderTimer);
    this.pdfRenderTask?.cancel();
    this.pdfRenderTask = null;
    await this.sairTelaCheia(document.querySelector(".modal-visualizador"));
    UI.closeModal();
  },

  async descarregar(docId, nome) {
    const doc = this.encontrarDocumento(docId);
    if (!doc) {
      UI.toast("Documento não encontrado para download.", "error");
      return;
    }

    try {
      const arquivoUrl = await this.obterUrlDocumento(doc);
      const response = await fetch(arquivoUrl);
      if (!response.ok) throw new Error("Falha ao baixar PDF.");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome + ".pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      UI.toast("Arquivo baixado com sucesso!", "success");
    } catch (error) {
      console.error("Erro ao descarregar:", error);
      UI.toast("Erro ao descarregar arquivo", "error");
    }
  },

  editarDoc(docId) {
    const doc = this.encontrarDocumento(docId);
    if (!doc) {
      UI.toast("Documento não encontrado para edição.", "error");
      return;
    }

    const modal = `
      <div class="modal-editar">
        <h3>Editar Documento</h3>
        <form id="form-editar">
          <div class="form-group">
            <label>Nome*</label>
            <input type="text" id="edit-nome" value="${this.sanitize(doc.nome)}" required class="form-input">
          </div>

          <div class="form-group">
            <label>Descrição</label>
            <textarea id="edit-descricao" class="form-input" rows="3">${this.sanitize(doc.descricao || "")}</textarea>
          </div>

          <div class="form-group">
            <label>Tipo</label>
            <select id="edit-tipo" class="form-input">
              ${this.renderOpcoesTipo(doc.tipo_documento)}
              <option value="${this.tipoManualValue}">Outro tipo...</option>
            </select>
            <input type="text" id="edit-tipo-manual" class="form-input doc-tipo-manual" placeholder="Digite o tipo do documento" maxlength="60" hidden>
          </div>

          <div class="form-group">
            <label>Tags (separadas por vírgula)</label>
            <input type="text" id="edit-tags" value="${this.sanitize((doc.tags || []).join(", "))}" class="form-input">
          </div>

          <div class="form-group">
            <label>Substituir PDF (opcional)</label>
            <div class="file-input-wrapper">
              <input type="file" id="edit-arquivo" accept="application/pdf,.pdf" class="file-input">
              <label for="edit-arquivo" class="file-input-label">
                <span id="edit-file-name">Manter PDF atual</span>
              </label>
            </div>
            <small>Selecione outro PDF apenas se quiser trocar o arquivo salvo.</small>
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn btn-ghost" data-doc-modal-cancel>Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      </div>
    `;

    UI.openModal("Editar Documento", modal, false);
    document
      .getElementById("form-editar")
      ?.addEventListener("submit", (event) => this.salvarEdicao(doc.id, event));
    document
      .getElementById("edit-arquivo")
      ?.addEventListener("change", (event) =>
        this.previewArquivo(event.target, "edit-file-name"),
      );
    this.bindTipoManual("edit-tipo", "edit-tipo-manual");
    document
      .querySelector("[data-doc-modal-cancel]")
      ?.addEventListener("click", () => UI.closeModal());
  },

  async salvarEdicao(docId, event) {
    event.preventDefault();

    if (!DB.remoteReady || !DB.user?.id) {
      UI.toast("Faça login para editar documentos.", "error");
      return;
    }

    const docAtual = this.encontrarDocumento(docId);
    if (!docAtual) {
      UI.toast("Documento não encontrado para edição.", "error");
      return;
    }

    const nome = document.getElementById("edit-nome").value.trim();
    const descricao = document.getElementById("edit-descricao").value.trim();
    const tipo = this.obterTipoFormulario("edit-tipo", "edit-tipo-manual");
    const tagsStr = document.getElementById("edit-tags").value;
    const novoArquivo = document.getElementById("edit-arquivo")?.files[0];

    if (!tipo) {
      UI.toast("Informe o tipo de documento.", "error");
      return;
    }

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    if (novoArquivo && !this.ehPDF(novoArquivo)) {
      UI.toast("Por favor, selecione um arquivo PDF válido", "error");
      return;
    }

    if (novoArquivo?.size > 50 * 1024 * 1024) {
      UI.toast("Arquivo muito grande. Máximo: 50MB", "error");
      return;
    }

    const submitBtn = event.submitter || event.target.querySelector('button[type="submit"]');
    const loading = UI.toast("Salvando documento...", "loading");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Salvando...";
    }

    let novoCaminho = "";
    let novoArquivoConfirmado = false;

    try {
      const payload = {
        nome,
        descricao,
        tipo_documento: tipo,
        tags,
      };

      if (novoArquivo) {
        const timestamp = Date.now();
        novoCaminho = `${DB.orgId}/${this.slugArquivo(tipo)}/${timestamp}_${this.slugArquivo(nome)}.pdf`;

        const { error: uploadError } = await DB.supabase.storage
          .from("documentos")
          .upload(novoCaminho, novoArquivo, {
            cacheControl: "3600",
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        payload.arquivo_url = novoCaminho;
        payload.arquivo_caminho = novoCaminho;
      }

      const { data: docSalvo, error } = await DB.supabase
        .from("documentos")
        .update(payload)
        .eq("id", docAtual.id)
        .select("*")
        .single();

      if (error) {
        if (novoCaminho) {
          await DB.supabase.storage.from("documentos").remove([novoCaminho]);
        }
        throw error;
      }

      novoArquivoConfirmado = true;

      if (novoCaminho && docAtual.arquivo_caminho) {
        const { error: removeError } = await DB.supabase.storage
          .from("documentos")
          .remove([docAtual.arquivo_caminho]);
        if (removeError) console.warn("PDF antigo não removido:", removeError);
      }

      this.salvarDocumentoLocal(docSalvo || { ...docAtual, ...payload });

      UI.closeModal();
      UI.closeToast(loading);
      UI.toast("Documento atualizado!", "success");
      await this.listar();
    } catch (error) {
      console.error("Erro ao atualizar:", error);
      if (novoCaminho && !novoArquivoConfirmado) {
        await DB.supabase.storage.from("documentos").remove([novoCaminho]);
      }
      UI.closeToast(loading);
      UI.toast("Erro ao atualizar documento: " + this.mensagemErroUpload(error), "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Salvar";
      }
    }
  },

  async deletar(docId) {
    if (
      !confirm(
        "Tem certeza que deseja deletar este documento? Esta ação é irreversível.",
      )
    )
      return;

    const doc = this.encontrarDocumento(docId);
    if (!doc) {
      UI.toast("Documento não encontrado para exclusão.", "error");
      return;
    }

    const loading = UI.toast("Deletando...", "loading");

    try {
      // Deletar arquivo do storage
      await DB.supabase.storage
        .from("documentos")
        .remove([doc.arquivo_caminho]);

      // Deletar registro do banco de dados
      const { error } = await DB.supabase
        .from("documentos")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      this.removerDocumentoLocal(doc.id);
      UI.closeToast(loading);
      UI.toast("Documento deletado!", "success");
      await this.listar();
    } catch (error) {
      console.error("Erro ao deletar:", error);
      UI.closeToast(loading);
      UI.toast("Erro ao deletar documento", "error");
    }
  },

  selecionarVisiveis() {
    const docs = this.obterDocsVisiveis();
    if (!docs.length) {
      UI.toast("Nenhum documento visível para selecionar.", "info");
      return;
    }

    docs.forEach((doc) => this.selecionados.add(String(doc.id)));
    this.renderGrid();
  },

  alternarSelecao(docId, selecionado, input) {
    if (!docId) return;

    if (selecionado) {
      this.selecionados.add(String(docId));
    } else {
      this.selecionados.delete(String(docId));
    }

    input?.closest(".doc-card")?.classList.toggle("doc-card-selected", selecionado);
    this.atualizarAcoesLote();
  },

  limparSelecao(renderizar = true) {
    this.selecionados.clear();
    if (renderizar) {
      this.renderGrid();
    } else {
      this.atualizarAcoesLote();
    }
  },

  sincronizarSelecao() {
    const ids = new Set(this.docs.map((doc) => String(doc.id)));
    Array.from(this.selecionados).forEach((id) => {
      if (!ids.has(id)) this.selecionados.delete(id);
    });
  },

  obterDocumentosSelecionados() {
    return this.docs.filter((doc) => this.selecionados.has(String(doc.id)));
  },

  atualizarAcoesLote() {
    const total = this.selecionados.size;
    const label = document.getElementById("docs-selection-count");
    const moverBtn = document.querySelector('[data-doc-action="bulk-move"]');
    const limparBtn = document.querySelector('[data-doc-action="clear-selection"]');
    const selecionarBtn = document.querySelector('[data-doc-action="select-visible"]');

    if (label) {
      label.textContent = `${total} selecionado${total === 1 ? "" : "s"}`;
    }
    if (moverBtn) moverBtn.disabled = total === 0;
    if (limparBtn) limparBtn.disabled = total === 0;
    if (selecionarBtn) selecionarBtn.disabled = this.obterDocsVisiveis().length === 0;
  },

  abrirModalMoverSelecionados() {
    const docs = this.obterDocumentosSelecionados();
    if (!docs.length) {
      UI.toast("Selecione ao menos um documento para mover.", "error");
      return;
    }

    const linhas = docs
      .map((doc, index) => {
        const docId = this.attr(doc.id);
        return `
          <div class="doc-bulk-row">
            <div class="doc-bulk-info">
              <strong>${this.sanitize(doc.nome)}</strong>
              <span>Atual: ${this.sanitize(this.rotuloTipo(doc.tipo_documento))}</span>
            </div>
            <div class="doc-bulk-type">
              <select class="form-input" data-doc-move-type data-doc-id="${docId}" data-move-index="${index}">
                ${this.renderOpcoesTipo(doc.tipo_documento)}
                <option value="${this.tipoManualValue}">Outro tipo...</option>
              </select>
              <input type="text" class="form-input doc-tipo-manual" data-doc-move-manual data-move-index="${index}" placeholder="Digite o tipo do documento" maxlength="60" hidden>
            </div>
          </div>
        `;
      })
      .join("");

    const modal = `
      <div class="modal-mover-docs">
        <h3>Mover documentos selecionados</h3>
        <form id="form-mover-docs">
          <div class="doc-bulk-apply">
            <div class="form-group">
              <label>Aplicar tipo em todos</label>
              <select id="bulk-tipo-todos" class="form-input">
                ${this.renderOpcoesTipo("", "Escolha um tipo")}
                <option value="${this.tipoManualValue}">Outro tipo...</option>
              </select>
              <input type="text" id="bulk-tipo-todos-manual" class="form-input doc-tipo-manual" placeholder="Digite o tipo do documento" maxlength="60" hidden>
            </div>
            <button type="button" class="btn btn-ghost" data-doc-bulk-apply-type>Aplicar em todos</button>
          </div>

          <div class="doc-bulk-list">
            ${linhas}
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn btn-ghost" data-doc-modal-cancel>Cancelar</button>
            <button type="submit" class="btn btn-primary">Mover documentos</button>
          </div>
        </form>
      </div>
    `;

    UI.openModal("Mover documentos", modal, false);
    this.bindModalMoverSelecionados();
  },

  bindModalMoverSelecionados() {
    this.bindTipoManual("bulk-tipo-todos", "bulk-tipo-todos-manual");

    document.querySelectorAll("[data-doc-move-type]").forEach((select) => {
      const input = document.querySelector(
        `[data-doc-move-manual][data-move-index="${select.dataset.moveIndex}"]`,
      );
      this.bindTipoManualElement(select, input);
    });

    document
      .querySelector("[data-doc-bulk-apply-type]")
      ?.addEventListener("click", () => this.aplicarTipoEmTodos());
    document
      .getElementById("form-mover-docs")
      ?.addEventListener("submit", (event) => this.moverDocumentosSelecionados(event));
    document
      .querySelector("[data-doc-modal-cancel]")
      ?.addEventListener("click", () => UI.closeModal());
  },

  aplicarTipoEmTodos() {
    const selectTodos = document.getElementById("bulk-tipo-todos");
    const inputTodos = document.getElementById("bulk-tipo-todos-manual");
    const tipo = this.obterTipoFormulario("bulk-tipo-todos", "bulk-tipo-todos-manual");

    if (!tipo) {
      UI.toast("Escolha ou informe um tipo para aplicar.", "error");
      (selectTodos?.value === this.tipoManualValue ? inputTodos : selectTodos)?.focus();
      return;
    }

    const usarManual = selectTodos?.value === this.tipoManualValue;
    document.querySelectorAll("[data-doc-move-type]").forEach((select) => {
      const input = document.querySelector(
        `[data-doc-move-manual][data-move-index="${select.dataset.moveIndex}"]`,
      );

      if (usarManual) {
        select.value = this.tipoManualValue;
        if (input) input.value = inputTodos?.value.trim() || "";
      } else {
        select.value = tipo;
        if (input) input.value = "";
      }

      this.atualizarCampoTipoManual(select, input, false);
    });
  },

  async moverDocumentosSelecionados(event) {
    event.preventDefault();

    if (!DB.remoteReady || !DB.user?.id) {
      UI.toast("Faça login para mover documentos.", "error");
      return;
    }

    const itens = [];
    for (const select of document.querySelectorAll("[data-doc-move-type]")) {
      const input = document.querySelector(
        `[data-doc-move-manual][data-move-index="${select.dataset.moveIndex}"]`,
      );
      const doc = this.encontrarDocumento(select.dataset.docId);
      const tipo = this.normalizarTipoDocumento(
        select.value === this.tipoManualValue ? input?.value : select.value,
      );

      if (!tipo) {
        UI.toast("Informe o tipo para todos os documentos selecionados.", "error");
        input?.focus();
        return;
      }
      if (doc) itens.push({ doc, tipo });
    }

    const alteracoes = itens.filter(
      ({ doc, tipo }) => this.chaveTipo(doc.tipo_documento) !== this.chaveTipo(tipo),
    );

    if (!alteracoes.length) {
      UI.toast("Nenhum documento precisa ser movido.", "info");
      return;
    }

    const submitBtn = event.submitter || event.target.querySelector('button[type="submit"]');
    const loading = UI.toast("Movendo documentos...", "loading");
    let movidos = 0;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Movendo...";
    }

    try {
      for (const { doc, tipo } of alteracoes) {
        const payload = {
          tipo_documento: tipo,
          atualizado_em: new Date().toISOString(),
        };
        const { data: docSalvo, error } = await DB.supabase
          .from("documentos")
          .update(payload)
          .eq("id", doc.id)
          .select("*")
          .single();

        if (error) throw error;
        movidos += 1;
        this.salvarDocumentoLocal(docSalvo || { ...doc, ...payload });
      }

      UI.closeModal();
      UI.closeToast(loading);
      this.limparSelecao(false);
      UI.toast(
        `${movidos} documento${movidos === 1 ? "" : "s"} movido${movidos === 1 ? "" : "s"} com sucesso!`,
        "success",
      );
      await this.listar();
    } catch (error) {
      console.error("Erro ao mover documentos:", error);
      UI.closeToast(loading);
      UI.toast("Erro ao mover documentos: " + (error?.message || "falha ao salvar tipos."), "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Mover documentos";
      }
    }
  },

  sanitize(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  jsArg(value) {
    return this.sanitize(JSON.stringify(String(value ?? "")));
  },

  attr(value) {
    return this.sanitize(String(value ?? ""));
  },

  renderBotoesFiltro() {
    const botaoTodos = `
      <button type="button" class="filtro-btn ${this.filtroAtual === "todos" ? "ativo" : ""}" data-doc-action="filter" data-filter="todos">
        Todos
      </button>
    `;

    return (
      botaoTodos +
      this.obterTiposDocumento()
        .map(
          (tipo) => `
            <button type="button" class="filtro-btn ${this.filtroEstaAtivo(tipo.valor) ? "ativo" : ""}" data-doc-action="filter" data-filter="${this.attr(tipo.valor)}">
              ${this.sanitize(tipo.filtro || tipo.rotulo)}
            </button>
          `,
        )
        .join("")
    );
  },

  atualizarFiltros() {
    const container = document.getElementById("docs-filter-buttons");
    if (container) {
      container.innerHTML = this.renderBotoesFiltro();
    }
  },

  filtroEstaAtivo(tipo) {
    return (
      this.filtroAtual !== "todos" &&
      this.chaveTipo(this.filtroAtual) === this.chaveTipo(tipo)
    );
  },

  aplicarFiltroTipo(docs) {
    if (this.filtroAtual === "todos") return docs;
    const filtroChave = this.chaveTipo(this.filtroAtual);
    return docs.filter(
      (doc) => this.chaveTipo(this.normalizarTipoDocumento(doc.tipo_documento)) === filtroChave,
    );
  },

  obterTiposDocumento(tipoExtra = "") {
    const tipos = new Map();
    const chavesUsadas = new Set();
    this.tiposBase.forEach((tipo) => tipos.set(tipo.valor, { ...tipo }));
    this.tiposBase.forEach((tipo) => chavesUsadas.add(this.chaveTipo(tipo.valor)));

    [...this.docs, { tipo_documento: tipoExtra }].forEach((doc) => {
      const valor = this.normalizarTipoDocumento(doc?.tipo_documento);
      const chave = this.chaveTipo(valor);
      if (!valor || chavesUsadas.has(chave)) return;
      chavesUsadas.add(chave);
      tipos.set(valor, {
        valor,
        rotulo: this.rotuloTipo(valor),
        filtro: this.rotuloTipo(valor),
      });
    });

    const baseValores = new Set(this.tiposBase.map((tipo) => tipo.valor));
    const base = [];
    const personalizados = [];

    tipos.forEach((tipo) => {
      if (baseValores.has(tipo.valor)) {
        base.push(tipo);
      } else {
        personalizados.push(tipo);
      }
    });

    personalizados.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
    return [...base, ...personalizados];
  },

  renderOpcoesTipo(tipoSelecionado = "geral", placeholder = "") {
    const selecionado =
      tipoSelecionado === ""
        ? ""
        : this.normalizarTipoDocumento(tipoSelecionado || "geral");
    const chaveSelecionada = this.chaveTipo(selecionado);
    const opcaoPlaceholder = placeholder
      ? `<option value="" ${!selecionado ? "selected" : ""}>${this.sanitize(placeholder)}</option>`
      : "";

    return (
      opcaoPlaceholder +
      this.obterTiposDocumento(selecionado)
        .map(
          (tipo) => `
            <option value="${this.attr(tipo.valor)}" ${chaveSelecionada && this.chaveTipo(tipo.valor) === chaveSelecionada ? "selected" : ""}>
              ${this.sanitize(tipo.rotulo)}
            </option>
          `,
        )
        .join("")
    );
  },

  bindTipoManual(selectId, inputId) {
    const select = document.getElementById(selectId);
    const input = document.getElementById(inputId);
    if (!select || !input) return;

    this.bindTipoManualElement(select, input);
  },

  bindTipoManualElement(select, input) {
    if (!select || !input) return;

    const atualizar = () => this.atualizarCampoTipoManual(select, input);

    select.addEventListener("change", atualizar);
    atualizar();
  },

  atualizarCampoTipoManual(select, input, focarManual = true) {
    if (!select || !input) return;

    const manual = select.value === this.tipoManualValue;
    input.hidden = !manual;
    input.required = manual;
    if (manual) {
      if (focarManual) input.focus();
    } else {
      input.value = "";
    }
  },

  obterTipoFormulario(selectId, inputId) {
    const select = document.getElementById(selectId);
    const input = document.getElementById(inputId);
    const valor =
      select?.value === this.tipoManualValue ? input?.value : select?.value;
    return this.normalizarTipoDocumento(valor);
  },

  normalizarTipoDocumento(tipo) {
    const valor = String(tipo || "")
      .replace(/[\\/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);

    if (!valor) return "";

    const chave = this.chaveTipo(valor);
    const tipoBase = this.tiposBase.find(
      (item) =>
        this.chaveTipo(item.valor) === chave ||
        this.chaveTipo(item.rotulo) === chave,
    );

    return tipoBase?.valor || valor;
  },

  chaveTipo(tipo) {
    return String(tipo || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  },

  rotuloTipo(tipo) {
    const valor = String(tipo || "").trim();
    if (!valor) return "Geral";

    const chave = this.chaveTipo(valor);
    const tipoBase = this.tiposBase.find(
      (item) =>
        this.chaveTipo(item.valor) === chave ||
        this.chaveTipo(item.rotulo) === chave,
    );
    if (tipoBase) return tipoBase.rotulo;

    const texto = valor.replace(/[_-]+/g, " ");
    if (texto !== texto.toLowerCase()) return texto;

    return texto.replace(/\b\w/g, (letra) => letra.toUpperCase());
  },

  encontrarDocumento(docId) {
    return this.docs.find((doc) => String(doc.id) === String(docId));
  },

  normalizarDocumento(doc) {
    return {
      id: doc.id,
      user_id: doc.user_id || DB.user?.id,
      nome: doc.nome || "",
      descricao: doc.descricao || "",
      arquivo_url: doc.arquivo_url || "",
      arquivo_caminho: doc.arquivo_caminho || "",
      tipo_documento: this.normalizarTipoDocumento(doc.tipo_documento) || "geral",
      produto_id: doc.produto_id || null,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      criado_em: doc.criado_em || new Date().toISOString(),
      atualizado_em: doc.atualizado_em || new Date().toISOString(),
    };
  },

  salvarDocumentoLocal(doc) {
    const normalizado = this.normalizarDocumento(doc);
    this.docs = [
      normalizado,
      ...this.docs.filter((item) => String(item.id) !== String(normalizado.id)),
    ].sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
    DB.saveDocumentoCache?.(normalizado);
    this.atualizarFiltros();
    this.renderGrid();
  },

  removerDocumentoLocal(docId) {
    this.docs = this.docs.filter((doc) => String(doc.id) !== String(docId));
    DB.deleteDocumentoCache?.(docId);
    if (
      this.filtroAtual !== "todos" &&
      !this.docs.some((doc) => this.filtroEstaAtivo(doc.tipo_documento))
    ) {
      this.filtroAtual = "todos";
    }
    this.atualizarFiltros();
    this.renderGrid();
  },
};

window.Documentos = Documentos;
