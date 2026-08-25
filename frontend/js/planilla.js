import { api, requireAuth, initTopbar } from "./api.js";
import { formatDate, formatMoney, statusClass } from "./status.js";
import { PY_DEPARTMENTS, PY_CITIES } from "./py-cities.js";
import { createPager } from "./pager.js";

requireAuth();
initTopbar();

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
    renderPrintManifest(shipments, { title: "Serka Express — Planilla de Envíos" });
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
    renderPrintManifest(shipments, { title: `Serka Express — Planilla ${manifest.code}` });
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
    renderPrintManifest(shipments, { title: `Serka Express — Planilla ${viewingManifest.code}` });
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

function renderPrintManifest(shipments, { title }) {
  const deptLabel = departmentSelect.value || "Todos los departamentos";
  const cityLabel = citySelect.value || "Todas las ciudades";
  const [year, month, day] = dateInput.value.split("-");
  const dateLabel = `${day}/${month}/${year}`;
  const subtitle = viewingManifest ? "" : `<div>${deptLabel} &middot; ${cityLabel}</div>`;

  printManifest.innerHTML = `
    <div class="manifest-doc">
      <div class="manifest-doc-header">
        <div>
          <div class="manifest-doc-title">${title}</div>
          ${subtitle}
        </div>
        <div class="manifest-doc-meta">
          <div><strong>Fecha:</strong> ${dateLabel}</div>
          <div><strong>Total de envíos:</strong> ${shipments.length}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Destinatario</th>
            <th>Dirección</th>
            <th>Tel</th>
            <th>Destino</th>
            <th>Pago</th>
            <th>Monto</th>
            <th>Firma</th>
          </tr>
        </thead>
        <tbody>
          ${shipments
            .map(
              (s) => `
            <tr>
              <td>${s.code}</td>
              <td>${s.recipient_name}</td>
              <td>${s.recipient_address || "-"}</td>
              <td>${s.recipient_phone || "-"}</td>
              <td>${s.destination || "-"}</td>
              <td>${s.payment_method || "-"}</td>
              <td>${formatMoney(s.total)}</td>
              <td></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      <div class="manifest-doc-footer">
        <div>Firma del repartidor</div>
        <div>Firma de recepción en base</div>
      </div>
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
