import { api, requireAuth, initTopbar } from "./api.js";

requireAuth();
initTopbar();

const form = document.getElementById("shipment-form");
const errorBanner = document.getElementById("error-banner");
const pendingCode = document.getElementById("pending-code");
const costInput = document.getElementById("cost");
const totalInput = document.getElementById("total");
const printBtn = document.getElementById("print-btn");

let savedCode = null;

function syncTotal() {
  const cost = Number(costInput.value) || 0;
  totalInput.value = `$${cost.toFixed(2)}`;
}
costInput.addEventListener("input", syncTotal);
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
    package_content: document.getElementById("package_content").value.trim(),
    package_value: document.getElementById("package_value").value,
    origin: document.getElementById("origin").value.trim(),
    destination: document.getElementById("destination").value.trim(),
    pickup_at_home: document.getElementById("pickup_at_home").checked,
    cost: costInput.value,
    total: (Number(costInput.value) || 0).toFixed(2),
    payment_method: document.getElementById("payment_method").value,
    payment_reference: document.getElementById("payment_reference").value.trim(),
  };

  const saveBtn = document.getElementById("save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando...";

  try {
    const { shipment } = await api("/shipments", { method: "POST", body: payload });
    savedCode = shipment.code;
    pendingCode.textContent = `- ${shipment.code}`;
    window.location.href = `detail.html?code=${encodeURIComponent(shipment.code)}&created=1`;
  } catch (err) {
    errorBanner.textContent = err.message;
    errorBanner.style.display = "block";
    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar Registro de Envío";
  }
});

printBtn.addEventListener("click", () => {
  if (!savedCode) {
    errorBanner.textContent = "Guarda el envío primero para poder imprimir la etiqueta.";
    errorBanner.style.display = "block";
    return;
  }
  window.location.href = `detail.html?code=${encodeURIComponent(savedCode)}&print=1`;
});
