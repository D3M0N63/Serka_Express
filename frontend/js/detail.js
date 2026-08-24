import { api, requireAuth, initTopbar, getUser } from "./api.js";
import { STATUS_ORDER, statusClass, formatDate, formatMoney } from "./status.js";

requireAuth();
initTopbar();

const params = new URLSearchParams(window.location.search);
const code = params.get("code");
const shouldPrint = params.get("print") === "1";

const content = document.getElementById("content");
const printLabel = document.getElementById("print-label");
const printEtiqueta = document.getElementById("print-etiqueta");
const printPageStyle = document.getElementById("print-page-style");
const detailCode = document.getElementById("detail-code");
const printBtn = document.getElementById("print-btn");
const printEtiquetaBtn = document.getElementById("print-etiqueta-btn");
const editBtn = document.getElementById("edit-btn");
const deleteBtn = document.getElementById("delete-btn");
const whatsappBtn = document.getElementById("whatsapp-btn");

if (getUser()?.role !== "admin") deleteBtn.style.display = "none";

let currentShipment = null;

const ICONS = {
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
};

if (!code) {
  content.innerHTML = `<div class="card">No se especificó un código de envío.</div>`;
} else {
  load();
}

// El ticket (80mm) y la etiqueta de bulto usan tamaños de hoja distintos
// en la misma pagina: antes de imprimir se cambia la clase del body y el
// contenido del <style id="print-page-style"> (que define el @page).
function setPrintMode(mode) {
  document.body.classList.remove("ticket-print-page", "label-print-page");
  document.body.classList.add(mode === "etiqueta" ? "label-print-page" : "ticket-print-page");
  printPageStyle.textContent =
    mode === "etiqueta" ? "@page { size: 100mm 55mm; margin: 0; }" : "@page { size: 80mm 260mm; margin: 0; }";
}

printBtn.addEventListener("click", () => {
  setPrintMode("ticket");
  window.print();
});

printEtiquetaBtn.addEventListener("click", () => {
  if (!currentShipment) return;
  renderEtiquetas(currentShipment);
  setPrintMode("etiqueta");
  window.print();
});

editBtn.addEventListener("click", () => {
  window.location.href = `new-shipment.html?code=${encodeURIComponent(code)}`;
});

deleteBtn.addEventListener("click", async () => {
  if (!confirm(`¿Eliminar el envío ${code}? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/shipments/${encodeURIComponent(code)}`, { method: "DELETE" });
    window.location.href = "dashboard.html";
  } catch (err) {
    alert(err.message);
  }
});

whatsappBtn.addEventListener("click", () => {
  if (currentShipment) openWhatsAppModal(currentShipment);
});

async function load() {
  try {
    const { shipment: s, history } = await api(`/shipments/${encodeURIComponent(code)}`);
    currentShipment = s;
    detailCode.textContent = s.code;
    render(s, history || []);
    if (shouldPrint) {
      setPrintMode("ticket");
      setTimeout(() => window.print(), 300);
    }
  } catch (err) {
    content.innerHTML = `<div class="card">${err.message}</div>`;
  }
}

// Espeja las reglas del flujo de estados que valida el backend
// (updateShipmentStatus): el selector solo aparece en dos casos.
// - Registrado -> Cancelado: exclusivo de Admin.
// - En reparto -> Entregado: para todos los usuarios (a En reparto solo se
//   llega via Planilla, nunca manualmente desde aca).
function nextStatusOptions(currentStatus, role) {
  if (currentStatus === "Registrado") return role === "admin" ? ["Cancelado"] : [];
  if (currentStatus === "En reparto") return ["Entregado"];
  return []; // En transito, Entregado y Cancelado no tienen transicion manual
}

