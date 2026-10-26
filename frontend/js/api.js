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

  if (res.status === 401 && path !== "/auth/login") {
    clearSession();
    window.location.href = "index.html";
    throw new Error("No autorizado");
  }

  if (!res.ok) {
    throw new Error(data.error || "Error en la solicitud");
  }

  return data;
}

const ICON = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// Navegacion principal. `roles` limita la visibilidad (el backend sigue
// siendo quien autoriza); sin `roles` el item es visible para todos.
const NAV = [
  { href: "dashboard.html", label: "Inicio", group: "Operación", tab: true, icon: ICON('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>') },
  { href: "shipments.html", label: "Envíos", group: "Operación", tab: true, icon: ICON('<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>') },
  { href: "planilla.html", label: "Planilla", group: "Operación", tab: true, icon: ICON('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>') },
  { href: "clients.html", label: "Clientes", group: "Operación", icon: ICON('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>') },
  { href: "pagar.html", label: "Pagar", group: "Finanzas", icon: ICON('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>') },
  { href: "credito.html", label: "Crédito", group: "Finanzas", roles: ["admin"], icon: ICON('<path d="M3 7h18v12H3zM7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M3 13h18"/>') },
  { href: "caja.html", label: "Caja", group: "Finanzas", tab: true, notRoles: ["repartidor"], icon: ICON('<path d="M4 8h16l-1.5 11h-13Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>') },
  { href: "cierres.html", label: "Cierres", group: "Administración", roles: ["admin"], icon: ICON('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8.5 12 2.5 2.5 4.5-5"/>') },
  { href: "usuarios.html", label: "Usuarios", group: "Administración", roles: ["admin"], icon: ICON('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>') },
];

const LOGO = `<svg class="logo-mark" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M37 3C25 3 12 9 4 18C12 27 25 33 37 33" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/><path d="M30 8C21 8 11 12.5 6 18C11 23.5 21 28 30 28" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/><path d="M23 13C17 13 10 15.5 8 18C10 20.5 17 23 23 23" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg>`;
const ICON_MORE = ICON('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>');
const ICON_OUT = ICON('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>');

const ROLE_LABEL = { admin: "Administrador", sucursal: "Sucursal", repartidor: "Repartidor" };

function visibleNav(role) {
  return NAV.filter((n) => (!n.roles || n.roles.includes(role)) && (!n.notRoles || !n.notRoles.includes(role)));
}

function buildShell(user) {
  const current = document.body.dataset.nav || "";
  const items = visibleNav(user?.role);
  const link = (n, cls) =>
    `<a href="${n.href}" class="${cls}${n.href === current ? " active" : ""}"${n.href === current ? ' aria-current="page"' : ""}>${n.icon}<span>${n.label}</span></a>`;

  const groups = [...new Set(items.map((n) => n.group))];
  const sidebarNav = groups
    .map((g) => `<div class="nav-group"><div class="nav-group-label">${g}</div>${items.filter((n) => n.group === g).map((n) => link(n, "nav-link")).join("")}</div>`)
    .join("");

  const tabs = items.filter((n) => n.tab);
  const rest = items.filter((n) => !n.tab);
  const restActive = rest.some((n) => n.href === current) || current === "profile.html";

  const shell = document.createElement("div");
  shell.id = "app-shell";
  shell.innerHTML = `
    <aside class="sidebar" aria-label="Navegación principal">
      <a href="dashboard.html" class="brand">
        ${LOGO}
        <span><span class="logo">SERKA <span class="express">EXPRESS</span></span><span class="logo-sub">Courrier · Todo a tiempo</span></span>
      </a>
      <nav class="nav">${sidebarNav}</nav>
      <div class="sidebar-user">
        <a href="profile.html" class="user-chip" title="Mi perfil">
          <span class="avatar" data-user-avatar>AE</span>
          <span class="user-meta"><span class="name" data-user-name>Usuario</span><span class="role" data-user-role></span></span>
        </a>
        <button type="button" class="icon-btn" data-logout title="Cerrar sesión" aria-label="Cerrar sesión">${ICON_OUT}</button>
      </div>
    </aside>
    <header class="mobilebar">
      <a href="dashboard.html" class="brand">${LOGO}<span class="logo">SERKA <span class="express">EXPRESS</span></span></a>
      <a href="profile.html" class="avatar" data-user-avatar aria-label="Mi perfil">AE</a>
    </header>
    <nav class="tabbar" aria-label="Navegación">
      ${tabs.map((n) => link(n, "tab-link")).join("")}
      ${rest.length ? `<button type="button" class="tab-link${restActive ? " active" : ""}" data-more aria-haspopup="dialog">${ICON_MORE}<span>Más</span></button>` : ""}
    </nav>
    <div class="sheet-backdrop" data-sheet hidden>
      <div class="sheet" role="dialog" aria-label="Más secciones">
        <div class="sheet-handle"></div>
        <div class="sheet-grid">${rest.map((n) => link(n, "sheet-link")).join("")}
          <a href="profile.html" class="sheet-link${current === "profile.html" ? " active" : ""}">${ICON('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')}<span>Mi perfil</span></a>
        </div>
        <button type="button" class="btn btn-outline sheet-logout" data-logout>${ICON_OUT} Cerrar sesión</button>
      </div>
    </div>`;
  document.body.prepend(shell);
  document.body.classList.add("has-shell");

  const sheet = shell.querySelector("[data-sheet]");
  const moreBtn = shell.querySelector("[data-more]");
  const closeSheet = () => { sheet.hidden = true; };
  if (moreBtn) moreBtn.addEventListener("click", () => { sheet.hidden = false; });
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
}

export function initTopbar() {
  const user = getUser();
  if (!document.getElementById("app-shell")) {
    buildShell(user);
    document.querySelectorAll("[data-logout]").forEach((btn) =>
      btn.addEventListener("click", () => {
        clearSession();
        window.location.href = "index.html";
      })
    );
  }
  if (user) {
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user.name));
    document.querySelectorAll("[data-user-avatar]").forEach((el) => (el.textContent = user.name.slice(0, 2).toUpperCase()));
    document.querySelectorAll("[data-user-role]").forEach((el) => (el.textContent = ROLE_LABEL[user.role] || user.role));
  }
}
