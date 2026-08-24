const TOKEN_KEY = "globalex_token";
const USER_KEY = "globalex_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
  }
}

// Para pantallas restringidas por rol (ej. Caja: Admin/Sucursal; Usuarios:
// solo Admin). Debe llamarse despues de requireAuth().
export function requireRole(roles) {
  const user = getUser();
  if (!user || !roles.includes(user.role)) {
    window.location.href = "dashboard.html";
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearSession();
    window.location.href = "index.html";
    throw new Error("No autorizado");
  }

  if (!res.ok) {
    throw new Error(data.error || "Error en la solicitud");
  }

  return data;
}

export function initTopbar() {
  const user = getUser();
  const nameEl = document.querySelector("[data-user-name]");
  const avatarEl = document.querySelector("[data-user-avatar]");
  if (user) {
    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) avatarEl.textContent = user.name.slice(0, 2).toUpperCase();
    applyRoleVisibility(user.role);
  }
  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      window.location.href = "index.html";
    });
  }
}

// Un Repartidor no tiene caja propia (la suya la maneja su Sucursal), y la
// gestion de usuarios es exclusiva de Admin.
function applyRoleVisibility(role) {
  const cajaLink = document.querySelector('.subnav-link[href="caja.html"]');
  if (cajaLink && role === "repartidor") cajaLink.style.display = "none";

  const usersLink = document.querySelector('.subnav-link[href="usuarios.html"]');
  if (usersLink && role !== "admin") usersLink.style.display = "none";

  const closuresLink = document.querySelector('.subnav-link[href="cierres.html"]');
  if (closuresLink && role !== "admin") closuresLink.style.display = "none";
}
