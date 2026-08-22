import { api, requireAuth, initTopbar, getUser, setUser } from "./api.js";
import { PY_CITIES } from "./py-cities.js";

requireAuth();
initTopbar();

const usernameInput = document.getElementById("username");
const nameInput = document.getElementById("name");
const cityInput = document.getElementById("city");
const citiesList = document.getElementById("py-cities");
const form = document.getElementById("profile-form");
const errorBanner = document.getElementById("error-banner");
const successBanner = document.getElementById("success-banner");

citiesList.innerHTML = PY_CITIES.map((c) => `<option value="${c}"></option>`).join("");

const user = getUser();
if (user) {
  usernameInput.value = user.username;
  nameInput.value = user.name || "";
  cityInput.value = user.city || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBanner.style.display = "none";
  successBanner.style.display = "none";

  const saveBtn = document.getElementById("save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  try {
    const { user: updated } = await api("/auth/me", {
      method: "PATCH",
      body: { name: nameInput.value.trim(), city: cityInput.value.trim() },
    });
    setUser({ ...user, ...updated });
    successBanner.style.display = "block";
    initTopbar();
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar Cambios";
  }
});
