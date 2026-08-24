import { api, requireAuth, requireRole, initTopbar } from "./api.js";
import { formatDate, formatMoney } from "./status.js";
import { createPager } from "./pager.js";

requireAuth();
requireRole(["admin", "sucursal"]);
initTopbar();

const content = document.getElementById("caja-content");
const errorBanner = document.getElementById("error-banner");
const historyBody = document.getElementById("history-body");
const historyEmpty = document.getElementById("history-empty");
const historyPagerEl = document.getElementById("history-pager");

const historyPager = createPager(historyPagerEl, (page) => loadHistory(page));

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

async function loadCurrent() {
  try {
    const { session, summary } = await api("/cash/current");
    if (session) {
      renderOpenSession(session, summary);
    } else {
      renderClosedState();
    }
  } catch (err) {
    showError(err.message);
  }
}

function renderClosedState() {
  content.innerHTML = `
    <div class="card">
      <h2 class="card-title">Abrir Caja</h2>
      <div class="field">
        <label for="opening-amount">Monto inicial (Gs.)</label>
        <input type="number" id="opening-amount" min="0" step="1" placeholder="0" />
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-dark" id="open-btn">Abrir Caja</button>
      </div>
    </div>
  `;

  document.getElementById("open-btn").addEventListener("click", async (e) => {
    errorBanner.style.display = "none";
    const btn = e.currentTarget;
    const amount = Math.round(Number(document.getElementById("opening-amount").value)) || 0;
    btn.disabled = true;
    btn.textContent = "Abriendo...";
    try {
      await api("/cash/open", { method: "POST", body: { opening_amount: amount } });
      await loadCurrent();
      await loadHistory(1);
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = "Abrir Caja";
    }
  });
}

function renderOpenSession(session, summary) {
  const netManual = summary.manualIncome - summary.manualExpense;

  content.innerHTML = `
    <div class="card detail-hero">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow">Caja abierta desde</div>
          <div class="hero-code">${formatDate(session.opened_at)}</div>
          <div class="hero-route">Abierta por ${session.opened_by_name || "-"}</div>
        </div>
        <span class="badge badge-registrado hero-badge">Abierta</span>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card"><div class="num">${formatMoney(session.opening_amount)}</div><div class="label">Monto inicial</div></div>
      <div class="stat-card"><div class="num">${formatMoney(summary.cashIncome)}</div><div class="label">Cobros en efectivo</div></div>
      <div class="stat-card"><div class="num">${formatMoney(summary.transferIncome)}</div><div class="label">Cobros por transferencia</div></div>
      <div class="stat-card"><div class="num">${formatMoney(netManual)}</div><div class="label">Movimientos manuales</div></div>
      <div class="stat-card"><div class="num">${formatMoney(summary.expected)}</div><div class="label">Total esperado (efectivo)</div></div>
    </div>
    <p class="hint" style="text-align:left; margin-top:-10px; margin-bottom:20px;">
      El total esperado para el cierre solo incluye efectivo (billetes/monedas físicas). Las transferencias se muestran aparte, no van en el cajón.
    </p>

    <div class="grid-2">
      <div class="card">
        <h2 class="card-title">Agregar Movimiento</h2>
        <div class="field">
          <label for="mov-type">Tipo</label>
          <select id="mov-type">
            <option value="egreso">Egreso (gasto)</option>
            <option value="ingreso">Ingreso</option>
          </select>
        </div>
        <div class="field">
          <label for="mov-amount">Monto (Gs.)</label>
          <input type="number" id="mov-amount" min="0" step="1" placeholder="0" />
        </div>
        <div class="field">
          <label for="mov-desc">Descripción</label>
          <input type="text" id="mov-desc" placeholder="Ej: Combustible, papelería..." />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" id="add-mov-btn">Agregar</button>
        </div>

        <div class="ticket-rule" style="margin-top:20px;"></div>
        <div id="movements-list" style="margin-top:14px;"></div>
      </div>

      <div class="card">
        <h2 class="card-title">Cerrar Caja</h2>
        <div class="field readonly">
          <label>Monto esperado</label>
          <input type="text" readonly value="${formatMoney(summary.expected)}" />
        </div>
        <div class="field">
          <label for="counted-amount">Monto contado (Gs.)</label>
          <input type="number" id="counted-amount" min="0" step="1" placeholder="0" />
        </div>
        <div class="field">
          <label for="close-notes">Notas (opcional)</label>
          <input type="text" id="close-notes" placeholder="Observaciones del cierre" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-danger" id="close-btn">Cerrar Caja</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:24px;">
      <h2 class="card-title">Envíos Cobrados en esta Caja</h2>
      <div id="shipment-income-list"></div>
    </div>
  `;

  renderMovements(summary.movements);
  renderShipmentIncome(summary.shipmentIncome);

  document.getElementById("add-mov-btn").addEventListener("click", async (e) => {
    errorBanner.style.display = "none";
    const btn = e.currentTarget;
    const type = document.getElementById("mov-type").value;
    const amount = Math.round(Number(document.getElementById("mov-amount").value)) || 0;
    const description = document.getElementById("mov-desc").value.trim();
    btn.disabled = true;
    btn.textContent = "Agregando...";
    try {
      await api("/cash/movements", { method: "POST", body: { type, amount, description } });
      await loadCurrent();
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = "Agregar";
    }
  });

  document.getElementById("close-btn").addEventListener("click", async (e) => {
    errorBanner.style.display = "none";
    const counted = Math.round(Number(document.getElementById("counted-amount").value)) || 0;
    if (!confirm(`¿Confirmás el cierre de caja con ${formatMoney(counted)} contados?`)) return;
    const notes = document.getElementById("close-notes").value.trim();
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Cerrando...";
    try {
      await api("/cash/close", { method: "POST", body: { counted_amount: counted, notes } });
      await loadCurrent();
      await loadHistory(1);
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = "Cerrar Caja";
    }
  });
}