function render(s, history) {
  const isCancelled = s.status === "Cancelado";
  const currentIndex = STATUS_ORDER.indexOf(s.status);
  const steps = isCancelled
    ? [{ label: "Cancelado", active: true }]
    : STATUS_ORDER.map((st, i) => ({ label: st, active: i <= currentIndex }));

  // Ultimo registro de historial para cada estado (quien lo marco y cuando),
  // para mostrarlo junto a cada paso de la linea de tiempo.
  const historyByStatus = new Map();
  for (const h of history) historyByStatus.set(h.status, h);

  content.innerHTML = `
    <div class="card detail-hero">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow">Código de envío</div>
          <div class="hero-code">${s.code}</div>
          <div class="hero-route">${s.origin || "-"} &rarr; ${s.destination || "-"} &middot; ${s.package_type || "Paquete"}</div>
        </div>
        <span class="badge ${statusClass(s.status)} hero-badge">${s.status}</span>
      </div>

      <div class="hero-divider"></div>

      <ul class="timeline hero-timeline">
        ${steps
          .map((step) => {
            const record = historyByStatus.get(step.label);
            const receivedSuffix = step.label === "Entregado" && s.received_by ? ` · Recibió: ${s.received_by}` : "";
            const sub = step.active
              ? record
                ? `${formatDate(record.changed_at)}${record.changed_by_name ? ` · ${record.changed_by_name}` : ""}${receivedSuffix}`
                : `${formatDate(s.updated_at)}${receivedSuffix}`
              : "Pendiente";
            return `
          <li class="${step.active ? "active" : ""}">
            <div class="dot"></div>
            <div>
              <div class="tl-title">${step.label}</div>
              <div class="tl-sub">${sub}</div>
            </div>
          </li>`;
          })
          .join("")}
      </ul>

      <div class="hero-divider no-print"></div>

      ${renderStatusUpdate(s)}
    </div>

    <div class="grid-2">
      <div class="card">
        <h2 class="card-title">${ICONS.user} Datos del Remitente</h2>
        <div class="info-list">
          ${infoRow("Nombre", s.sender_name)}
          ${infoRow("CI/RUC", s.sender_dni)}
          ${infoRow("Dirección", s.sender_address)}
          ${infoRow("Tel", s.sender_phone)}
          ${infoRow("Correo", s.sender_email)}
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">${ICONS.user} Datos del Destinatario</h2>
        <div class="info-list">
          ${infoRow("Nombre", s.recipient_name)}
          ${infoRow("CI/RUC", s.recipient_dni)}
          ${infoRow("Dirección", s.recipient_address)}
          ${infoRow("Tel", s.recipient_phone)}
          ${infoRow("Correo", s.recipient_email)}
        </div>
      </div>
    </div>

    <div class="grid-3">
      <div class="card">
        <h2 class="card-title">${ICONS.box} Detalles del Envío</h2>
        <div class="info-list">
          ${infoRow("Tipo", s.package_type)}
          ${infoRow("Cantidad", s.package_quantity)}
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">${ICONS.pin} Origen y Destino</h2>
        <div class="info-list">
          ${infoRow("Origen", s.origin)}
          ${infoRow("Destino", s.destination)}
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">${ICONS.card} Servicio y Pago</h2>
        <div class="info-list">
          ${infoRow("Costo", formatMoney(s.cost))}
          ${infoRow("Total", formatMoney(s.total))}
          ${infoRow("Pago", s.payment_method)}
          ${infoRow("Referencia", s.payment_reference)}
          ${infoRow("Registrado", formatDate(s.created_at))}
        </div>
      </div>
    </div>
  `;

  renderTicket(s);

  const saveBtn = document.getElementById("status-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const newStatus = document.getElementById("status-select").value;
      if (newStatus === "Entregado") {
        openDeliveryModal(s);
      } else {
        submitStatus(s.code, newStatus, {}, saveBtn, "Actualizar");
      }
    });
  }
}

