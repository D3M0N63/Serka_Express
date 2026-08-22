import { api, requireAuth, initTopbar } from "./api.js";
import { formatDate, formatMoney } from "./status.js";
import { createPager } from "./pager.js";

requireAuth();
initTopbar();

const body = document.getElementById("pending-body");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search");
const pagerEl = document.getElementById("pager");
const errorBanner = document.getElementById("error-banner");

const pager = createPager(pagerEl, (page) => load(page));

let debounceTimer = null;
let currentPage = 1;

function renderTable(shipments) {
  body.innerHTML = "";
  emptyState.style.display = shipments.length ? "none" : "block";

  for (const s of shipments) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Código"><strong>${s.code}</strong></td>
      <td data-label="Remitente">${s.sender_name}</td>
      <td data-label="Destinatario">${s.recipient_name}</td>
      <td data-label="Total">${formatMoney(s.total)}</td>
      <td data-label="Fecha">${formatDate(s.created_at)}</td>
      <td data-label="Cobrar">
        <div class="row-actions">
          <select class="collect-method">
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
          </select>
          <button type="button" class="btn btn-primary btn-sm collect-btn">Cobrar</button>
        </div>
      </td>
    `;
    tr.querySelector(".collect-btn").addEventListener("click", (e) => {
      const method = tr.querySelector(".collect-method").value;
      collect(s, method, e.currentTarget);
    });
    body.appendChild(tr);
  }
}

async function collect(s, method, btn) {
  if (!confirm(`¿Marcar el envío ${s.code} como cobrado por ${method}?`)) return;
  errorBanner.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Cobrando...";
  try {
    await api(`/shipments/${encodeURIComponent(s.code)}/collect`, {
      method: "POST",
      body: { payment_method: method },
    });
    await load(currentPage);
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Cobrar";
  }
}

async function load(page = 1) {
  currentPage = page;
  const q = searchInput.value.trim();
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  const { shipments, total, pageSize } = await api(`/shipments/pending-collection?page=${page}${qs}`);
  renderTable(shipments);
  pager.update({ page, total, pageSize });
}

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => load(1), 300);
});

load().catch((err) => {
  console.error(err);
  emptyState.textContent = "No se pudieron cargar las boletas pendientes.";
  emptyState.style.display = "block";
});