function renderShipmentIncome(shipmentIncome) {
  const list = document.getElementById("shipment-income-list");
  if (!shipmentIncome.length) {
    list.innerHTML = `<p class="hint" style="text-align:left;">Todavía no se cobró ningún envío en esta caja.</p>`;
    return;
  }
  list.innerHTML = shipmentIncome
    .map(
      (s) => `
    <div class="info-row">
      <span class="info-label">
        <span class="badge ${s.payment_method === "Efectivo" ? "badge-entregado" : "badge-reparto"}">${s.payment_method}</span>
        <a href="detail.html?code=${encodeURIComponent(s.code)}">${s.code}</a>
        &middot; ${s.sender_name} &rarr; ${s.recipient_name}
      </span>
      <span class="info-value">${formatMoney(s.total)}</span>
    </div>
  `
    )
    .join("");
}

function renderMovements(movements) {
  const list = document.getElementById("movements-list");
  if (!movements.length) {
    list.innerHTML = `<p class="hint" style="text-align:left;">Todavía no hay movimientos en esta caja.</p>`;
    return;
  }
  list.innerHTML = movements
    .map(
      (m) => `
    <div class="info-row">
      <span class="info-label">
        <span class="badge ${m.type === "ingreso" ? "badge-entregado" : "badge-cancelado"}">${m.type}</span>
        ${m.description || ""}
      </span>
      <span class="info-value">${formatMoney(m.amount)}</span>
    </div>
  `
    )
    .join("");
}

async function loadHistory(page = 1) {
  try {
    const { sessions, total, pageSize } = await api(`/cash/sessions?page=${page}`);
    historyBody.innerHTML = "";
    historyEmpty.style.display = sessions.length ? "none" : "block";
    for (const s of sessions) {
      const tr = document.createElement("tr");
      const isOpen = s.status === "abierta";
      tr.innerHTML = `
        <td data-label="Apertura">${formatDate(s.opened_at)}</td>
        <td data-label="Cierre">${s.closed_at ? formatDate(s.closed_at) : "-"}</td>
        <td data-label="Inicial">${formatMoney(s.opening_amount)}</td>
        <td data-label="Esperado">${s.expected_amount != null ? formatMoney(s.expected_amount) : "-"}</td>
        <td data-label="Contado">${s.counted_amount != null ? formatMoney(s.counted_amount) : "-"}</td>
        <td data-label="Diferencia">${s.difference != null ? formatMoney(s.difference) : "-"}</td>
        <td data-label="Transferencias">${s.transfer_income != null ? formatMoney(s.transfer_income) : "-"}</td>
        <td data-label="Estado"><span class="badge ${isOpen ? "badge-registrado" : "badge-entregado"}">${s.status}</span></td>
      `;
      historyBody.appendChild(tr);
    }
    historyPager.update({ page, total, pageSize });
  } catch (err) {
    showError(err.message);
  }
}

loadCurrent();
loadHistory();
