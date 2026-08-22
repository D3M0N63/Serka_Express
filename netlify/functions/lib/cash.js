import { sql } from "./db.js";

const MOVEMENT_TYPES = ["ingreso", "egreso"];
const PAGE_SIZE = 20;

async function getOpenSession() {
  const [session] = await sql`
    SELECT cs.*, opener.name AS opened_by_name
    FROM cash_sessions cs
    LEFT JOIN users opener ON opener.id = cs.opened_by
    WHERE cs.status = 'abierta'
    ORDER BY cs.opened_at DESC
    LIMIT 1
  `;
  return session || null;
}

async function getSummary(session) {
  // Se usa paid_at (momento real del cobro), no created_at: un envio
  // "A cobrar" puede crearse un dia y cobrarse recien durante esta caja.
  const [{ cash_income, transfer_income }] = await sql`
    SELECT
      COALESCE(SUM(total) FILTER (WHERE payment_method = 'Efectivo'), 0)::int AS cash_income,
      COALESCE(SUM(total) FILTER (WHERE payment_method = 'Transferencia'), 0)::int AS transfer_income
    FROM shipments
    WHERE paid_at >= ${session.opened_at}
      AND paid_at <= ${session.closed_at || new Date()}
  `;
  const [{ manual_income, manual_expense }] = await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'ingreso'), 0)::int AS manual_income,
      COALESCE(SUM(amount) FILTER (WHERE type = 'egreso'), 0)::int AS manual_expense
    FROM cash_movements WHERE session_id = ${session.id}
  `;
  const movements = await sql`
    SELECT cm.*, u.name AS created_by_name FROM cash_movements cm
    LEFT JOIN users u ON u.id = cm.created_by
    WHERE cm.session_id = ${session.id}
    ORDER BY cm.created_at DESC
  `;
  // El "esperado" para el cierre fisico de caja solo cuenta dinero en
  // efectivo real (billetes/monedas); las transferencias no estan en el
  // cajon y se muestran aparte, solo informativo.
  const expected = session.opening_amount + cash_income + manual_income - manual_expense;

  return {
    cashIncome: cash_income,
    transferIncome: transfer_income,
    manualIncome: manual_income,
    manualExpense: manual_expense,
    expected,
    movements,
  };
}

export async function getCurrentSession() {
  const session = await getOpenSession();
  if (!session) return { status: 200, data: { session: null } };
  const summary = await getSummary(session);
  return { status: 200, data: { session, summary } };
}

export async function openSession(body, user) {
  const existing = await getOpenSession();
  if (existing) {
    return { status: 409, data: { error: "Ya hay una caja abierta" } };
  }
  const openingAmount = Math.round(Number(body.opening_amount)) || 0;
  const [session] = await sql`
    INSERT INTO cash_sessions (opening_amount, opened_by, status)
    VALUES (${openingAmount}, ${user.id}, 'abierta')
    RETURNING *
  `;
  return { status: 201, data: { session } };
}

export async function addMovement(body, user) {
  const type = body.type;
  if (!MOVEMENT_TYPES.includes(type)) {
    return { status: 400, data: { error: `Tipo invalido. Use uno de: ${MOVEMENT_TYPES.join(", ")}` } };
  }
  const amount = Math.round(Number(body.amount)) || 0;
  if (amount <= 0) {
    return { status: 400, data: { error: "El monto debe ser mayor a cero" } };
  }
  const description = (body.description || "").trim();

  const session = await getOpenSession();
  if (!session) {
    return { status: 400, data: { error: "No hay una caja abierta" } };
  }

  await sql`
    INSERT INTO cash_movements (session_id, type, amount, description, created_by)
    VALUES (${session.id}, ${type}, ${amount}, ${description || null}, ${user.id})
  `;

  const summary = await getSummary(session);
  return { status: 201, data: { session, summary } };
}

export async function closeSession(body, user) {
  const session = await getOpenSession();
  if (!session) {
    return { status: 400, data: { error: "No hay una caja abierta" } };
  }

  const countedAmount = Math.round(Number(body.counted_amount)) || 0;
  const notes = (body.notes || "").trim();
  const summary = await getSummary(session);
  const difference = countedAmount - summary.expected;

  const [closed] = await sql`
    UPDATE cash_sessions SET
      status = 'cerrada',
      expected_amount = ${summary.expected},
      counted_amount = ${countedAmount},
      difference = ${difference},
      transfer_income = ${summary.transferIncome},
      notes = ${notes || null},
      closed_by = ${user.id},
      closed_at = now()
    WHERE id = ${session.id}
    RETURNING *
  `;
  return { status: 200, data: { session: closed } };
}

export async function listSessions(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await sql`
    SELECT cs.*, COUNT(*) OVER()::int AS total_count,
      opener.name AS opened_by_name, closer.name AS closed_by_name
    FROM cash_sessions cs
    LEFT JOIN users opener ON opener.id = cs.opened_by
    LEFT JOIN users closer ON closer.id = cs.closed_by
    ORDER BY cs.opened_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `;

  const total = rows[0]?.total_count ?? 0;
  const sessions = rows.map(({ total_count, ...rest }) => rest);
  return { status: 200, data: { sessions, total, page, pageSize: PAGE_SIZE } };
}
