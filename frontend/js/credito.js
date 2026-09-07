import { api, requireAuth, requireRole, initTopbar } from "./api.js";
import { formatDate, formatMoney } from "./status.js";

requireAuth();
requireRole(["admin"]);
initTopbar();

const errorBanner = document.getElementById("error-banner");

const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");

// --- Listado ---
const periodLabel = document.getElementById("period-label");
const prevBtn = document.getElementById("period-prev");
const nextBtn = document.getElementById("period-next");
const todayBtn = document.getElementById("period-today");
const searchInput = document.getElementById("search");
const clientsBody = document.getElementById("clients-body");
const listEmptyState = document.getElementById("list-empty-state");

// --- Detalle ---
const backBtn = document.getElementById("back-btn");
const detailCrumb = document.getElementById("detail-crumb");
const detailStats = document.getElementById("detail-stats");
const tabPendientes = document.getElementById("tab-pendientes");
const tabHistorial = document.getElementById("tab-historial");
const pendientesPanel = document.getElementById("pendientes-panel");
const historialPanel = document.getElementById("historial-panel");
const pendientesBody = document.getElementById("pendientes-body");
const pendientesEmptyState = document.getElementById("pendientes-empty-state");
const historialBody = document.getElementById("historial-body");
const historialEmptyState = document.getElementById("historial-empty-state");
const selectAll = document.getElementById("select-all");
const selectAllMobile = document.getElementById("select-all-mobile");
const selectedSummary = document.getElementById("selected-summary");
const printSelectedBtn = document.getElementById("print-selected-btn");

const printDoc = document.getElementById("print-doc");

let refDate = new Date();
let currentClients = [];
let currentKey = null;
let currentDetail = null;
let selectedCodes = new Set();
let debounceTimer = null;

