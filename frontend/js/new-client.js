import { api, requireAuth, initTopbar } from "./api.js";

requireAuth();
initTopbar();

const form = document.getElementById("client-form");
const errorBanner = document.getElementById("error-banner");
const formTitle = document.getElementById("form-title");
const saveBtn = document.getElementById("save-btn");

const params = new URLSearchParams(window.location.search);
const editId = params.get("id");

if (editId) {
  formTitle.textContent = "Editar Cliente";
  saveBtn.textContent = "Guardar Cambios";
  loadForEdit(editId);
}

async function loadForEdit(id) {
  try {
    const { client } = await api(`/clients/${encodeURIComponent(id)}`);
    document.getElementById("name").value = client.name || "";
    document.getElementById("dni").value = client.dni || "";
    document.getElementById("address").value = client.address || "";
    document.getElementById("phone").value = client.phone || "";
    document.getElementById("email").value = client.email || "";
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBanner.style.display = "none";

  const payload = {
    name: document.getElementById("name").value.trim(),
    dni: document.getElementById("dni").value.trim(),
    address: document.getElementById("address").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    email: document.getElementById("email").value.trim(),
  };

  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  try {
    if (editId) {
      await api(`/clients/${encodeURIComponent(editId)}`, { method: "PUT", body: payload });
    } else {
      await api("/clients", { method: "POST", body: payload });
    }
    window.location.href = "clients.html";
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
    saveBtn.disabled = false;
    saveBtn.textContent = editId ? "Guardar Cambios" : "Guardar Cliente";
  }
});
