import { api, requireAuth, initTopbar, getUser } from "./api.js";
import { PY_CITIES } from "./py-cities.js";

requireAuth();
initTopbar();

const form = document.getElementById("shipment-form");
const errorBanner = document.getElementById("error-banner");
const pendingCode = document.getElementById("pending-code");
const formTitle = document.getElementById("form-title");
const costInput = document.getElementById("cost");
const quantityInput = document.getElementById("package_quantity");
const totalInput = document.getElementById("total");
const saveBtn = document.getElementById("save-btn");
const originInput = document.getElementById("origin");
const citiesList = document.getElementById("py-cities");
const paymentMethodSelect = document.getElementById("payment_method");
const packageValueField = document.getElementById("package_value_field");
const packageValueInput = document.getElementById("package_value");

citiesList.innerHTML = PY_CITIES.map((c) => `<option value="${c}"></option>`).join("");

// El valor del envío solo importa cuando el pago es "A cobrar": es el
// monto que el repartidor tiene que cobrarle al destinatario al entregar,
// y se muestra en la boleta impresa para esos casos.
function syncPackageValueVisibility() {
  packageValueField.style.display = paymentMethodSelect.value === "A cobrar" ? "" : "none";
}
paymentMethodSelect.addEventListener("change", syncPackageValueVisibility);

