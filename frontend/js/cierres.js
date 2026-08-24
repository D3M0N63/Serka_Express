import { api, requireAuth, requireRole, initTopbar } from "./api.js";
import { formatDate, formatMoney } from "./status.js";
import { createPager } from "./pager.js";

requireAuth();
requireRole(["admin"]);
initTopbar();

const errorBanner = document.getElementById("error-banner");
const statsRow = document.getElementById("stats-row");
const body = document.getElementById("sessions-body");
const emptyState = document.getElementById("empty-state");
const pagerEl = document.getElementById("pager");
const periodLabel = document.getElementById("period-label");
const tabWeek = document.getElementById("tab-week");
const tabMonth = document.getElementById("tab-month");
const tabYear = document.getElementById("tab-year");
const tabAll = document.getElementById("tab-all");
const periodNavCard = document.getElementById("period-nav-card");
const prevBtn = document.getElementById("period-prev");
const nextBtn = document.getElementById("period-next");
const todayBtn = document.getElementById("period-today");

const pager = createPager(pagerEl, (page) => load(page));

let granularity = "month"; // "week" | "month" | "year" | "all"
let refDate = new Date();

// Rango [from, to] (Date) del periodo actual segun la granularidad, en
// horario local del navegador.
function getRange() {
  if (granularity === "week") {
    const day = refDate.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const from = new Date(refDate);
    from.setDate(refDate.getDate() + diffToMonday);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (granularity === "year") {
    const from = new Date(refDate.getFullYear(), 0, 1, 0, 0, 0);
    const to = new Date(refDate.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to };
  }
  // month
  const from = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0);
  const to = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function shiftPeriod(dir) {
  if (granularity === "week") refDate.setDate(refDate.getDate() + dir * 7);
  else if (granularity === "year") refDate.setFullYear(refDate.getFullYear() + dir);
  else refDate.setMonth(refDate.getMonth() + dir);
  load(1);
}

function updatePeriodLabel() {
  if (granularity === "all") {
    periodLabel.textContent = "Todos los cierres";
    return;
  }
  const { from, to } = getRange();
  if (granularity === "week") {
    const fmt = (d) => d.toLocaleDateString("es-PY", { day: "numeric", month: "short" });
    periodLabel.textContent = `Semana del ${fmt(from)} al ${fmt(to)} de ${to.getFullYear()}`;
  } else if (granularity === "year") {
    periodLabel.textContent = String(refDate.getFullYear());
  } else {
    const label = refDate.toLocaleDateString("es-PY", { month: "long", year: "numeric" });
    periodLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }
}

function setGranularity(g) {
  granularity = g;
  refDate = new Date();
  for (const [tab, key] of [[tabWeek, "week"], [tabMonth, "month"], [tabYear, "year"], [tabAll, "all"]]) {
    tab.classList.toggle("active", key === g);
  }
  periodNavCard.style.display = g === "all" ? "none" : "flex";
  load(1);
}

function renderStats(summary) {
  statsRow.innerHTML = `
    <div class="stat-card"><div class="num">${summary.session_count}</div><div class="label">Cierres</div></div>
    <div class="stat-card"><div class="num">${formatMoney(summary.total_expected)}</div><div class="label">Efectivo esperado</div></div>
    <div class="stat-card"><div class="num">${formatMoney(summary.total_counted)}</div><div class="label">Efectivo contado</div></div>
    <div class="stat-card"><div class="num">${formatMoney(summary.total_difference)}</div><div class="label">Diferencia total</div></div>
    <div class="stat-card"><div class="num">${formatMoney(summary.total_transfer)}</div><div class="label">Transferencias</div></div>
  `;
}

function renderTable(sessions) {
  body.innerHTML = "";
  emptyState.style.display = sessions.length ? "none" : "block";

  for (const s of sessions) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Sucursal"><strong>${s.opened_by_name || "-"}</strong></td>
      <td data-label="Apertura">${formatDate(s.opened_at)}</td>
      <td data-label="Cierre">${s.closed_at ? formatDate(s.closed_at) : "-"}</td>
      <td data-label="Inicial">${formatMoney(s.opening_amount)}</td>
      <td data-label="Esperado">${s.expected_amount != null ? formatMoney(s.expected_amount) : "-"}</td>
      <td data-label="Contado">${s.counted_amount != null ? formatMoney(s.counted_amount) : "-"}</td>
      <td data-label="Diferencia">${s.difference != null ? formatMoney(s.difference) : "-"}</td>
      <td data-label="Transferencias">${s.transfer_income != null ? formatMoney(s.transfer_income) : "-"}</td>
    `;
    body.appendChild(tr);
  }
}

async function load(page = 1) {
  errorBanner.style.display = "none";
  updatePeriodLabel();

  const params = new URLSearchParams({ page });
  if (granularity !== "all") {
    const { from, to } = getRange();
    params.set("from", from.toISOString());
    params.set("to", to.toISOString());
  }

  try {
    const { sessions, total, pageSize, summary } = await api(`/cash/sessions/all?${params.toString()}`);
    renderStats(summary);
    renderTable(sessions);
    pager.update({ page, total, pageSize });
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

tabWeek.addEventListener("click", () => setGranularity("week"));
tabMonth.addEventListener("click", () => setGranularity("month"));
tabYear.addEventListener("click", () => setGranularity("year"));
tabAll.addEventListener("click", () => setGranularity("all"));
prevBtn.addEventListener("click", () => shiftPeriod(-1));
nextBtn.addEventListener("click", () => shiftPeriod(1));
todayBtn.addEventListener("click", () => {
  refDate = new Date();
  load(1);
});

load().catch((err) => {
  console.error(err);
  emptyState.textContent = "No se pudieron cargar los cierres.";
  emptyState.style.display = "block";
});
