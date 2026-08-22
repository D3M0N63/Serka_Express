import { api } from "./api.js";
import { statusClass, formatDate, formatMoney } from "./status.js";

const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

export function renderStats(el, stats) {
  el.innerHTML = `
    <div class="stat-card"><div class="num">${stats.total}</div><div class="label">Envíos totales</div></div>
    <div class="stat-card"><div class="num">${stats.enCurso}</div><div class="label">En curso</div></div>
    <div class="stat-card"><div class="num">${stats.entregados}</div><div class="label">Entregados</div></div>
    <div class="stat-card"><div class="num">${formatMoney(stats.ingresos)}</div><div class="label">Ingresos totales</div></div>
  `;
}

export function renderShipmentsTable({ tbody, emptyState, shipments, onChange }) {
  tbody.innerHTML = "";
  emptyState.style.display = shipments.length ? "none" : "block";

  for (const s of shipments) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Código"><strong>${s.code}</strong></td>
      <td data-label="Remitente">${s.sender_name}</td>
      <td data-label="Destinatario">${s.recipient_name}</td>
      <td data-label="Ruta">${s.origin || "-"} &rarr; ${s.destination || "-"}</td>
      <td data-label="Estado"><span class="badge ${statusClass(s.status)}">${s.status}</span></td>
      <td data-label="Total">${formatMoney(s.total)}</td>
      <td data-label="Fecha">${formatDate(s.created_at)}</td>
      <td data-label="Acciones">
        <div class="row-actions">
          <button type="button" class="icon-btn edit-btn" title="Editar">${ICON_EDIT}</button>
          <button type="button" class="icon-btn danger delete-btn" title="Eliminar">${ICON_DELETE}</button>
        </div>
      </td>
    `;
    tr.addEventListener("click", () => {
      window.location.href = `detail.html?code=${encodeURIComponent(s.code)}`;
    });
    tr.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      window.location.href = `new-shipment.html?code=${encodeURIComponent(s.code)}`;
    });
    tr.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteShipment(s.code, onChange);
    });
    tbody.appendChild(tr);
  }
}

async function deleteShipment(code, onChange) {
  if (!confirm(`¿Eliminar el envío ${code}? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/shipments/${encodeURIComponent(code)}`, { method: "DELETE" });
    if (onChange) await onChange();
  } catch (err) {
    alert(err.message);
  }
}
