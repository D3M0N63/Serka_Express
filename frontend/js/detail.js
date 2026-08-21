import { api, requireAuth, initTopbar } from "./api.js";
import { STATUS_ORDER, statusClass, formatDate, formatMoney } from "./status.js";

requireAuth();
initTopbar();

const params = new URLSearchParams(window.location.search);
const code = params.get("code");
const shouldPrint = params.get("print") === "1";

const content = document.getElementById("content");
const detailCode = document.getElementById("detail-code");
const printBtn = document.getElementById("print-btn");

if (!code) {
  content.innerHTML = `<div class="card">No se especificó un código de envío.</div>`;
} else {
  load();
}

printBtn.addEventListener("click", () => window.print());

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
  content.innerHTML = `
    <div class="card no-print" style="margin-bottom:24px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">
      <div>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:4px;">Estado actual</div>
        <span class="badge ${statusClass(s.status)}" style="font-size:14px;">${s.status}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; width:100%; max-width:420px;">
        <label for="status-select" style="font-size:13px; font-weight:600; color:var(--text-muted); flex-shrink:0;">Actualizar estado</label>
        <select id="status-select" style="flex:1; min-width:140px; padding:9px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
          ${[...STATUS_ORDER, "Cancelado"]
            .map((st) => `<option value="${st}" ${st === s.status ? "selected" : ""}>${st}</option>`)
            .join("")}
        </select>
        <button class="btn btn-primary" id="status-save">Actualizar</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2 class="card-title">Datos del Remitente</h2>
        ${infoRow("Nombre", s.sender_name)}
        ${infoRow("DNI", s.sender_dni)}
        ${infoRow("Dirección", s.sender_address)}
        ${infoRow("Tel", s.sender_phone)}
        ${infoRow("Correo", s.sender_email)}
      </div>
      <div class="card">
        <h2 class="card-title">Datos del Destinatario</h2>
        ${infoRow("Nombre", s.recipient_name)}
        ${infoRow("DNI", s.recipient_dni)}
        ${infoRow("Dirección", s.recipient_address)}
        ${infoRow("Tel", s.recipient_phone)}
        ${infoRow("Correo", s.recipient_email)}
      </div>
    </div>

    <div class="grid-3">
      <div class="card">
        <h2 class="card-title">Detalles del Envío</h2>
        ${infoRow("Tipo", s.package_type)}
        ${infoRow("Contenido", s.package_content)}
        ${infoRow("Valor", formatMoney(s.package_value))}
      </div>
      <div class="card">
        <h2 class="card-title">Origen y Destino</h2>
        ${infoRow("Origen", s.origin)}
        ${infoRow("Destino", s.destination)}
        ${infoRow("Recojo en domicilio", s.pickup_at_home ? "Sí" : "No")}
      </div>
      <div class="card">
        <h2 class="card-title">Servicio y Pago</h2>
        ${infoRow("Costo", formatMoney(s.cost))}
        ${infoRow("Total", formatMoney(s.total))}
        ${infoRow("Pago", s.payment_method)}
        ${infoRow("Referencia", s.payment_reference)}
        ${infoRow("Registrado", formatDate(s.created_at))}
      </div>
    </div>
  `;

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

function infoRow(label, value) {
  return `
    <div class="field">
      <label>${label}</label>
      <div style="padding:9px 0; font-size:14px;">${value && value !== "" ? value : "-"}</div>
    </div>
  `;
}
