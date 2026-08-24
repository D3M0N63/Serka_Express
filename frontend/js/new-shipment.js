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

citiesList.innerHTML = PY_CITIES.map((c) => `<option value="${c}"></option>`).join("");

// Autocompletado de remitente/destinatario a partir del CI/RUC: a medida
// que se escribe, se muestran coincidencias (buscador tipo datalist); si
// el valor termina coincidiendo exactamente con un cliente registrado, se
// cargan sus datos. Si no hay coincidencia, se deja todo en blanco para
// completar a mano y aparece el botón para registrarlo como cliente nuevo.
function wireClientSection(prefix) {
  const dniInput = document.getElementById(`${prefix}_dni`);
  const nameInput = document.getElementById(`${prefix}_name`);
  const addressInput = document.getElementById(`${prefix}_address`);
  const phoneInput = document.getElementById(`${prefix}_phone`);
  const emailInput = document.getElementById(`${prefix}_email`);
  const saveBtn = document.getElementById(`save-${prefix}-client`);
  const datalist = document.getElementById(`${prefix}-clients-list`);

  let candidates = [];
  let searchTimer = null;

  function fillFromClient(client) {
    nameInput.value = client.name || "";
    addressInput.value = client.address || "";
    phoneInput.value = client.phone || "";
    emailInput.value = client.email || "";
    saveBtn.style.display = "none";
  }

  async function searchCandidates(term) {
    try {
      const { clients } = await api(`/clients?q=${encodeURIComponent(term)}`);
      candidates = clients;
      datalist.innerHTML = clients
        .filter((c) => c.dni)
        .map((c) => `<option value="${c.dni}">${c.name}</option>`)
        .join("");
    } catch (err) {
      console.error(err);
    }
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
    }
  }

  // Usado al cargar un envío existente para editar: solo decide si mostrar
  // el botón de "Guardar Cliente", sin pisar los datos ya cargados del envío.
  async function refreshButtonVisibility() {
    if (!dniInput.value.trim()) {
      saveBtn.style.display = "none";
      return;
    }
    const client = await findClient();
    saveBtn.style.display = client ? "none" : "inline-flex";
  }

  dniInput.addEventListener("blur", lookupAndFill);
  dniInput.addEventListener("input", () => {
    const term = dniInput.value.trim();
    clearTimeout(searchTimer);

    if (!term) {
      saveBtn.style.display = "none";
      datalist.innerHTML = "";
      candidates = [];
      return;
    }

    searchTimer = setTimeout(async () => {
      await searchCandidates(term);
      const exact = candidates.find((c) => c.dni === term);
      if (exact) fillFromClient(exact);
    }, 250);
  });

  saveBtn.addEventListener("click", async () => {
    const payload = {
      name: nameInput.value.trim(),
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
    originInput.value = s.origin || "";
    document.getElementById("destination").value = s.destination || "";
    costInput.value = s.cost || 0;
    document.getElementById("payment_method").value = s.payment_method || "Efectivo";
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
      document.getElementById("payment-lock-hint").style.display = "block";
      document.getElementById("package_type").disabled = true;
      quantityInput.disabled = true;
      originInput.disabled = true;
      document.getElementById("destination").disabled = true;
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
    origin: originInput.value.trim(),
    destination: document.getElementById("destination").value.trim(),
    cost: Math.round(Number(costInput.value)) || 0,
    payment_method: document.getElementById("payment_method").value,
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
