import { api, requireAuth, initTopbar } from "./api.js";
import { STATUS_ORDER, statusClass, formatDate, formatMoney } from "./status.js";

requireAuth();
initTopbar();

const params = new URLSearchParams(window.location.search);
const code = params.get("code");
const shouldPrint = params.get("print") === "1";

const content = document.getElementById("content");
const printLabel = document.getElementById("print-label");
const detailCode = document.getElementById("detail-code");
const printBtn = document.getElementById("print-btn");
const editBtn = document.getElementById("edit-btn");
const deleteBtn = document.getElementById("delete-btn");

const ICONS = {
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
};

if (!code) {
  content.innerHTML = `<div class="card">No se especificó un código de envío.</div>`;
} else {
  load();
}

printBtn.addEventListener("click", () => window.print());

editBtn.addEventListener("click", () => {
  window.location.href = `new-shipment.html?code=${encodeURIComponent(code)}`;
});

deleteBtn.addEventListener("click", async () => {
  if (!confirm(`¿Eliminar el envío ${code}? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/shipments/${encodeURIComponent(code)}`, { method: "DELETE" });
    window.location.href = "dashboard.html";
  } catch (err) {
    alert(err.message);
  }
});

async function load() {
  try {
    const { shipment: s } = await api(`/shipments/${encodeURIComponent(code)}`);
    detailCode.textContent = s.code;
    render(s);
    if (shouldPrint) setTimeout(() => window.print(), 300);
  } catch (err) {
    content.innerHTML = `<div class="card">${err.message}</div>`;
  }
}

function render(s) {
  const isCancelled = s.status === "Cancelado";
  const currentIndex = STATUS_ORDER.indexOf(s.status);
  const steps = isCancelled
    ? [{ label: "Cancelado", active: true }]
    : STATUS_ORDER.map((st, i) => ({ label: st, active: i <= currentIndex }));

  content.innerHTML = `
    <div class="card detail-hero">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow">Código de envío</div>
          <div class="hero-code">${s.code}</div>
          <div class="hero-route">${s.origin || "-"} &rarr; ${s.destination || "-"} &middot; ${s.package_type || "Paquete"}</div>
        </div>
        <span class="badge ${statusClass(s.status)} hero-badge">${s.status}</span>
      </div>

      <div class="hero-divider"></div>

      <ul class="timeline hero-timeline">
        ${steps
          .map(
            (step) => `
          <li class="${step.active ? "active" : ""}">
            <div class="dot"></div>
            <div>
              <div class="tl-title">${step.label}</div>
              <div class="tl-sub">${step.active ? formatDate(s.updated_at) : "Pendiente"}</div>
            </div>
          </li>`
          )
          .join("")}
      </ul>

      <div class="hero-divider no-print"></div>

      <div class="status-update no-print">
        <label for="status-select">Actualizar estado</label>
        <select id="status-select">
          ${[...STATUS_ORDER, "Cancelado"]
            .map((st) => `<option value="${st}" ${st === s.status ? "selected" : ""}>${st}</option>`)
            .join("")}
        </select>
        <button class="btn btn-primary" id="status-save">Actualizar</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2 class="card-title">${ICONS.user} Datos del Remitente</h2>
        <div class="info-list">
          ${infoRow("Nombre", s.sender_name)}
          ${infoRow("CI/RUC", s.sender_dni)}
          ${infoRow("Dirección", s.sender_address)}
          ${infoRow("Tel", s.sender_phone)}
          ${infoRow("Correo", s.sender_email)}
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">${ICONS.user} Datos del Destinatario</h2>
        <div class="info-list">
          ${infoRow("Nombre", s.recipient_name)}
          ${infoRow("CI/RUC", s.recipient_dni)}
          ${infoRow("Dirección", s.recipient_address)}
          ${infoRow("Tel", s.recipient_phone)}
          ${infoRow("Correo", s.recipient_email)}
        </div>
      </div>
    </div>

    <div class="grid-3">
      <div class="card">
        <h2 class="card-title">${ICONS.box} Detalles del Envío</h2>
        <div class="info-list">
          ${infoRow("Tipo", s.package_type)}
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">${ICONS.pin} Origen y Destino</h2>
        <div class="info-list">
          ${infoRow("Origen", s.origin)}
          ${infoRow("Destino", s.destination)}
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">${ICONS.card} Servicio y Pago</h2>
        <div class="info-list">
          ${infoRow("Costo", formatMoney(s.cost))}
          ${infoRow("Total", formatMoney(s.total))}
          ${infoRow("Pago", s.payment_method)}
          ${infoRow("Referencia", s.payment_reference)}
          ${infoRow("Registrado", formatDate(s.created_at))}
        </div>
      </div>
    </div>
  `;

  renderTicket(s);

  document.getElementById("status-save").addEventListener("click", async () => {
    const btn = document.getElementById("status-save");
    const newStatus = document.getElementById("status-select").value;
    btn.disabled = true;
    btn.textContent = "Actualizando...";
    try {
      const { shipment: updated } = await api(`/shipments/${encodeURIComponent(s.code)}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      render(updated);
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = "Actualizar";
    }
  });
}

function infoRow(label, value, tone) {
  const hasValue = value !== undefined && value !== null && value !== "";
  const cls = hasValue ? tone || "" : "muted";
  return `
    <div class="info-row">
      <span class="info-label">${label}</span>
      <span class="info-value ${cls}">${hasValue ? value : "-"}</span>
    </div>
  `;
}

// Etiqueta imprimible con formato de ticket (fuente monoespaciada,
// secciones en mayúscula, filas etiqueta/valor), oculta en pantalla y
// visible solo al imprimir (ver @media print en style.css).
function renderTicket(s) {
  printLabel.innerHTML = `
    <div class="ticket">
      <div class="ticket-header">
        <div class="ticket-title">* SERKA EXPRESS *</div>
        <div class="ticket-sub">${s.origin ? s.origin.toUpperCase() : "COURRIER"}</div>
      </div>
      <div class="ticket-meta">
        <span>${formatDate(s.created_at)}</span>
        <span>Envío: ${s.code}</span>
      </div>
      <div class="ticket-rule"></div>
      <div class="ticket-section">REMITENTE</div>
      ${ticketRow("Nombre", s.sender_name)}
      ${ticketRow("CI/RUC", s.sender_dni)}
      ${ticketRow("Dirección", s.sender_address)}
      ${ticketRow("Tel", s.sender_phone)}
      <div class="ticket-rule"></div>
      <div class="ticket-section">DESTINATARIO</div>
      ${ticketRow("Nombre", s.recipient_name)}
      ${ticketRow("CI/RUC", s.recipient_dni)}
      ${ticketRow("Dirección", s.recipient_address)}
      ${ticketRow("Tel", s.recipient_phone)}
      <div class="ticket-rule"></div>
      <div class="ticket-section">ENVÍO</div>
      ${ticketRow("Tipo", s.package_type)}
      ${ticketRow("Origen", s.origin)}
      ${ticketRow("Destino", s.destination)}
      ${ticketRow("Estado", s.status)}
      ${ticketRow("Pago", s.payment_method)}
      <div class="ticket-rule"></div>
      <div class="ticket-total">
        <span>A PAGAR</span>
        <span>${formatMoney(s.total)}</span>
      </div>
      <div class="ticket-rule-double"></div>
      <div class="ticket-footer">¡Gracias por elegir Serka Express!</div>
    </div>
  `;
}

function ticketRow(label, value) {
  return `<div class="ticket-row"><span>${label}</span><span>${value && value !== "" ? value : "-"}</span></div>`;
}