// Envia el cambio de estado al backend y recarga el detalle. `extra` puede
// llevar received_by cuando el nuevo estado es Entregado.
async function submitStatus(code, newStatus, extra, triggerBtn, resetLabel) {
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = "Actualizando...";
  }
  try {
    await api(`/shipments/${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: { status: newStatus, ...extra },
    });
    await load();
  } catch (err) {
    alert(err.message);
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = resetLabel;
    }
  }
}

// Antes de marcar Entregado, pregunta quien recibio el envio: el
// Destinatario registrado (marca de una) u Otro (pide el nombre a mano).
function openDeliveryModal(s) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">¿Quién recibió el envío?</div>
      <div class="modal-options">
        <button type="button" class="modal-option" data-value="recipient">El Destinatario</button>
        <button type="button" class="modal-option" data-value="other">Otro</button>
      </div>
      <div class="field" id="received-by-field" style="display:none; margin-bottom:0;">
        <label for="received-by-input">Nombre de quien recibió</label>
        <input type="text" id="received-by-input" placeholder="Nombre completo" autocomplete="off" />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="modal-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="modal-confirm" disabled>Actualizar estado</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const recipientBtn = overlay.querySelector('[data-value="recipient"]');
  const otherBtn = overlay.querySelector('[data-value="other"]');
  const field = overlay.querySelector("#received-by-field");
  const input = overlay.querySelector("#received-by-input");
  const confirmBtn = overlay.querySelector("#modal-confirm");
  const cancelBtn = overlay.querySelector("#modal-cancel");

  const close = () => overlay.remove();
  const confirm = (receivedBy) => {
    close();
    submitStatus(s.code, "Entregado", { received_by: receivedBy }, null, null);
  };

  // El Destinatario ya es un dato conocido: elegirlo alcanza para
  // confirmar de una, sin pasos extra.
  recipientBtn.addEventListener("click", () => confirm(s.recipient_name));

  otherBtn.addEventListener("click", () => {
    otherBtn.classList.add("active");
    recipientBtn.classList.remove("active");
    field.style.display = "block";
    input.focus();
    confirmBtn.disabled = !input.value.trim();
  });

  input.addEventListener("input", () => {
    confirmBtn.disabled = !input.value.trim();
  });

  confirmBtn.addEventListener("click", () => confirm(input.value.trim()));
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

// Pregunta a quien enviar el ticket (Remitente o Destinatario). Cada
// opcion alcanza para confirmar de una, no hace falta escribir nada.
function openWhatsAppModal(s) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">¿A quién enviar el ticket?</div>
      <div class="modal-options">
        <button type="button" class="modal-option" data-value="sender">Remitente</button>
        <button type="button" class="modal-option" data-value="recipient">Destinatario</button>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="whatsapp-modal-cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('[data-value="sender"]').addEventListener("click", () => {
    close();
    sendTicketViaWhatsApp(s, "sender");
  });
  overlay.querySelector('[data-value="recipient"]').addEventListener("click", () => {
    close();
    sendTicketViaWhatsApp(s, "recipient");
  });
  overlay.querySelector("#whatsapp-modal-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

// wa.me exige el numero completo en formato internacional, sin "+" ni
// espacios (ej. 595981234567). Los telefonos se cargan en formato local
// paraguayo (09XXXXXXXX), asi que se reemplaza el 0 inicial por 595.
function normalizeWhatsAppPhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("595")) return digits;
  if (digits.startsWith("0")) return `595${digits.slice(1)}`;
  return `595${digits}`;
}

// Nombre de archivo seguro a partir del nombre de la persona (sin tildes,
// espacios como guiones, solo caracteres validos para un archivo).
const ACCENTS = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", ü: "u" };
function slugifyFilename(name) {
  const ascii = (name || "")
    .toLowerCase()
    .split("")
    .map((ch) => ACCENTS[ch] || ch)
    .join("");
  const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "cliente";
}

// La fuente "Courier" que trae jsPDF por defecto no tiene el glifo de ₲
// (sale como caracteres sueltos/espaciados): en el PDF se usa "Gs." en su
// lugar, que si es parte de la fuente estandar. En pantalla/impresion
// normal (formatMoney) el ₲ se ve bien porque ahi renderiza el navegador.
function formatMoneyForPdf(value) {
  const n = Math.round(Number(value)) || 0;
  return `Gs. ${n.toLocaleString("es-PY")}`;
}

// WhatsApp no permite adjuntar un archivo y preseleccionar el contacto al
// mismo tiempo: se prioriza abrir el chat con el numero correcto (con un
// mensaje ya escrito) y se descarga el PDF aparte para que el usuario lo
// adjunte el con un toque.
function sendTicketViaWhatsApp(s, target) {
  const name = target === "sender" ? s.sender_name : s.recipient_name;
  const rawPhone = target === "sender" ? s.sender_phone : s.recipient_phone;
  const phone = normalizeWhatsAppPhone(rawPhone);

  if (!phone) {
    alert(`${target === "sender" ? "El remitente" : "El destinatario"} no tiene un teléfono registrado.`);
    return;
  }

  const doc = buildTicketPdfDoc(s);
  doc.save(`ticket-${s.code}-${slugifyFilename(name)}.pdf`);

  const message = `Hola ${name || ""}, te comparto el ticket de tu envío ${s.code} de Serka Express. Te acabamos de descargar el PDF: adjuntalo en este chat.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
}

// Arma el PDF del ticket (sin campos de firma) dibujando directamente con
// jsPDF, replicando el mismo contenido que el ticket impreso.
function buildTicketPdfDoc(s) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: [80, 230] });
  const marginX = 4;
  const width = 72;
  const rightX = 80 - marginX;
  let y = 8;

  function rule() {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setLineWidth(0.15);
    doc.line(marginX, y, rightX, y);
    doc.setLineDashPattern([], 0);
    y += 4;
  }

  function section(title) {
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.text(title, marginX, y);
    y += 4;
  }

  function row(label, value) {
    const text = value === undefined || value === null || value === "" ? "-" : String(value);
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.text(label, marginX, y);
    doc.setFont("courier", "normal");
    const labelWidth = doc.getTextWidth(label);
    if (doc.getTextWidth(text) <= width - labelWidth - 2) {
      doc.text(text, rightX, y, { align: "right" });
      y += 4;
    } else {
      y += 4;
      for (const line of doc.splitTextToSize(text, width)) {
        doc.text(line, marginX, y);
        y += 4;
      }
    }
  }

  function numberedItem(n, text) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6);
    for (const line of doc.splitTextToSize(`${n}. ${text}`, width)) {
      doc.text(line, marginX, y);
      y += 2.6;
    }
    y += 0.8;
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(13);
  doc.text("* SERKA EXPRESS *", 40, y, { align: "center" });
  y += 5;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text("COURRIER . TODO A TIEMPO", 40, y, { align: "center" });
  y += 6;

  doc.setFontSize(8);
  doc.text(formatDate(s.created_at), marginX, y);
  doc.text(`Envío: ${s.code}`, rightX, y, { align: "right" });
  y += 3;
  rule();

  section("REMITENTE");
  row("Nombre", s.sender_name);
  row("CI/RUC", s.sender_dni);
  row("Dirección", s.sender_address);
  row("Tel", s.sender_phone);
  rule();

  section("DESTINATARIO");
  row("Nombre", s.recipient_name);
  row("CI/RUC", s.recipient_dni);
  row("Dirección", s.recipient_address);
  row("Tel", s.recipient_phone);
  rule();

  section("ENVÍO");
  row("Tipo", s.package_type);
  row("Cantidad", s.package_quantity);
  row("Origen", s.origin);
  row("Destino", s.destination);
  row("Estado", s.status);
  row("Pago", s.payment_method);
  rule();

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text("A PAGAR", marginX, y);
  doc.text(formatMoneyForPdf(s.total), rightX, y, { align: "right" });
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(marginX, y, rightX, y);
  y += 6;

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text("¡Gracias por elegir Serka Express!", 40, y, { align: "center" });
  y += 6;
  rule();

  const terms = [
    "En ningún caso la empresa será responsable por daños indirectos, especiales, incidentales.",
    "Es de exclusiva responsabilidad del remitente cualquier tipo de mercadería decomisada por las autoridades competentes por no contar con la documentación legal correspondiente o que infrinja alguna disposición legal, No transportamos, Explosivos, inflamables, baterías, armas de fuego.",
    "La empresa no se hace responsable bajo ningún concepto por efectivo que no haya sido declarado en el mismo momento del envío.",
    "Los envíos pueden tener retrasos por motivos de inclemencias del tiempo, cierres de rutas, problemas mecánicos y otros inconvenientes presentados.",
    "Todo tipo de encomienda frágil que no se encuentre, a criterio de la empresa, debidamente embalada para su transporte seguro, la empresa no se responsabilizará por ningún daño causado por la naturaleza del envío.",
  ];
  terms.forEach((text, i) => numberedItem(i + 1, text));

  doc.setFont("courier", "bold");
  doc.setFontSize(6);
  doc.text("RECLAMOS", marginX, y);
  y += 2.6;
  numberedItem(1, "Si desea hacer un reclamo por envío o pedir la boleta de levante con la firma, debe solicitarlo en el plazo de 30 (TREINTA) días desde la fecha de depósito.");

  doc.setFont("courier", "italic");
  doc.setFontSize(6);
  for (const line of doc.splitTextToSize(
    "* El remitente se declara conocedor de las presentes Condiciones de transporte y expresa su total conformidad con la misma.",
    width
  )) {
    doc.text(line, marginX, y);
    y += 2.6;
  }

  return doc;
}

