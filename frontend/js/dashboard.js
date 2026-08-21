import { api, requireAuth, initTopbar } from "./api.js";
import { statusClass, formatDate, formatMoney } from "./status.js";

requireAuth();
initTopbar();

const body = document.getElementById("shipments-body");
const emptyState = document.getElementById("empty-state");
const statsRow = document.getElementById("stats-row");
const searchInput = document.getElementById("search");

let allShipments = [];

function renderStats(shipments) {
  const total = shipments.length;
  const enCurso = shipments.filter((s) => !["Entregado", "Cancelado"].includes(s.status)).length;
  const entregados = shipments.filter((s) => s.status === "Entregado").length;
  const ingresos = shipments.reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  statsRow.innerHTML = `
    <div class="stat-card"><div class="num">${total}</div><div class="label">Envíos totales</div></div>
    <div class="stat-card"><div class="num">${enCurso}</div><div class="label">En curso</div></div>
    <div class="stat-card"><div class="num">${entregados}</div><div class="label">Entregados</div></div>
    <div class="stat-card"><div class="num">${formatMoney(ingresos)}</div><div class="label">Ingresos totales</div></div>
  `;
}

function renderTable(shipments) {
  body.innerHTML = "";
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
    `;
    tr.addEventListener("click", () => {
      window.location.href = `detail.html?code=${encodeURIComponent(s.code)}`;
    });
    body.appendChild(tr);
  }
}

async function load() {
  const { shipments } = await api("/shipments");
  allShipments = shipments;
  renderStats(allShipments);
  renderTable(allShipments);
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? allShipments.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.sender_name.toLowerCase().includes(q) ||
          s.recipient_name.toLowerCase().includes(q)
      )
    : allShipments;
  renderTable(filtered);
});

load().catch((err) => {
  console.error(err);
  emptyState.textContent = "No se pudieron cargar los envíos.";
  emptyState.style.display = "block";
});
