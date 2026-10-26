import { api, requireAuth, initTopbar, getUser } from "./api.js";
import { formatDate, formatMoney, statusClass } from "./status.js";
import { PY_DEPARTMENTS, PY_CITIES } from "./py-cities.js";
import { createPager } from "./pager.js";

requireAuth();
initTopbar();

const agentDniInput = document.getElementById("agent-dni");
const agentCelInput = document.getElementById("agent-cel");

// Los datos del agente (C.I./Celular) no estan guardados en la cuenta de
// usuario: se recuerdan en este navegador para no tener que retipearlos
// cada vez que se imprime la hoja.
const AGENT_DNI_KEY = "serka_planilla_agent_dni";
const AGENT_CEL_KEY = "serka_planilla_agent_cel";
agentDniInput.value = localStorage.getItem(AGENT_DNI_KEY) || "";
agentCelInput.value = localStorage.getItem(AGENT_CEL_KEY) || "";
agentDniInput.addEventListener("input", () => localStorage.setItem(AGENT_DNI_KEY, agentDniInput.value));
agentCelInput.addEventListener("input", () => localStorage.setItem(AGENT_CEL_KEY, agentCelInput.value));

const dateInput = document.getElementById("filter-date");
const departmentSelect = document.getElementById("filter-department");
const citySelect = document.getElementById("filter-city");
const body = document.getElementById("manifest-body");
const emptyState = document.getElementById("empty-state");
const errorBanner = document.getElementById("error-banner");
const printBtn = document.getElementById("print-btn");
const printManifest = document.getElementById("print-manifest");
const selectAllCheckbox = document.getElementById("select-all");
const selectAllMobileCheckbox = document.getElementById("select-all-mobile");
const createManifestBtn = document.getElementById("create-manifest-btn");
const selectedCountEl = document.getElementById("selected-count");
const dispatchManifestBtn = document.getElementById("dispatch-manifest-btn");
const dispatchCountEl = document.getElementById("dispatch-count");
const manifestSearchInput = document.getElementById("manifest-search");
const manifestSearchBtn = document.getElementById("manifest-search-btn");
const viewingManifestBanner = document.getElementById("viewing-manifest-banner");
const viewingManifestCode = document.getElementById("viewing-manifest-code");
const viewingManifestCount = document.getElementById("viewing-manifest-count");
const backToFiltersBtn = document.getElementById("back-to-filters-btn");
const filtersCard = document.getElementById("filters-card");
const resultsCard = document.getElementById("results-card");
const searchCard = document.getElementById("search-card");
const tabBoletasBtn = document.getElementById("tab-boletas");
const tabPlanillasBtn = document.getElementById("tab-planillas");
const manifestsListCard = document.getElementById("manifests-list-card");
const manifestsListBody = document.getElementById("manifests-list-body");
const manifestsEmptyState = document.getElementById("manifests-empty-state");
const manifestsPagerEl = document.getElementById("manifests-pager");
const manifestsFilterCity = document.getElementById("manifests-filter-city");

for (const city of PY_CITIES) {
  const opt = document.createElement("option");
  opt.value = city;
  opt.textContent = city;
  manifestsFilterCity.appendChild(opt);
}

// Fecha de hoy en formato YYYY-MM-DD segun el horario local del navegador
// (no UTC), para que "hoy" coincida con lo que ve el usuario.
function todayLocal() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

dateInput.value = todayLocal();

for (const dept of PY_DEPARTMENTS) {
  const opt = document.createElement("option");
  opt.value = dept.name;
  opt.textContent = dept.name;
  departmentSelect.appendChild(opt);
}

function refreshCityOptions() {
  const deptName = departmentSelect.value;
  citySelect.innerHTML = `<option value="">Todas las ciudades</option>`;
  const dept = PY_DEPARTMENTS.find((d) => d.name === deptName);
  const cities = dept ? dept.cities : PY_DEPARTMENTS.flatMap((d) => d.cities);
  for (const city of [...cities].sort((a, b) => a.localeCompare(b, "es"))) {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  }
}
refreshCityOptions();

let currentShipments = [];
let selectedCodes = new Set();
let viewingManifest = null; // { code, ... } cuando se ve el detalle de una planilla
let activeTab = "boletas"; // "boletas" | "planillas"
let manifestsPage = 1;

const manifestsPager = createPager(manifestsPagerEl, (page) => loadManifestsList(page));

function updateSelectionUI() {
  if (viewingManifest) {
    dispatchCountEl.textContent = selectedCodes.size;
    dispatchManifestBtn.disabled = selectedCodes.size === 0;
  } else {
    selectedCountEl.textContent = selectedCodes.size;
    createManifestBtn.disabled = selectedCodes.size === 0;
  }
}