// Solo se muestra el selector si hay alguna transicion manual valida desde
// el estado actual (ver nextStatusOptions); si no hay ninguna (ej. estado
// final, o Registrado sin ser Admin), no se muestra nada.
function renderStatusUpdate(s) {
  const role = getUser()?.role;
  const options = nextStatusOptions(s.status, role);
  if (options.length === 0) return "";

  return `
    <div class="status-update no-print">
      <label for="status-select">Actualizar estado</label>
      <select id="status-select">
        ${options.map((st) => `<option value="${st}">${st}</option>`).join("")}
      </select>
      <button class="btn btn-primary" id="status-save">Actualizar</button>
    </div>
  `;
}

function infoRow(label, value, tone) {
  const hasValue = value !== undefined && value !== null && value !== "";
  const cls = hasValue ? tone || "" : "muted";
  return `
    <div class="info-row">
      <span class="info-label">${label}</span>
      <span class="info-value ${cls}">${hasValue ? value : "-"}</span>
    </div>
  `;
}

// Etiqueta de bulto (una por paquete: si package_quantity es 4, salen 4
// etiquetas numeradas 1/4..4/4, cada una en su propia hoja de 100x55mm),
// con codigo de barras del codigo de envío.
function renderEtiquetas(s) {
  const total = Math.max(1, Math.round(Number(s.package_quantity)) || 1);
  const dateLabel = new Date(s.created_at).toLocaleDateString("es-PY");

  printEtiqueta.innerHTML = Array.from({ length: total }, (_, i) => i + 1)
    .map(
      (n) => `
    <div class="etiqueta">
      <div class="etq-content">
        <div class="etq-header">
          <div class="etq-brand">SERKA EXPRESS</div>
          <div class="etq-page">${n}/${total}</div>
        </div>
        <div class="etq-row"><strong>Guía:</strong> ${s.code} &nbsp; <strong>Fecha:</strong> ${dateLabel}</div>
        <div class="etq-row"><strong>Monto:</strong> ${formatMoney(s.total)}</div>
        <div class="etq-row"><strong>Origen:</strong> ${(s.origin || "-").toUpperCase()}</div>
        <div class="etq-row"><strong>Remitente:</strong> ${s.sender_name || "-"}</div>
        <div class="etq-row"><strong>CI/RUC:</strong> ${s.sender_dni || "-"}</div>
        <div class="etq-spacer"></div>
        <div class="etq-row"><strong>Destinatario:</strong> ${s.recipient_name || "-"}</div>
        <div class="etq-row"><strong>CI/RUC:</strong> ${s.recipient_dni || "-"}</div>
        <div class="etq-spacer"></div>
        <div class="etq-row"><strong>Destino:</strong> ${(s.destination || "-").toUpperCase()}</div>
        <div class="etq-bottom-row">
          <span>${s.code}-${n}/${total}</span>
          <span>${(s.payment_method || "-").toUpperCase()}</span>
        </div>
        <svg class="etq-barcode" id="etq-barcode-${n}"></svg>
      </div>
    </div>
  `
    )
    .join("");

  for (let n = 1; n <= total; n++) {
    JsBarcode(`#etq-barcode-${n}`, s.code, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 40,
    });
  }
}