function monthStr(d = refDate) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d = refDate) {
  const label = d.toLocaleDateString("es-PY", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ---------------------------------------------------------------------------
// Listado de empresas
// ---------------------------------------------------------------------------
async function loadList() {
  errorBanner.style.display = "none";
  periodLabel.textContent = monthLabel();

  try {
    const { clients } = await api(`/credits?month=${monthStr()}`);
    currentClients = clients;
    renderClients();
  } catch (err) {
    showError(err.message);
  }
}

function renderClients() {
  const q = searchInput.value.trim().toLowerCase();
  const rows = q
    ? currentClients.filter(
        (c) =>
          (c.client_name || "").toLowerCase().includes(q) ||
          (c.client_dni || "").toLowerCase().includes(q)
      )
    : currentClients;

  clientsBody.innerHTML = "";
  listEmptyState.style.display = rows.length ? "none" : "block";

  for (const c of rows) {
    const reportsLabel = c.report_count
      ? `${c.report_count}${c.report_pending_count ? ` · ${c.report_pending_count} sin cobrar` : ""}`
      : "-";
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.innerHTML = `
      <td data-label="Empresa"><strong>${c.client_name || "-"}</strong></td>
      <td data-label="CI/RUC">${c.client_dni || "-"}</td>
      <td data-label="Boletas">${c.shipment_count}</td>
      <td data-label="Informes">${reportsLabel}</td>
      <td data-label="Saldo del mes">${formatMoney(c.total)}</td>
    `;
    tr.addEventListener("click", () => openDetail(c.client_key));
    clientsBody.appendChild(tr);
  }
}

// ---------------------------------------------------------------------------
// Detalle de una empresa
// ---------------------------------------------------------------------------
async function openDetail(key) {
  errorBanner.style.display = "none";
  currentKey = key;
  selectedCodes.clear();

  try {
    const detail = await api(`/credits/client?key=${encodeURIComponent(key)}&month=${monthStr()}`);
    currentDetail = detail;

    listView.style.display = "none";
    detailView.style.display = "";
    setSubtab("pendientes");

    detailCrumb.textContent = `${detail.client.name}${detail.client.dni ? ` · ${detail.client.dni}` : ""} — ${monthLabel()}`;
    renderDetailStats();
    renderPendientes();
    renderHistorial();
  } catch (err) {
    showError(err.message);
  }
}

function renderDetailStats() {
  const d = currentDetail;
  const unpaidReports = d.reports.filter((r) => !r.paid_at).length;
  detailStats.innerHTML = `
    <div class="stat-card"><div class="num">${formatMoney(d.balance)}</div><div class="label">Saldo del mes</div></div>
    <div class="stat-card"><div class="num">${d.pendingShipments.length}</div><div class="label">Boletas sin informe</div></div>
    <div class="stat-card"><div class="num">${d.reports.length}</div><div class="label">Informes impresos</div></div>
    <div class="stat-card"><div class="num">${unpaidReports}</div><div class="label">Informes sin cobrar</div></div>
  `;
}

function renderPendientes() {
  const shipments = currentDetail.pendingShipments;
  pendientesBody.innerHTML = "";
  pendientesEmptyState.style.display = shipments.length ? "none" : "block";
  selectAll.checked = false;
  selectAllMobile.checked = false;

  for (const s of shipments) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Seleccionar"><input type="checkbox" class="row-select" data-code="${s.code}" /></td>
      <td data-label="Código"><strong>${s.code}</strong></td>
      <td data-label="Destinatario">${s.recipient_name}</td>
      <td data-label="Destino">${s.destination || "-"}</td>
      <td data-label="Fecha">${formatDate(s.created_at)}</td>
      <td data-label="Total">${formatMoney(s.total)}</td>
    `;
    const checkbox = tr.querySelector(".row-select");
    checkbox.checked = selectedCodes.has(s.code);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedCodes.add(s.code);
      else selectedCodes.delete(s.code);
      updateSelectionUI();
    });
    pendientesBody.appendChild(tr);
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const total = currentDetail.pendingShipments
    .filter((s) => selectedCodes.has(s.code))
    .reduce((sum, s) => sum + (s.total || 0), 0);
  selectedSummary.textContent = selectedCodes.size
    ? `${selectedCodes.size} boleta(s) · ${formatMoney(total)}`
    : "";
  printSelectedBtn.disabled = selectedCodes.size === 0;
}

function applySelectAll(checked) {
  for (const box of pendientesBody.querySelectorAll(".row-select")) {
    box.checked = checked;
    if (checked) selectedCodes.add(box.dataset.code);
    else selectedCodes.delete(box.dataset.code);
  }
  selectAll.checked = checked;
  selectAllMobile.checked = checked;
  updateSelectionUI();
}

function renderHistorial() {
  const reports = currentDetail.reports;
  historialBody.innerHTML = "";
  historialEmptyState.style.display = reports.length ? "none" : "block";

  for (const r of reports) {
    const paid = !!r.paid_at;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Informe"><strong>${r.code}</strong></td>
      <td data-label="Fecha">${formatDate(r.created_at)}</td>
      <td data-label="Boletas">${r.shipment_count}</td>
      <td data-label="Total">${formatMoney(r.total)}</td>
      <td data-label="Estado">
        <span class="badge ${paid ? "badge-entregado" : "badge-transito"}">
          ${paid ? "Pagado" : "Pendiente"}
        </span>
      </td>
      <td data-label="">
        <button type="button" class="btn btn-outline btn-sm reprint-btn">Reimprimir</button>
      </td>
    `;
    tr.querySelector(".reprint-btn").addEventListener("click", () => reprintReport(r.code));
    historialBody.appendChild(tr);
  }
}

function setSubtab(name) {
  const showPend = name === "pendientes";
  tabPendientes.classList.toggle("active", showPend);
  tabHistorial.classList.toggle("active", !showPend);
  pendientesPanel.style.display = showPend ? "" : "none";
  historialPanel.style.display = showPend ? "none" : "";
}

// ---------------------------------------------------------------------------
// Impresión
// ---------------------------------------------------------------------------

// Pregunta si las boletas ya están pagadas. Devuelve "yes", "no" o null
// (cancelar).
function askPaid(count) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay no-print";
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-title">¿Ya están pagadas estas boletas?</div>
        <p class="hint" style="text-align:left; margin-top:0;">
          ${count} boleta(s) en este informe.<br />
          <strong>Sí</strong>: imprime y marca el informe como pagado.<br />
          <strong>No</strong>: imprime la hoja y deja el informe pendiente de cobro en el historial.
        </p>
        <div class="modal-options">
          <button type="button" class="modal-option" data-value="yes">Sí, están pagadas</button>
          <button type="button" class="modal-option" data-value="no">No, solo imprimir</button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-value="cancel">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const done = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('[data-value="yes"]').addEventListener("click", () => done("yes"));
    overlay.querySelector('[data-value="no"]').addEventListener("click", () => done("no"));
    overlay.querySelector('[data-value="cancel"]').addEventListener("click", () => done(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(null);
    });
  });
}