// Controla que tarjetas se muestran segun la pestaña activa (Boletas /
// Planillas) y si se esta viendo el detalle de una planilla puntual.
function updatePanels() {
  const showBoletas = activeTab === "boletas" && !viewingManifest;
  const showPlanillasList = activeTab === "planillas" && !viewingManifest;
  const showManifestDetail = !!viewingManifest;

  tabBoletasBtn.classList.toggle("active", activeTab === "boletas");
  tabPlanillasBtn.classList.toggle("active", activeTab === "planillas");

  filtersCard.style.display = showBoletas ? "" : "none";
  createManifestBtn.style.display = showBoletas ? "" : "none";

  searchCard.style.display = showPlanillasList ? "" : "none";
  manifestsListCard.style.display = showPlanillasList ? "" : "none";

  viewingManifestBanner.style.display = showManifestDetail ? "block" : "none";
  dispatchManifestBtn.style.display = showManifestDetail ? "" : "none";
  resultsCard.style.display = showBoletas || showManifestDetail ? "" : "none";
}

function switchTab(tab) {
  activeTab = tab;
  viewingManifest = null;
  selectedCodes.clear();
  manifestSearchInput.value = "";
  updatePanels();
  if (tab === "boletas") load();
  else loadManifestsList(1);
}

async function load() {
  errorBanner.style.display = "none";
  selectedCodes.clear();
  const params = new URLSearchParams({ date: dateInput.value });
  if (departmentSelect.value) params.set("department", departmentSelect.value);
  if (citySelect.value) params.set("city", citySelect.value);

  try {
    const { shipments } = await api(`/shipments/manifest?${params.toString()}`);
    currentShipments = shipments;
    renderTable(shipments, { selectableStatus: "Registrado" });
    renderPrintManifest(shipments);
    updateSelectionUI();
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

async function loadManifestsList(page = 1) {
  manifestsPage = page;
  errorBanner.style.display = "none";
  const params = new URLSearchParams({ page });
  if (manifestsFilterCity.value) params.set("city", manifestsFilterCity.value);

  try {
    const { manifests, total, pageSize } = await api(`/manifests?${params.toString()}`);
    renderManifestsList(manifests);
    manifestsPager.update({ page, total, pageSize });
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

function renderManifestsList(manifests) {
  manifestsListBody.innerHTML = "";
  manifestsEmptyState.style.display = manifests.length ? "none" : "block";

  for (const m of manifests) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Código"><strong>${m.code}</strong></td>
      <td data-label="Fecha">${formatDate(m.created_at)}</td>
      <td data-label="Boletas">${m.shipment_count}</td>
      <td data-label="Destino">${m.destinations || "-"}</td>
      <td data-label="Creado por">${m.created_by_name || "-"}</td>
    `;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      manifestSearchInput.value = m.code;
      searchManifest();
    });
    manifestsListBody.appendChild(tr);
  }
}

async function searchManifest() {
  const code = manifestSearchInput.value.trim();
  if (!code) return;
  errorBanner.style.display = "none";

  try {
    const { manifest, shipments } = await api(`/manifests/${encodeURIComponent(code)}`);
    viewingManifest = manifest;
    currentShipments = shipments;
    selectedCodes.clear();

    viewingManifestCode.textContent = manifest.code;
    viewingManifestCount.textContent = shipments.length;
    updatePanels();

    renderTable(shipments, { selectableStatus: "En transito" });
    renderPrintManifest(shipments);
    updateSelectionUI();
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

function closeManifestView() {
  viewingManifest = null;
  selectedCodes.clear();
  updatePanels();
  if (activeTab === "boletas") load();
  else loadManifestsList(manifestsPage);
}

async function createManifest() {
  if (selectedCodes.size === 0) return;
  errorBanner.style.display = "none";
  createManifestBtn.disabled = true;

  try {
    const { manifest } = await api("/manifests", {
      method: "POST",
      body: { codes: [...selectedCodes] },
    });
    selectedCodes.clear();
    manifestSearchInput.value = manifest.code;
    await searchManifest();
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
    updateSelectionUI();
  }
}

async function dispatchManifest() {
  if (!viewingManifest || selectedCodes.size === 0) return;
  errorBanner.style.display = "none";
  dispatchManifestBtn.disabled = true;

  try {
    const { shipments } = await api(`/manifests/${encodeURIComponent(viewingManifest.code)}/dispatch`, {
      method: "POST",
      body: { codes: [...selectedCodes] },
    });
    currentShipments = shipments;
    selectedCodes.clear();
    viewingManifestCount.textContent = shipments.length;
    renderTable(shipments, { selectableStatus: "En transito" });
    renderPrintManifest(shipments);
    updateSelectionUI();
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
    updateSelectionUI();
  }
}

function renderTable(shipments, { selectableStatus }) {
  body.innerHTML = "";
  emptyState.style.display = shipments.length ? "none" : "block";
  selectAllCheckbox.checked = false;
  selectAllMobileCheckbox.checked = false;

  for (const s of shipments) {
    const canSelect = s.status === selectableStatus;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="${canSelect ? "Seleccionar" : ""}">${
        canSelect
          ? `<input type="checkbox" class="row-select" data-code="${s.code}" />`
          : ""
      }</td>
      <td data-label="Código"><strong>${s.code}</strong></td>
      <td data-label="Remitente">${s.sender_name}</td>
      <td data-label="Destinatario">${s.recipient_name}</td>
      <td data-label="Destino">${s.destination || "-"}</td>
      <td data-label="Total">${formatMoney(s.total)}</td>
      <td data-label="Valor a cobrar">${s.payment_method === "A cobrar" ? formatMoney(s.package_value) : "-"}</td>
      <td data-label="Pago">${s.payment_method || "-"}</td>
      <td data-label="Estado"><span class="badge ${statusClass(s.status)}">${s.status}</span></td>
      <td data-label="Hora">${formatDate(s.created_at)}</td>
    `;
    const checkbox = tr.querySelector(".row-select");
    if (checkbox) {
      checkbox.checked = selectedCodes.has(s.code);
      checkbox.addEventListener("click", (e) => e.stopPropagation());
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedCodes.add(s.code);
        else selectedCodes.delete(s.code);
        updateSelectionUI();
      });
    }
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".row-select")) return;
      window.location.href = `detail.html?code=${encodeURIComponent(s.code)}`;
    });
    body.appendChild(tr);
  }
}

