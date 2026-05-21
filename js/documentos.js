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
          <button class="btn btn-primary" onclick="Documentos.abrirModalUpload()">
            📤 Upload de PDF
          </button>
        </div>

        <div class="documentos-filtros">
          <button class="filtro-btn ${this.filtroAtual === "geral" ? "ativo" : ""}" onclick="Documentos.filtrar('geral')">
            Todos
          </button>
          <button class="filtro-btn ${this.filtroAtual === "manual" ? "ativo" : ""}" onclick="Documentos.filtrar('manual')">
            Manuais
          </button>
          <button class="filtro-btn ${this.filtroAtual === "especificacao" ? "ativo" : ""}" onclick="Documentos.filtrar('especificacao')">
            Especificações
          </button>
          <button class="filtro-btn ${this.filtroAtual === "certificado" ? "ativo" : ""}" onclick="Documentos.filtrar('certificado')">
            Certificados
          </button>
          <input type="text" id="busca-docs" placeholder="Buscar documentos..." onkeyup="Documentos.buscar(this.value)" class="search-input">
        </div>

        <div class="documentos-grid" id="docs-grid">
          <p class="empty-state">Carregando documentos...</p>
        </div>
      </div>
    `;

    document.getElementById("main-content").innerHTML = html;
    await this.listar();
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
    if (!DB.remoteReady || !DB.user) return;

    try {
      const { data, error } = await DB.supabase
        .from("documentos")
        .select("*")
        .eq("user_id", DB.user.id)
        .order("criado_em", { ascending: false });

      if (error) throw error;
      this.docs = data || [];
      this.renderGrid();
    } catch (error) {
      console.error("Erro ao listar documentos:", error);
      UI.toast("Erro ao carregar documentos", "error");
    }
  },

  filtrar(tipo) {
    this.filtroAtual = tipo;
    this.renderGrid();
    document.querySelectorAll(".filtro-btn").forEach((btn) => {
      btn.classList.remove("ativo");
    });
    event.target.classList.add("ativo");
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
    if (!docs.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum documento encontrado</p>';
      return;
    }

    grid.innerHTML = docs.map((doc) => this.renderCard(doc)).join("");
  },

  renderGridFiltered(docs) {
    const grid = document.getElementById("docs-grid");
    if (!docs.length) {
      grid.innerHTML = '<p class="empty-state">Nenhum documento encontrado</p>';
      return;
    }
    grid.innerHTML = docs.map((doc) => this.renderCard(doc)).join("");
  },

  renderCard(doc) {
    const data = new Date(doc.criado_em);
    const dataFormatada = data.toLocaleDateString("pt-BR");

    return `
      <div class="doc-card">
        <div class="doc-header">
          <div class="doc-tipo">${doc.tipo_documento}</div>
          <div class="doc-menu">
            <button class="btn-icon" onclick="Documentos.abrirMenu(event, '${doc.id}')">⋮</button>
            <div class="dropdown-menu" id="menu-${doc.id}" style="display:none;">
              <button onclick="Documentos.visualizar('${doc.id}')">👁️ Visualizar</button>
              <button onclick="Documentos.descarregar('${doc.id}', '${doc.nome}')">⬇️ Descarregar</button>
              <button onclick="Documentos.editarDoc('${doc.id}')">✏️ Editar</button>
              <button onclick="Documentos.deletar('${doc.id}')" style="color: #ff6b6b;">🗑️ Deletar</button>
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
          <button class="btn btn-sm btn-primary" onclick="Documentos.visualizar('${doc.id}')">Abrir</button>
        </div>
      </div>
    `;
  },

  abrirMenu(event, docId) {
    event.stopPropagation();
    const menu = document.getElementById(`menu-${docId}`);

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
        <form id="form-upload" onsubmit="Documentos.enviarPDF(event)">
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
              <input type="file" id="doc-arquivo" accept=".pdf" required class="file-input" onchange="Documentos.previewArquivo(this)">
              <div class="file-input-label">
                <span id="file-name">Clique para selecionar um PDF</span>
              </div>
            </div>
            <small>Máximo: 50MB</small>
          </div>

          <div class="form-group">
            <label>Tags (separadas por vírgula)</label>
            <input type="text" id="doc-tags" class="form-input" placeholder="Ex: importante, operação, manutenção">
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Enviar PDF</button>
          </div>
        </form>
      </div>
    `;

    UI.openModal("Upload de PDF", modal, false);
  },

  previewArquivo(input) {
    const fileName = input.files[0]?.name || "Clique para selecionar um PDF";
    document.getElementById("file-name").textContent = fileName;
  },

  async enviarPDF(event) {
    event.preventDefault();

    const nome = document.getElementById("doc-nome").value.trim();
    const descricao = document.getElementById("doc-descricao").value.trim();
    const tipo = document.getElementById("doc-tipo").value;
    const arquivo = document.getElementById("doc-arquivo").files[0];
    const tagsStr = document.getElementById("doc-tags").value;

    if (!arquivo || !arquivo.type.includes("pdf")) {
      UI.toast("Por favor, selecione um arquivo PDF válido", "error");
      return;
    }

    if (arquivo.size > 50 * 1024 * 1024) {
      UI.toast("Arquivo muito grande. Máximo: 50MB", "error");
      return;
    }

    const loading = UI.toast("Enviando arquivo...", "loading");

    try {
      // Gerar caminho único para o arquivo
      const timestamp = Date.now();
      const caminhoArquivo = `${DB.user.id}/${tipo}/${timestamp}_${nome.replace(/\s+/g, "_")}.pdf`;

      // Fazer upload para Supabase Storage
      const { error: uploadError } = await DB.supabase.storage
        .from("documentos")
        .upload(caminhoArquivo, arquivo, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Obter URL pública do arquivo
      const { data: urlData } = DB.supabase.storage
        .from("documentos")
        .getPublicUrl(caminhoArquivo);

      const arquivoUrl = urlData?.publicUrl;

      // Salvar metadados no banco de dados
      const tags = tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t);

      const { error: dbError } = await DB.supabase.from("documentos").insert([
        {
          nome,
          descricao,
          tipo_documento: tipo,
          arquivo_url: arquivoUrl,
          arquivo_caminho: caminhoArquivo,
          tags,
          user_id: DB.user.id,
        },
      ]);

      if (dbError) throw dbError;

      UI.closeModal();
      UI.closeToast(loading);
      UI.toast("PDF enviado com sucesso!", "success");
      await this.listar();
    } catch (error) {
      console.error("Erro ao enviar PDF:", error);
      UI.closeToast(loading);
      UI.toast("Erro ao enviar PDF: " + error.message, "error");
    }
  },

  async visualizar(docId) {
    const doc = this.docs.find((d) => d.id === docId);
    if (!doc) return;

    const modal = `
      <div class="modal-visualizador">
        <div class="visualizador-header">
          <h3>${this.sanitize(doc.nome)}</h3>
          <button class="btn-icon" onclick="UI.closeModal()">✕</button>
        </div>
        <div id="pdf-viewer" style="height: 600px; overflow: auto; border: 1px solid #ddd; border-radius: 8px;">
          <canvas id="pdf-canvas" style="width: 100%; margin: 0 auto; display: block;"></canvas>
        </div>
        <div class="visualizador-controls">
          <button class="btn btn-sm" onclick="Documentos.paginaAnterior()">← Anterior</button>
          <span id="pagina-info">Página 1</span>
          <button class="btn btn-sm" onclick="Documentos.proximaPagina()">Próxima →</button>
          <button class="btn btn-primary btn-sm" onclick="Documentos.descarregar('${doc.id}', '${doc.nome}')">Descarregar</button>
        </div>
      </div>
    `;

    UI.openModal(`Visualizador - ${doc.nome}`, modal, false);

    // Carregar e renderizar PDF
    await this.renderizarPDF(doc.arquivo_url);
  },

  paginaAtual: 1,
  pdfDocumento: null,

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
      const context = canvas.getContext("2d");

      const viewport = pagina.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await pagina.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      document.getElementById("pagina-info").textContent =
        `Página ${num} de ${this.pdfDocumento.numPages}`;
      this.paginaAtual = num;
    } catch (error) {
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

  async descarregar(docId, nome) {
    const doc = this.docs.find((d) => d.id === docId);
    if (!doc) return;

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
    const doc = this.docs.find((d) => d.id === docId);
    if (!doc) return;

    const modal = `
      <div class="modal-editar">
        <h3>Editar Documento</h3>
        <form id="form-editar" onsubmit="Documentos.salvarEdicao('${doc.id}', event)">
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
            <input type="text" id="edit-tags" value="${(doc.tags || []).join(", ")}" class="form-input">
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </form>
      </div>
    `;

    UI.openModal("Editar Documento", modal, false);
  },

  async salvarEdicao(docId, event) {
    event.preventDefault();

    const nome = document.getElementById("edit-nome").value.trim();
    const descricao = document.getElementById("edit-descricao").value.trim();
    const tipo = document.getElementById("edit-tipo").value;
    const tagsStr = document.getElementById("edit-tags").value;

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    try {
      const { error } = await DB.supabase
        .from("documentos")
        .update({
          nome,
          descricao,
          tipo_documento: tipo,
          tags,
        })
        .eq("id", docId)
        .eq("user_id", DB.user.id);

      if (error) throw error;

      UI.closeModal();
      UI.toast("Documento atualizado!", "success");
      await this.listar();
    } catch (error) {
      console.error("Erro ao atualizar:", error);
      UI.toast("Erro ao atualizar documento", "error");
    }
  },

  async deletar(docId) {
    if (
      !confirm(
        "Tem certeza que deseja deletar este documento? Esta ação é irreversível.",
      )
    )
      return;

    const doc = this.docs.find((d) => d.id === docId);
    if (!doc) return;

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
        .eq("id", docId)
        .eq("user_id", DB.user.id);

      if (error) throw error;

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
};