async function printSelected() {
  if (selectedCodes.size === 0) return;
  const answer = await askPaid(selectedCodes.size);
  if (answer === null) return;

  errorBanner.style.display = "none";
  printSelectedBtn.disabled = true;
  try {
    const { report, shipments } = await api("/credits/reports", {
      method: "POST",
      body: { codes: [...selectedCodes], paid: answer === "yes" },
    });
    renderPrintDoc(report, shipments);
    printSheet();
    selectedCodes.clear();
    await openDetail(currentKey);
  } catch (err) {
    showError(err.message);
    printSelectedBtn.disabled = false;
  }
}

async function reprintReport(code) {
  errorBanner.style.display = "none";
  try {
    let { report, shipments } = await api(`/credits/reports/${encodeURIComponent(code)}`);

    if (!report.paid_at) {
      const answer = await askPaid(report.shipment_count);
      if (answer === null) return;
      if (answer === "yes") {
        ({ report, shipments } = await api(`/credits/reports/${encodeURIComponent(code)}`, {
          method: "PATCH",
        }));
      }
    }

    renderPrintDoc(report, shipments);
    printSheet();
    await openDetail(currentKey);
  } catch (err) {
    showError(err.message);
  }
}

function printSheet() {
  window.print();
}

function renderPrintDoc(report, shipments) {
  const paid = !!report.paid_at;
  const client = currentDetail?.client || { name: report.client_name, dni: report.client_dni };
  const total = report.total ?? shipments.reduce((sum, s) => sum + (s.total || 0), 0);

  printDoc.innerHTML = `
    <div class="credito-doc">
      <div class="credito-doc-header">
        <div>
          <div class="credito-doc-title">Serka Express — Cuenta de Crédito</div>
          <div class="credito-doc-client">${client.name || "-"}${client.dni ? ` · CI/RUC: ${client.dni}` : ""}</div>
        </div>
        <div class="credito-doc-meta">
          <div><strong>Informe:</strong> ${report.code}</div>
          <div><strong>Emitido:</strong> ${formatDate(report.created_at)}</div>
          <div><strong>Boletas:</strong> ${shipments.length}</div>
          <div class="credito-doc-stamp ${paid ? "" : "pending"}">${paid ? "Pagado" : "Pendiente de pago"}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Fecha</th>
            <th>Destinatario</th>
            <th>Destino</th>
            <th class="num">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${shipments
            .map(
              (s) => `
            <tr>
              <td>${s.code}</td>
              <td>${formatDate(s.created_at)}</td>
              <td>${s.recipient_name || "-"}</td>
              <td>${s.destination || "-"}</td>
              <td class="num">${formatMoney(s.total)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4">Total ${paid ? "pagado" : "adeudado"}</td>
            <td class="num">${formatMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="credito-doc-footer">
        <div>Firma y aclaración (Serka Express)</div>
        <div>Firma y aclaración (${client.name || "Cliente"})</div>
      </div>
    </div>
  `;
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function backToList() {
  currentKey = null;
  currentDetail = null;
  selectedCodes.clear();
  detailView.style.display = "none";
  listView.style.display = "";
  loadList();
}

function shiftMonth(dir) {
  refDate = new Date(refDate.getFullYear(), refDate.getMonth() + dir, 1);
  if (currentKey) openDetail(currentKey);
  else loadList();
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
prevBtn.addEventListener("click", () => shiftMonth(-1));
nextBtn.addEventListener("click", () => shiftMonth(1));
todayBtn.addEventListener("click", () => {
  refDate = new Date();
  if (currentKey) openDetail(currentKey);
  else loadList();
});
searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderClients, 200);
});
backBtn.addEventListener("click", backToList);
tabPendientes.addEventListener("click", () => setSubtab("pendientes"));
tabHistorial.addEventListener("click", () => setSubtab("historial"));
selectAll.addEventListener("change", () => applySelectAll(selectAll.checked));
selectAllMobile.addEventListener("change", () => applySelectAll(selectAllMobile.checked));
printSelectedBtn.addEventListener("click", printSelected);

loadList().catch((err) => {
  console.error(err);
  showError("No se pudo cargar la pantalla de crédito.");
});
