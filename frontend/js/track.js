import { STATUS_ORDER, formatDate } from "./status.js";

const input = document.getElementById("track-input");
const btn = document.getElementById("track-btn");
const result = document.getElementById("result");

const params = new URLSearchParams(window.location.search);
const preset = params.get("code");
if (preset) {
  input.value = preset;
  search();
}

btn.addEventListener("click", search);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") search();
});

async function search() {
  const code = input.value.trim();
  if (!code) return;

  result.innerHTML = `<div class="card">Buscando...</div>`;

  try {
    const res = await fetch(`/api/track/${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) {
      result.innerHTML = `<div class="card">${data.error || "No se encontró el envío."}</div>`;
      return;
    }
    render(data.shipment);
  } catch {
    result.innerHTML = `<div class="card">Ocurrió un error al buscar el envío.</div>`;
  }
}

function render(s) {
  const isCancelled = s.status === "Cancelado";
  const currentIndex = STATUS_ORDER.indexOf(s.status);

  const steps = isCancelled
    ? [{ label: "Cancelado", active: true }]
    : STATUS_ORDER.map((st, i) => ({ label: st, active: i <= currentIndex }));

  result.innerHTML = `
    <div class="card" style="margin-bottom: 20px;">
      <div style="font-size:13px; color:var(--text-muted);">Código de envío</div>
      <div style="font-size:20px; font-weight:800; color:var(--navy-dark); margin-bottom:14px;">${s.code}</div>
      <div style="font-size:14px; color:var(--text-muted);">
        ${s.origin || "-"} &rarr; ${s.destination || "-"} &middot; ${s.package_type || "Paquete"}
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">Estado del envío</h2>
      <ul class="timeline">
        ${steps
          .map(
            (step) => `
          <li class="${step.active ? "active" : ""}">
            <div class="dot"></div>
            <div>
              <div class="tl-title">${step.label}</div>
              <div class="tl-sub">${step.active ? formatDate(s.updated_at) : "Pendiente"}</div>
            </div>
          </li>`
          )
          .join("")}
      </ul>
    </div>
  `;
}
