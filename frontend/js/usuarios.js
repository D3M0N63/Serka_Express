import { api, requireAuth, requireRole, initTopbar, getUser } from "./api.js";

requireAuth();
requireRole(["admin"]);
initTopbar();

const body = document.getElementById("users-body");
const emptyState = document.getElementById("empty-state");
const errorBanner = document.getElementById("error-banner");

const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

const ROLE_LABELS = { admin: "Administrador", sucursal: "Sucursal", repartidor: "Repartidor" };

function renderTable(users) {
  const currentUser = getUser();
  body.innerHTML = "";
  emptyState.style.display = users.length ? "none" : "block";

  for (const u of users) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Usuario"><strong>${u.username}</strong></td>
      <td data-label="Nombre">${u.name}</td>
      <td data-label="Rol">${ROLE_LABELS[u.role] || u.role}</td>
      <td data-label="Sucursal">${u.parent_name || "-"}</td>
      <td data-label="Ciudad">${u.city || "-"}</td>
      <td data-label="Acciones">
        <div class="row-actions">
          <button type="button" class="icon-btn edit-btn" title="Editar">${ICON_EDIT}</button>
          <button type="button" class="icon-btn danger delete-btn" title="Eliminar" ${
            u.id === currentUser?.id ? "disabled" : ""
          }>${ICON_DELETE}</button>
        </div>
      </td>
    `;
    tr.querySelector(".edit-btn").addEventListener("click", () => {
      window.location.href = `new-usuario.html?id=${encodeURIComponent(u.id)}`;
    });
    const deleteBtn = tr.querySelector(".delete-btn");
    if (u.id !== currentUser?.id) {
      deleteBtn.addEventListener("click", () => deleteUser(u));
    }
    body.appendChild(tr);
  }
}

async function deleteUser(u) {
  if (!confirm(`¿Eliminar al usuario "${u.name}" (${u.username})? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/users/${encodeURIComponent(u.id)}`, { method: "DELETE" });
    await load();
  } catch (err) {
    alert(err.message);
  }
}

async function load() {
  errorBanner.style.display = "none";
  try {
    const { users } = await api("/users");
    renderTable(users);
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

load().catch((err) => {
  console.error(err);
  emptyState.textContent = "No se pudieron cargar los usuarios.";
  emptyState.style.display = "block";
});
