// ===================================================
//  DOCUMENTOS.JS — Gerenciamento de PDFs e Documentos
// ===================================================

const Documentos = {
  docs: [],
  filtroAtual: "geral",
  pdfJsLoaded: false,

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
          <button type="button" class="filtro-btn ${this.filtroAtual === "geral" ? "ativo" : ""}" data-doc-action="filter" data-filter="geral">
            Todos
          </button>
          <button type="button" class="filtro-btn ${this.filtroAtual === "manual" ? "ativo" : ""}" data-doc-action="filter" data-filter="manual">
            Manuais
          </button>
          <button type="button" class="filtro-btn ${this.filtroAtual === "especificacao" ? "ativo" : ""}" data-doc-action="filter" data-filter="especificacao">
            Especificações
          </button>
          <button type="button" class="filtro-btn ${this.filtroAtual === "certificado" ? "ativo" : ""}" data-doc-action="filter" data-filter="certificado">
            Certificados
          </button>
          <input type="text" id="busca-docs" placeholder="Buscar documentos..." class="search-input">
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
        this.filtrar(actionEl.dataset.filter || "geral", event);
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
    this.docs = DB.getDocumentos?.() || [];
    this.renderGrid();

    if (!DB.remoteReady || !DB.user) return;

    try {
      const { data, error } = await DB.supabase
        .from("documentos")
        .select("*")
        .eq("user_id", DB.user.id)
        .order("criado_em", { ascending: false });

      if (error) throw error;
      this.docs = (data || []).map((doc) => this.normalizarDocumento(doc));
      DB.setDocumentos?.(this.docs);
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
    this.filtroAtual = tipo;
    this.renderGrid();
    document.querySelectorAll(".filtro-btn").forEach((btn) => {
      btn.classList.remove("ativo");
    });
    event?.target?.classList.add("ativo");
  },

  buscar(termo) {
    if (!termo.trim()) {
      this.renderGrid();
      return;
    }

    const termoLower = termo.toLowerCase();
    const filtrados = this.docs.filter(
      (doc) =>
        doc.nome.toLowerCase().includes(termoLower) ||
        (doc.descricao && doc.descricao.toLowerCase().includes(termoLower)) ||
        (doc.tags &&
          doc.tags.some((t) => t.toLowerCase().includes(termoLower))),
    );

    this.renderGridFiltered(filtrados);
  },

  renderGrid() {
    let docs = this.docs;

    if (this.filtroAtual !== "geral") {
      docs = docs.filter((d) => d.tipo_documento === this.filtroAtual);
    }

    const grid = document.getElementById("docs-grid");
    if (!grid) return;
    if (!docs.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum documento encontrado</p>';
      return;
    }

    grid.innerHTML = docs.map((doc) => this.renderCard(doc)).join("");
  },

  renderGridFiltered(docs) {
    const grid = document.getElementById("docs-grid");
    if (!grid) return;
    if (!docs.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum documento encontrado</p>';
      return;
    }
    grid.innerHTML = docs.map((doc) => this.renderCard(doc)).join("");
  },

  renderCard(doc) {
    const data = new Date(doc.criado_em);
    const dataFormatada = data.toLocaleDateString("pt-BR");
    const docId = this.attr(doc.id);
    const docNome = this.attr(doc.nome);

    return `
      <div class="doc-card">
        <div class="doc-header">
          <div class="doc-tipo">${this.sanitize(doc.tipo_documento)}</div>
          <div class="doc-menu">
            <button type="button" class="btn-icon" data-doc-action="menu" data-doc-id="${docId}">⋮</button>
            <div class="dropdown-menu" id="menu-${docId}" style="display:none;">
              <button type="button" data-doc-action="visualizar" data-doc-id="${docId}">👁️ Visualizar</button>
              <button type="button" data-doc-action="descarregar" data-doc-id="${docId}" data-doc-name="${docNome}">⬇️ Descarregar</button>
              <button type="button" data-doc-action="editar" data-doc-id="${docId}">✏️ Editar</button>
              <button type="button" data-doc-action="deletar" data-doc-id="${docId}" style="color: #ff6b6b;">🗑️ Deletar</button>
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
              <option value="geral">Geral</option>
              <option value="manual">Manual</option>
              <option value="especificacao">Especificação</option>
              <option value="certificado">Certificado</option>
            </select>
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
    const tipo = document.getElementById("doc-tipo").value;
    const arquivo = document.getElementById("doc-arquivo").files[0];
    const tagsStr = document.getElementById("doc-tags").value;

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
      caminhoArquivo = `${DB.user.id}/${tipo}/${timestamp}_${this.slugArquivo(nome)}.pdf`;

      // Fazer upload para Supabase Storage
      const { error: uploadError } = await DB.supabase.storage
        .from("documentos")
        .upload(caminhoArquivo, arquivo, {
          cacheControl: "3600",
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Obter URL pública do arquivo
      const { data: urlData } = DB.supabase.storage
        .from("documentos")
        .getPublicUrl(caminhoArquivo);

      const arquivoUrl = urlData?.publicUrl;
      if (!arquivoUrl) {
        throw new Error("Não foi possível gerar a URL pública do arquivo.");
      }

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

    // Carregar e renderizar PDF
    await this.renderizarPDF(doc.arquivo_url);
  },

  paginaAtual: 1,
  pdfDocumento: null,
  fullscreenBound: false,
  pdfRenderTimer: null,
  pdfRenderTask: null,

  async renderizarPDF(url) {
    try {
      const response = await fetch(url);
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
      const response = await fetch(doc.arquivo_url);
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
              <option value="geral" ${doc.tipo_documento === "geral" ? "selected" : ""}>Geral</option>
              <option value="manual" ${doc.tipo_documento === "manual" ? "selected" : ""}>Manual</option>
              <option value="especificacao" ${doc.tipo_documento === "especificacao" ? "selected" : ""}>Especificação</option>
              <option value="certificado" ${doc.tipo_documento === "certificado" ? "selected" : ""}>Certificado</option>
            </select>
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
    const tipo = document.getElementById("edit-tipo").value;
    const tagsStr = document.getElementById("edit-tags").value;
    const novoArquivo = document.getElementById("edit-arquivo")?.files[0];

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
        novoCaminho = `${DB.user.id}/${tipo}/${timestamp}_${this.slugArquivo(nome)}.pdf`;

        const { error: uploadError } = await DB.supabase.storage
          .from("documentos")
          .upload(novoCaminho, novoArquivo, {
            cacheControl: "3600",
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = DB.supabase.storage
          .from("documentos")
          .getPublicUrl(novoCaminho);

        payload.arquivo_url = urlData?.publicUrl;
        payload.arquivo_caminho = novoCaminho;

        if (!payload.arquivo_url) {
          throw new Error("Não foi possível gerar a URL pública do arquivo.");
        }
      }

      const { data: docSalvo, error } = await DB.supabase
        .from("documentos")
        .update(payload)
        .eq("id", docAtual.id)
        .eq("user_id", DB.user.id)
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
        .eq("id", doc.id)
        .eq("user_id", DB.user.id);

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
      tipo_documento: doc.tipo_documento || "geral",
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
    this.renderGrid();
  },

  removerDocumentoLocal(docId) {
    this.docs = this.docs.filter((doc) => String(doc.id) !== String(docId));
    DB.deleteDocumentoCache?.(docId);
    this.renderGrid();
  },
};

window.Documentos = Documentos;