// Texto de pago para la hoja ("A COBRAR" / "CRÉDITO" / "PAGADO"), igual
// criterio que paymentLabel() en detail.js para el ticket.
function planillaPaymentLabel(method) {
  if (method === "Crédito") return "CRÉDITO";
  if (method === "A cobrar") return "A COBRAR";
  return "PAGADO"; // Efectivo o Transferencia
}

// "YYYY-MM-DD" (como filter-date) se parsea a mano en vez de con
// `new Date(string)`: ese constructor interpreta la fecha-sola como UTC
// medianoche, que en Paraguay (UTC-3) cae en el dia anterior al mostrarla
// en hora local. Un timestamp ISO completo (con hora) no tiene ese
// problema y se puede parsear directo.
function parseLocalDate(dateLike) {
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    const [y, m, day] = dateLike.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(dateLike);
}

// "VIERNES 02 - 10 - 2026." a partir de un Date.
function planillaDateLabel(d) {
  const weekday = d.toLocaleDateString("es-PY", { weekday: "long" }).toUpperCase();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${weekday} ${day} - ${month} - ${d.getFullYear()}.`;
}

// Numero plano con separador de miles, sin simbolo de moneda (asi se ve
// en la planilla de agente en papel).
function plainNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("es-PY");
}

const PLANILLA_MIN_ROWS = 12;

function renderPrintManifest(shipments) {
  const user = getUser() || {};
  const d = parseLocalDate(viewingManifest ? viewingManifest.created_at : dateInput.value);

  // Monto a cobrar en destino: solo para boletas "A cobrar", el resto es 0.
  const rows = shipments.map((s, i) => ({
    nro: i + 1,
    dia: new Date(s.created_at).getDate(),
    guia: s.code,
    sender: s.sender_name || "-",
    senderPhone: s.sender_phone || "-",
    origin: s.origin || "-",
    recipient: s.recipient_name || "-",
    recipientPhone: s.recipient_phone || "-",
    destination: s.destination || "-",
    object: s.package_type || "-",
    payment: planillaPaymentLabel(s.payment_method),
    monto: s.payment_method === "A cobrar" ? Math.round(Number(s.package_value) || 0) : 0,
    address: s.recipient_address || "-",
  }));

  const totalCobro = rows.reduce((sum, r) => sum + r.monto, 0);
  const blankRows = Math.max(0, PLANILLA_MIN_ROWS - rows.length);

  printManifest.innerHTML = `
    <div class="planilla-sheet">
      <div class="planilla-sheet-header">
        <svg class="logo-mark" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M37 3C25 3 12 9 4 18C12 27 25 33 37 33" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M30 8C21 8 11 12.5 6 18C11 23.5 21 28 30 28" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M23 13C17 13 10 15.5 8 18C10 20.5 17 23 23 23" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>
        </svg>
        <div>
          <div class="logo">SERKA <span class="express">EXPRESS</span></div>
          <span class="logo-sub">COURRIER &middot; TODO A TIEMPO</span>
        </div>
      </div>
      <div class="planilla-sheet-meta">
        <span><strong>FECHA:</strong> ${planillaDateLabel(d)}</span>
        <span><strong>AGENTE:</strong> ${user.city || "-"}: ${(user.name || "-").toUpperCase()}</span>
        <span><strong>C. I Nº</strong> ${agentDniInput.value.trim() || "-"}, <strong>CEL Nº</strong> ${agentCelInput.value.trim() || "-"}</span>
        <span><strong>MES:</strong> ${d.toLocaleDateString("es-PY", { month: "long" }).toUpperCase()}</span>
        <span><strong>AÑO:</strong> ${d.getFullYear()}</span>
      </div>
      <table>
        <colgroup>
          <col style="width:3%"><col style="width:3%"><col style="width:6%">
          <col style="width:10%"><col style="width:8%"><col style="width:7%">
          <col style="width:10%"><col style="width:8%"><col style="width:8%">
          <col style="width:6%"><col style="width:8%"><col style="width:7%">
          <col style="width:10%"><col style="width:2%"><col style="width:4%">
        </colgroup>
        <thead>
          <tr>
            <th>Nro.</th>
            <th>Dia</th>
            <th>Guia</th>
            <th>Remitente</th>
            <th>Telefono Remitente</th>
            <th>Origen</th>
            <th>Destinatario</th>
            <th>Telefono</th>
            <th>Destino</th>
            <th>Objeto</th>
            <th>Forma de pago/des/orig</th>
            <th class="num">Monto</th>
            <th>Direccion</th>
            <th></th>
            <th>Ruteo</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${r.nro}</td>
              <td>${r.dia}</td>
              <td>${r.guia}</td>
              <td>${r.sender}</td>
              <td>${r.senderPhone}</td>
              <td>${r.origin}</td>
              <td>${r.recipient}</td>
              <td>${r.recipientPhone}</td>
              <td>${r.destination}</td>
              <td>${r.object}</td>
              <td>${r.payment}</td>
              <td class="num">${plainNumber(r.monto)}</td>
              <td>${r.address}</td>
              <td></td>
              <td></td>
            </tr>
          `
            )
            .join("")}
          ${Array.from({ length: blankRows }, () => `
            <tr>
              <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="11" class="total-label">TOTAL COBRO DESTINO</td>
            <td class="total-value">${plainNumber(totalCobro)}</td>
            <td colspan="2"></td>
            <td class="saldo-cell" rowspan="2">SALDO<br>TOTAL</td>
          </tr>
          <tr>
            <td colspan="11" class="total-label">A DEPOSITAR PARA SERKA EXPRESS</td>
            <td class="total-value">${plainNumber(totalCobro)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

dateInput.addEventListener("change", load);
departmentSelect.addEventListener("change", () => {
  refreshCityOptions();
  load();
});
citySelect.addEventListener("change", load);
printBtn.addEventListener("click", () => window.print());
createManifestBtn.addEventListener("click", createManifest);
dispatchManifestBtn.addEventListener("click", dispatchManifest);
manifestSearchBtn.addEventListener("click", searchManifest);
manifestSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchManifest();
});
backToFiltersBtn.addEventListener("click", closeManifestView);
tabBoletasBtn.addEventListener("click", () => switchTab("boletas"));
tabPlanillasBtn.addEventListener("click", () => switchTab("planillas"));
manifestsFilterCity.addEventListener("change", () => loadManifestsList(1));
function applySelectAll(checked) {
  const boxes = body.querySelectorAll(".row-select");
  for (const box of boxes) {
    box.checked = checked;
    if (checked) selectedCodes.add(box.dataset.code);
    else selectedCodes.delete(box.dataset.code);
  }
  selectAllCheckbox.checked = checked;
  selectAllMobileCheckbox.checked = checked;
  updateSelectionUI();
}
selectAllCheckbox.addEventListener("change", () => applySelectAll(selectAllCheckbox.checked));
selectAllMobileCheckbox.addEventListener("change", () => applySelectAll(selectAllMobileCheckbox.checked));

updatePanels();
load().catch((err) => {
  console.error(err);
  emptyState.textContent = "No se pudo cargar la planilla.";
  emptyState.style.display = "block";
});
