import { api, setSession, getToken } from "./api.js";

if (getToken()) {
  window.location.href = "dashboard.html";
}

const form = document.getElementById("login-form");
const errorBanner = document.getElementById("error-banner");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBanner.style.display = "none";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Ingresando...";

  try {
    const { token, user } = await api("/auth/login", {
      method: "POST",
      body: { username, password },
    });
    setSession(token, user);
    window.location.href = "dashboard.html";
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Ingresar";
  }
});
