// ===================================================
//  UI.JS — Helpers de Interface de Usuário
// ===================================================

const UI = {
  // ---- Toast ----
  toast(message, type = "success") {
    const toasts = document.getElementById("toasts");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    const icons = {
      success: "✓",
      error: "!",
      loading: "⏳",
      info: "i",
    };
    t.innerHTML = `<span>${icons[type] || icons.info}</span> ${this.escapeHTML(message)}`;
    const id = `toast-${Date.now()}`;
    t.id = id;
    toasts.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);

    if (type !== "loading") {
      setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => t.remove(), 300);
      }, 3000);
    }
    return id;
  },

  closeToast(id) {
    const toast = document.getElementById(id);
    if (toast) {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }
  },

  // ---- Modal ----
  openModal(title, bodyHTML, showFooter = true) {
    const overlay = document.getElementById("modal-overlay");
    const footer = document.getElementById("modal-footer");
    const cancelBtn = document.getElementById("modal-cancel");
    const confirmBtn = document.getElementById("modal-confirm");

    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    footer.style.display = showFooter ? "" : "none";
    cancelBtn.style.display = "";
    confirmBtn.style.display = "";
    confirmBtn.textContent = "Salvar";
    confirmBtn.className = "btn btn-primary";
    confirmBtn.onclick = null;
    overlay.classList.add("active");

    const firstInput = document.querySelector(
      "#modal-body input, #modal-body select, #modal-body textarea",
    );
    setTimeout(() => firstInput?.focus(), 40);
  },

  closeModal() {
    document.getElementById("modal-overlay").classList.remove("active");
    document.getElementById("modal-footer").style.display = "";
  },

  // ---- Helpers ----
  escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },
};