// Ticket imprimible (fuente monoespaciada, secciones en mayúscula, filas
// etiqueta/valor), oculto en pantalla y visible solo al imprimir (ver
// @media print en style.css). Se imprimen 4 copias seguidas, alternando
// si llevan o no los campos de firma: sin firma / con firma / sin firma /
// con firma. Cada copia sale en su propia hoja (ver .ticket + page-break
// en style.css).
function renderTicket(s) {
  const copies = [false, true, false, true];
  printLabel.innerHTML = copies.map((withSignatures) => buildTicketHtml(s, withSignatures)).join("");
}

function buildTicketHtml(s, withSignatures) {
  const signatures = withSignatures
    ? `
      <div class="ticket-signatures">
        <div class="sig-top">
          <div class="sig-line"></div>
          <div class="sig-label">Firma</div>
        </div>
        <div class="sig-bottom">
          <div class="sig-col">
            <div class="sig-line"></div>
            <div class="sig-label">Aclaración</div>
          </div>
          <div class="sig-col">
            <div class="sig-line"></div>
            <div class="sig-label">CI/Ruc</div>
          </div>
        </div>
      </div>
    `
    : "";

  return `
    <div class="ticket">
      <div class="ticket-header">
        <div class="ticket-title">* SERKA EXPRESS *</div>
        <div class="ticket-sub">COURRIER &middot; TODO A TIEMPO</div>
      </div>
      <div class="ticket-meta">
        <span>${formatDate(s.created_at)}</span>
        <span>Envío: ${s.code}</span>
      </div>
      <div class="ticket-rule"></div>
      <div class="ticket-section">REMITENTE</div>
      ${ticketRow("Nombre", s.sender_name)}
      ${ticketRow("CI/RUC", s.sender_dni)}
      ${ticketRow("Dirección", s.sender_address)}
      ${ticketRow("Tel", s.sender_phone)}
      <div class="ticket-rule"></div>
      <div class="ticket-section">DESTINATARIO</div>
      ${ticketRow("Nombre", s.recipient_name)}
      ${ticketRow("CI/RUC", s.recipient_dni)}
      ${ticketRow("Dirección", s.recipient_address)}
      ${ticketRow("Tel", s.recipient_phone)}
      <div class="ticket-rule"></div>
      <div class="ticket-section">ENVÍO</div>
      ${ticketRow("Tipo", s.package_type)}
      ${ticketRow("Cantidad", s.package_quantity)}
      ${ticketRow("Origen", s.origin)}
      ${ticketRow("Destino", s.destination)}
      ${ticketRow("Estado", s.status)}
      ${ticketRow("Pago", s.payment_method)}
      <div class="ticket-rule"></div>
      <div class="ticket-total">
        <span>A PAGAR</span>
        <span>${formatMoney(s.total)}</span>
      </div>
      <div class="ticket-rule-double"></div>
      <div class="ticket-footer">¡Gracias por elegir Serka Express!</div>
      ${signatures}
      <div class="ticket-terms">
        <div class="ticket-rule"></div>
        <ol class="terms-list">
          <li>En ningún caso la empresa será responsable por daños indirectos, especiales, incidentales.</li>
          <li>Es de exclusiva responsabilidad del remitente cualquier tipo de mercadería decomisada por las autoridades competentes por no contar con la documentación legal correspondiente o que infrinja alguna disposición legal, No transportamos, Explosivos, inflamables, baterías, armas de fuego.</li>
          <li>La empresa no se hace responsable bajo ningún concepto por efectivo que no haya sido declarado en el mismo momento del envío.</li>
          <li>Los envíos pueden tener retrasos por motivos de inclemencias del tiempo, cierres de rutas, problemas mecánicos y otros inconvenientes presentados.</li>
          <li>Todo tipo de encomienda frágil que no se encuentre, a criterio de la empresa, debidamente embalada para su transporte seguro, la empresa no se responsabilizará por ningún daño causado por la naturaleza del envío.</li>
        </ol>
        <div class="terms-subtitle">RECLAMOS</div>
        <ol class="terms-list">
          <li>Si desea hacer un reclamo por envío o pedir la boleta de levante con la firma, debe solicitarlo en el plazo de 30 (TREINTA) días desde la fecha de depósito.</li>
        </ol>
        <div class="terms-note">* El remitente se declara conocedor de las presentes Condiciones de transporte y expresa su total conformidad con la misma.</div>
      </div>
    </div>
  `;
}

function ticketRow(label, value) {
  return `<div class="ticket-row"><span>${label}</span><span>${value && value !== "" ? value : "-"}</span></div>`;
}
