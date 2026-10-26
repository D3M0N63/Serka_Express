// Avisos y confirmaciones del sistema (reemplazan alert()/confirm() nativos).
// Ambas funciones devuelven una promesa: showAlert() se resuelve al cerrar y
// showConfirm() con true/false. Reusan el estilo .modal-overlay/.modal-card.

const ICONS = {
  error: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  warning: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/></svg>',
};

function openDialog({ title, message, variant, buttons }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dialog-overlay no-print";

    const card = document.createElement("div");
    card.className = "modal-card dialog-card";
    card.setAttribute("role", variant === "error" ? "alertdialog" : "dialog");
    card.setAttribute("aria-modal", "true");

    const icon = document.createElement("div");
    icon.className = `dialog-icon dialog-icon-${variant}`;
    icon.innerHTML = ICONS[variant] || ICONS.info;

    const body = document.createElement("div");
    body.className = "dialog-body";
    const h = document.createElement("h2");
    h.className = "modal-title dialog-title";
    h.textContent = title;
    const p = document.createElement("p");
    p.className = "dialog-message";
    p.textContent = message;
    body.append(h, p);

    const head = document.createElement("div");
    head.className = "dialog-head";
    head.append(icon, body);

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(value);
    };

    let primary = null;
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${b.className}`;
      btn.textContent = b.label;
      btn.addEventListener("click", () => finish(b.value));
      actions.appendChild(btn);
      if (b.primary) primary = btn;
    }

    const cancelValue = buttons.find((b) => b.cancel)?.value;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(cancelValue);
      } else if (e.key === "Tab") {
        // Mantiene el foco dentro del diálogo.
        const focusables = [...actions.querySelectorAll("button")];
        const i = focusables.indexOf(document.activeElement);
        e.preventDefault();
        focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) finish(cancelValue);
    });

    card.append(head, actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    primary?.focus();
  });
}

// Aviso con un solo botón. variant: "error" | "warning" | "info".
export function showAlert(message, { title, variant = "error", okText = "Entendido" } = {}) {
  const defaultTitle = variant === "error" ? "No se pudo completar" : variant === "warning" ? "Atención" : "Aviso";
  return openDialog({
    title: title || defaultTitle,
    message,
    variant,
    buttons: [{ label: okText, className: "btn-dark", value: undefined, primary: true, cancel: true }],
  });
}

// Confirmación con dos botones. Resuelve true al confirmar, false al cancelar.
export function showConfirm(message, { title = "Confirmar", confirmText = "Aceptar", cancelText = "Cancelar", danger = false } = {}) {
  return openDialog({
    title,
    message,
    variant: danger ? "warning" : "info",
    buttons: [
      { label: cancelText, className: "btn-outline", value: false, cancel: true },
      { label: confirmText, className: danger ? "btn-danger" : "btn-primary", value: true, primary: true },
    ],
  });
}
