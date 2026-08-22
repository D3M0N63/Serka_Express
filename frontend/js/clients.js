import { api, requireAuth, initTopbar } from "./api.js";
import { createPager } from "./pager.js";

requireAuth();
initTopbar();

const body = document.getElementById("clients-body");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search");
const pagerEl = document.getElementById("pager");

const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

const pager = createPager(pagerEl, (page) => load(page));

let debounceTimer = null;
let currentPage = 1;

function renderTable(clients) {
  body.innerHTML = "";
  emptyState.style.display = clients.length ? "none" : "block";

  for (const c of clients) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Nombre"><strong>${c.name}</strong></td>
      <td data-label="CI/RUC">${c.dni || "-"}</td>
      <td data-label="Dirección">${c.address || "-"}</td>
      <td data-label="Tel">${c.phone || "-"}</td>
      <td data-label="Correo">${c.email || "-"}</td>
      <td data-label="Acciones">
        <div class="row-actions">
          <button type="button" class="icon-btn edit-btn" title="Editar">${ICON_EDIT}</button>
          <button type="button" class="icon-btn danger delete-btn" title="Eliminar">${ICON_DELETE}</button>
        </div>
      </td>
    `;
    tr.querySelector(".edit-btn").addEventListener("click", () => {
      window.location.href = `new-client.html?id=${encodeURIComponent(c.id)}`;
    });
    tr.querySelector(".delete-btn").addEventListener("click", () => deleteClient(c));
    body.appendChild(tr);
  }
}

async function deleteClient(c) {
  if (!confirm(`¿Eliminar al cliente "${c.name}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/clients/${encodeURIComponent(c.id)}`, { method: "DELETE" });
    await load(currentPage);
  } catch (err) {
    alert(err.message);
  }
}

async function load(page = 1) {
  currentPage = page;
  const q = searchInput.value.trim();
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  const { clients, total, pageSize } = await api(`/clients?page=${page}${qs}`);
  renderTable(clients);
  pager.update({ page, total, pageSize });
}

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => load(1), 300);
});

load().catch((err) => {
  console.error(err);
  emptyState.textContent = "No se pudieron cargar los clientes.";
  emptyState.style.display = "block";
});
