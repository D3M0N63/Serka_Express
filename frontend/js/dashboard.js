import { api, requireAuth, initTopbar } from "./api.js";
import { renderStats, renderShipmentsTable } from "./shipments-table.js";
import { createPager } from "./pager.js";

requireAuth();
initTopbar();

const tbody = document.getElementById("shipments-body");
const emptyState = document.getElementById("empty-state");
const statsRow = document.getElementById("stats-row");
const searchInput = document.getElementById("search");
const pagerEl = document.getElementById("pager");
const cajaCerradaBanner = document.getElementById("caja-cerrada-banner");
const newShipmentLink = document.getElementById("new-shipment-link");

const pager = createPager(pagerEl, (page) => load(page));

let debounceTimer = null;
let currentPage = 1;

async function load(page = 1) {
  currentPage = page;
  const q = searchInput.value.trim();
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  const { shipments, stats, total, pageSize, cajaAbierta } = await api(`/shipments?mine=1&page=${page}${qs}`);
  renderStats(statsRow, stats);
  renderShipmentsTable({ tbody, emptyState, shipments, onChange: () => load(currentPage) });
  pager.update({ page, total, pageSize });

  cajaCerradaBanner.style.display = cajaAbierta === false ? "block" : "none";
  newShipmentLink.classList.toggle("btn-disabled", cajaAbierta === false);
  if (cajaAbierta === false && !shipments.length) {
    emptyState.textContent = "La caja está cerrada, no hay envíos para mostrar.";
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => load(1), 300);
});

load().catch((err) => {
  console.error(err);
  emptyState.textContent = "No se pudieron cargar tus envíos.";
  emptyState.style.display = "block";
});
