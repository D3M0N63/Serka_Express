import { api, requireAuth, requireRole, initTopbar } from "./api.js";
import { PY_CITIES } from "./py-cities.js";

requireAuth();
requireRole(["admin"]);
initTopbar();

const form = document.getElementById("user-form");
const errorBanner = document.getElementById("error-banner");
const formTitle = document.getElementById("form-title");
const saveBtn = document.getElementById("save-btn");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const passwordHint = document.getElementById("password-hint");
const roleSelect = document.getElementById("role");
const parentField = document.getElementById("parent-field");
const parentSelect = document.getElementById("parent_id");
const cityInput = document.getElementById("city");
const citiesList = document.getElementById("py-cities");

citiesList.innerHTML = PY_CITIES.map((c) => `<option value="${c}"></option>`).join("");

const params = new URLSearchParams(window.location.search);
const editId = params.get("id");

if (editId) {
  formTitle.textContent = "Editar Usuario";
  saveBtn.textContent = "Guardar Cambios";
  passwordInput.removeAttribute("required");
  passwordHint.textContent = "Dejá en blanco para mantener la contraseña actual.";
} else {
  passwordInput.setAttribute("required", "true");
  passwordHint.textContent = "";
}

function syncParentFieldVisibility() {
  parentField.style.display = roleSelect.value === "repartidor" ? "" : "none";
  parentSelect.required = roleSelect.value === "repartidor";
}

async function loadSucursales(selectedId) {
  try {
    const { users } = await api("/users?role=sucursal");
    parentSelect.innerHTML =
      `<option value="">Selecciona una sucursal...</option>` +
      users.map((u) => `<option value="${u.id}">${u.name} (${u.username})</option>`).join("");
    if (selectedId) parentSelect.value = selectedId;
  } catch (err) {
    console.error(err);
  }
}

async function loadForEdit(id) {
  try {
    const { user } = await api(`/users/${encodeURIComponent(id)}`);
    usernameInput.value = user.username;
    usernameInput.readOnly = true;
    document.getElementById("name").value = user.name || "";
    roleSelect.value = user.role;
    cityInput.value = user.city || "";
    syncParentFieldVisibility();
    if (user.role === "repartidor") await loadSucursales(user.parent_id);
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

roleSelect.addEventListener("change", () => {
  syncParentFieldVisibility();
  if (roleSelect.value === "repartidor" && parentSelect.options.length <= 1) loadSucursales();
});

syncParentFieldVisibility();
if (roleSelect.value === "repartidor") loadSucursales();
if (editId) loadForEdit(editId);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBanner.style.display = "none";

  const payload = {
    username: usernameInput.value.trim(),
    name: document.getElementById("name").value.trim(),
    role: roleSelect.value,
    parent_id: roleSelect.value === "repartidor" ? parentSelect.value : null,
    city: cityInput.value.trim(),
  };
  if (passwordInput.value) payload.password = passwordInput.value;

  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  try {
    if (editId) {
      await api(`/users/${encodeURIComponent(editId)}`, { method: "PUT", body: payload });
    } else {
      await api("/users", { method: "POST", body: payload });
    }
    window.location.href = "usuarios.html";
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
    saveBtn.disabled = false;
    saveBtn.textContent = editId ? "Guardar Cambios" : "Guardar Usuario";
  }
});
