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

const IDLE_MESSAGE = "Busca por código, nombre o CI/RUC para ver los envíos.";
const NO_RESULTS_MESSAGE = "No se encontraron envíos con ese criterio.";

const pager = createPager(pagerEl, (page) => search(page));

let debounceTimer = null;
let currentPage = 1;

function showIdle() {
  statsRow.innerHTML = "";
  tbody.innerHTML = "";
  pagerEl.style.display = "none";
  emptyState.textContent = IDLE_MESSAGE;
  emptyState.style.display = "block";
}

async function search(page = 1) {
  const q = searchInput.value.trim();
  if (!q) {
    showIdle();
    return;
  }

  currentPage = page;
  try {
    const { shipments, stats, total, pageSize } = await api(
      `/shipments?q=${encodeURIComponent(q)}&page=${page}`
    );
    renderStats(statsRow, stats);
    emptyState.textContent = NO_RESULTS_MESSAGE;
    renderShipmentsTable({ tbody, emptyState, shipments, onChange: () => search(currentPage) });
    pager.update({ page, total, pageSize });
  } catch (err) {
    console.error(err);
    emptyState.textContent = "No se pudieron cargar los envíos.";
    emptyState.style.display = "block";
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => search(1), 300);
});

showIdle();