// Autocompletado de remitente/destinatario a partir del CI/RUC: a medida
// que se escribe, se muestran coincidencias (buscador tipo datalist); si
// el valor termina coincidiendo exactamente con un cliente registrado, se
// cargan sus datos. Si no hay coincidencia, se deja todo en blanco para
// completar a mano y aparece el botón para registrarlo como cliente nuevo.
function wireClientSection(prefix) {
  const dniInput = document.getElementById(`${prefix}_dni`);
  const nameInput = document.getElementById(`${prefix}_name`);
  const typeInput = document.getElementById(`${prefix}_type`);
  const addressInput = document.getElementById(`${prefix}_address`);
  const phoneInput = document.getElementById(`${prefix}_phone`);
  const emailInput = document.getElementById(`${prefix}_email`);
  const saveBtn = document.getElementById(`save-${prefix}-client`);

  let candidates = [];
  let searchTimer = null;
  const registryCache = new Map();

  function fillFromClient(client) {
    nameInput.value = client.name || "";
    typeInput.value = client.type || "Casual";
    addressInput.value = client.address || "";
    phoneInput.value = client.phone || "";
    emailInput.value = client.email || "";
    saveBtn.style.display = "none";
  }

  async function searchCandidates(term) {
    try {
      const { clients } = await api(`/clients?q=${encodeURIComponent(term)}`);
      candidates = clients;
    } catch (err) {
      console.error(err);
      candidates = [];
    }
    return candidates;
  }

  async function findClient() {
    const dni = dniInput.value.trim();
    if (!dni) return null;
    try {
      const { clients } = await api(`/clients?dni=${encodeURIComponent(dni)}`);
      return clients[0] || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  // Al salir del campo CI/RUC: si existe un cliente con ese CI/RUC, se
  // completan sus datos; si no, se deja todo para llenar a mano.
  async function lookupAndFill() {
    if (!dniInput.value.trim()) {
      saveBtn.style.display = "none";
      return;
    }
    const client = await findClient();
    if (client) {
      fillFromClient(client);
    } else {
      saveBtn.style.display = "inline-flex";
      await fillFromRegistry();
    }
  }

  // Si el CI/RUC no es un cliente registrado, se consulta el padrón de
  // contribuyentes (Tu RUC) para sugerir el nombre. No pisa un nombre que
  // ya se haya escrito, y si la consulta falla se sigue a mano.
  async function fillFromRegistry() {
    const dni = dniInput.value.trim();
    if (!dni || nameInput.value.trim()) return;
    nameInput.placeholder = "Consultando padrón...";
    try {
      const contribuyente = await fetchRegistry(dni);
      if (contribuyente && dniInput.value.trim() === dni && !nameInput.value.trim()) {
        nameInput.value = contribuyente.razonSocial;
        typeInput.value = contribuyente.esPersonaJuridica ? "Empresa" : "Casual";
      }
    } finally {
      nameInput.placeholder = "";
    }
  }

  // La consulta se guarda por CI/RUC: se dispara mientras se escribe (en
  // paralelo con la búsqueda de clientes) y al salir del campo ya está
  // lista. Si falla o no hay resultado se resuelve en null.
  function fetchRegistry(dni) {
    if (!registryCache.has(dni)) {
      registryCache.set(
        dni,
        api(`/contribuyente?ruc=${encodeURIComponent(dni)}`)
          .then(({ contribuyente }) => contribuyente)
          .catch(() => null)
      );
    }
    return registryCache.get(dni);
  }

  // Usado al cargar un envío existente para editar: solo decide si mostrar
  // el botón de "Guardar Cliente", sin pisar los datos ya cargados del envío.
  async function refreshButtonVisibility() {
    if (!dniInput.value.trim()) {
      saveBtn.style.display = "none";
      return;
    }
    const client = await findClient();
    if (client) typeInput.value = client.type || "Casual";
    saveBtn.style.display = client ? "none" : "inline-flex";
  }

  dniInput.addEventListener("blur", lookupAndFill);
  // Selector de sugerencias bajo el campo CI/RUC: clientes registrados que
  // coinciden y, cuando responde, el contribuyente del padrón.
  const box = document.createElement("div");
  box.className = "suggest";
  box.setAttribute("role", "listbox");
  box.hidden = true;
  dniInput.parentElement.classList.add("has-suggest");
  dniInput.parentElement.appendChild(box);
  dniInput.setAttribute("autocomplete", "off");

  let items = [];
  let active = -1;

  function esc(text) {
    const d = document.createElement("div");
    d.textContent = text ?? "";
    return d.innerHTML;
  }

  function closeBox() {
    box.hidden = true;
    active = -1;
  }

  function renderBox(pending) {
    const rows = items.map(
      (it, i) => `
        <button type="button" role="option" class="suggest-item${i === active ? " active" : ""}" data-i="${i}">
          <span class="suggest-main">${esc(it.title)}</span>
          <span class="suggest-sub">${esc(it.sub)}</span>
          <span class="suggest-tag ${it.kind}">${it.kind === "registry" ? "Padrón" : "Cliente"}</span>
        </button>`
    );
    if (pending) rows.push('<div class="suggest-note">Consultando padrón...</div>');
    box.innerHTML = rows.join("");
    box.hidden = rows.length === 0;
  }

  function choose(it) {
    if (it.kind === "client") {
      dniInput.value = it.client.dni || dniInput.value;
      fillFromClient(it.client);
    } else {
      nameInput.value = it.c.razonSocial;
      typeInput.value = it.c.esPersonaJuridica ? "Empresa" : "Casual";
      saveBtn.style.display = "inline-flex";
    }
    closeBox();
  }

  // mousedown (no click) y preventDefault: evita que el campo pierda el foco
  // antes de elegir.
  box.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const btn = e.target.closest(".suggest-item");
    if (btn) choose(items[Number(btn.dataset.i)]);
  });

  dniInput.addEventListener("keydown", (e) => {
    if (box.hidden || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      renderBox(false);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      closeBox();
    }
  });
  dniInput.addEventListener("focusout", closeBox);

  dniInput.addEventListener("input", () => {
    const term = dniInput.value.trim();
    clearTimeout(searchTimer);

    if (!term) {
      saveBtn.style.display = "none";
      candidates = [];
      items = [];
      closeBox();
      return;
    }

    searchTimer = setTimeout(async () => {
      const wantRegistry = term.length >= 5;
      const registry = wantRegistry ? fetchRegistry(term) : Promise.resolve(null);
      const stale = () => dniInput.value.trim() !== term;

      items = [];
      if (wantRegistry) renderBox(true);

      // Cada fuente pinta apenas responde: el padrón no espera a la búsqueda
      // local (que puede tardar en un arranque en frío) ni al revés.
      let registryDone = !wantRegistry;
      let clientItems = [];
      let registryItem = null;
      const paint = (pending) => {
        const listed = (registryItem && clientItems.some((it) => (it.client.dni || "").replace(/-\d$/, "") === String(registryItem.c.ruc).replace(/-\d$/, "")));
        items = registryItem && !listed ? [...clientItems, registryItem] : clientItems;
        active = -1;
        renderBox(pending);
      };

      const clientsDone = searchCandidates(term).then((clients) => {
        if (stale()) return;
        clientItems = clients
          .filter((c) => c.dni)
          .map((c) => ({ kind: "client", client: c, title: c.name, sub: c.dni }));
        paint(wantRegistry && !registryDone);
        const exact = candidates.find((cl) => cl.dni === term);
        if (exact) fillFromClient(exact);
      });
      const registryP = registry.then((c) => {
        registryDone = true;
        if (stale()) return;
        if (c) registryItem = { kind: "registry", c, title: c.razonSocial, sub: c.ruc };
        paint(false);
      });
      await Promise.all([clientsDone, registryP]);
    }, 250);
  });

  saveBtn.addEventListener("click", async () => {
    const payload = {
      name: nameInput.value.trim(),
      type: typeInput.value,
      dni: dniInput.value.trim(),
      address: addressInput.value.trim(),
      phone: phoneInput.value.trim(),
      email: emailInput.value.trim(),
    };
    if (!payload.name) {
      alert("Completa el nombre antes de guardar el cliente.");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando...";
    try {
      await api("/clients", { method: "POST", body: payload });
      saveBtn.style.display = "none";
    } catch (err) {
      alert(err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "+ Guardar Cliente";
    }
  });

  return { refreshButtonVisibility };
}

const senderClient = wireClientSection("sender");
const recipientClient = wireClientSection("recipient");

const params = new URLSearchParams(window.location.search);
const editCode = params.get("code");

if (editCode) {
  formTitle.childNodes[0].textContent = "Editar Envío ";
  pendingCode.textContent = `- ${editCode}`;
  saveBtn.textContent = "Guardar Cambios";
  loadForEdit(editCode);
} else {
  const currentUser = getUser();
  if (currentUser?.city) {
    originInput.value = currentUser.city;
  }
  checkCajaAbierta();
}

// Solo bloquea el registro de NUEVOS envios; editar uno existente no
// requiere caja abierta.
async function checkCajaAbierta() {
  try {
    const { session } = await api("/cash/current");
    if (!session) {
      errorBanner.textContent = "La caja está cerrada. Abrí la caja para registrar nuevos envíos.";
      errorBanner.style.display = "block";
      saveBtn.disabled = true;
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadForEdit(code) {
  try {
    const { shipment: s } = await api(`/shipments/${encodeURIComponent(code)}`);
    document.getElementById("sender_name").value = s.sender_name || "";
    document.getElementById("sender_dni").value = s.sender_dni || "";
    document.getElementById("sender_address").value = s.sender_address || "";
    document.getElementById("sender_phone").value = s.sender_phone || "";
    document.getElementById("sender_email").value = s.sender_email || "";
    document.getElementById("recipient_name").value = s.recipient_name || "";
    document.getElementById("recipient_dni").value = s.recipient_dni || "";
    document.getElementById("recipient_address").value = s.recipient_address || "";
    document.getElementById("recipient_phone").value = s.recipient_phone || "";
    document.getElementById("recipient_email").value = s.recipient_email || "";
    document.getElementById("package_type").value = s.package_type || "Paquete";
    document.getElementById("package_quantity").value = s.package_quantity || 1;
    document.getElementById("observation").value = s.observation || "";
    originInput.value = s.origin || "";
    document.getElementById("destination").value = s.destination || "";
    document.getElementById("destination_responsible").value = s.destination_responsible || "";
    costInput.value = s.cost || 0;
    document.getElementById("payment_method").value = s.payment_method || "Efectivo";
    packageValueInput.value = s.package_value || 0;
    syncPackageValueVisibility();
    document.getElementById("payment_reference").value = s.payment_reference || "";
    syncTotal();
    senderClient.refreshButtonVisibility();
    recipientClient.refreshButtonVisibility();

    // Un usuario que no es Admin solo puede editar Remitente y
    // Destinatario; el resto queda bloqueado (el backend tambien lo aplica
    // aunque se fuerce el form).
    if (getUser()?.role !== "admin") {
      costInput.disabled = true;
      document.getElementById("payment_method").disabled = true;
      document.getElementById("payment_reference").disabled = true;
      packageValueInput.disabled = true;
      document.getElementById("payment-lock-hint").style.display = "block";
      document.getElementById("package_type").disabled = true;
      quantityInput.disabled = true;
      document.getElementById("observation").disabled = true;
      originInput.disabled = true;
      document.getElementById("destination").disabled = true;
      document.getElementById("destination_responsible").disabled = true;
      document.getElementById("details-lock-hint").style.display = "block";
      document.getElementById("origin-dest-lock-hint").style.display = "block";
    }
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
  }
}

function syncTotal() {
  const cost = Math.round(Number(costInput.value)) || 0;
  const quantity = Math.max(1, Math.round(Number(quantityInput.value)) || 1);
  totalInput.value = `₲ ${(cost * quantity).toLocaleString("es-PY")}`;
}
costInput.addEventListener("input", syncTotal);
quantityInput.addEventListener("input", syncTotal);
syncTotal();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBanner.style.display = "none";

  const payload = {
    sender_name: document.getElementById("sender_name").value.trim(),
    sender_dni: document.getElementById("sender_dni").value.trim(),
    sender_address: document.getElementById("sender_address").value.trim(),
    sender_phone: document.getElementById("sender_phone").value.trim(),
    sender_email: document.getElementById("sender_email").value.trim(),
    recipient_name: document.getElementById("recipient_name").value.trim(),
    recipient_dni: document.getElementById("recipient_dni").value.trim(),
    recipient_address: document.getElementById("recipient_address").value.trim(),
    recipient_phone: document.getElementById("recipient_phone").value.trim(),
    recipient_email: document.getElementById("recipient_email").value.trim(),
    package_type: document.getElementById("package_type").value,
    package_quantity: Math.max(1, Math.round(Number(document.getElementById("package_quantity").value)) || 1),
    observation: document.getElementById("observation").value.trim(),
    origin: originInput.value.trim(),
    destination: document.getElementById("destination").value.trim(),
    destination_responsible: document.getElementById("destination_responsible").value.trim(),
    cost: Math.round(Number(costInput.value)) || 0,
    payment_method: paymentMethodSelect.value,
    // El valor solo aplica a "A cobrar" (lo que el repartidor cobra al
    // entregar); para cualquier otro pago se guarda en 0.
    package_value: paymentMethodSelect.value === "A cobrar" ? Math.round(Number(packageValueInput.value)) || 0 : 0,
    payment_reference: document.getElementById("payment_reference").value.trim(),
  };

  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  try {
    const { shipment } = editCode
      ? await api(`/shipments/${encodeURIComponent(editCode)}`, { method: "PUT", body: payload })
      : await api("/shipments", { method: "POST", body: payload });
    window.location.href = `detail.html?code=${encodeURIComponent(shipment.code)}&${editCode ? "updated" : "created"}=1`;
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
    saveBtn.disabled = false;
    saveBtn.textContent = editCode ? "Guardar Cambios" : "Guardar Registro de Envío";
  }
});
