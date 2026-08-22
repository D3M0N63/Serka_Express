import { sql } from "./db.js";

const STATUSES = ["Registrado", "En transito", "En reparto", "Entregado", "Cancelado"];

export async function createShipment(body, user) {
  if (!body.sender_name || !body.recipient_name) {
    return { status: 400, data: { error: "El remitente y el destinatario son requeridos" } };
  }

  const cost = Math.round(Number(body.cost)) || 0;
  const total = body.total !== undefined && body.total !== "" ? Math.round(Number(body.total)) : cost;
  const packageValue = Math.round(Number(body.package_value)) || 0;
  const paymentMethod = body.payment_method || "Efectivo";
  // Efectivo/Transferencia se consideran cobrados al momento de crear el
  // envio; "A cobrar" (y "Credito") quedan pendientes hasta que se cobren
  // desde la pantalla de Pagar, que setea paid_at ahi.
  const paidAt = ["Efectivo", "Transferencia"].includes(paymentMethod) ? new Date() : null;

  // El codigo (000001, 000002, ...) lo calcula la base de datos a partir
  // del id autoincremental, no se genera aqui.
  const [shipment] = await sql`
    INSERT INTO shipments (
      sender_name, sender_dni, sender_address, sender_phone, sender_email,
      recipient_name, recipient_dni, recipient_address, recipient_phone, recipient_email,
      package_type, package_content, package_value,
      origin, destination, pickup_at_home,
      cost, total, payment_method, payment_reference,
      status, created_by, paid_at
    ) VALUES (
      ${body.sender_name}, ${body.sender_dni || null}, ${body.sender_address || null}, ${body.sender_phone || null}, ${body.sender_email || null},
      ${body.recipient_name}, ${body.recipient_dni || null}, ${body.recipient_address || null}, ${body.recipient_phone || null}, ${body.recipient_email || null},
      ${body.package_type || "Paquete"}, ${body.package_content || null}, ${packageValue},
      ${body.origin || null}, ${body.destination || null}, ${!!body.pickup_at_home},
      ${cost}, ${total}, ${paymentMethod}, ${body.payment_reference || null},
      'Registrado', ${user.id}, ${paidAt}
    )
    RETURNING *
  `;

  return { status: 201, data: { shipment } };
}

const PAGE_SIZE = 20;

function splitAggregates(rows) {
  const first = rows[0];
  const stats = {
    total: first?.total_count ?? 0,
    enCurso: first?.en_curso_count ?? 0,
    entregados: first?.entregados_count ?? 0,
    ingresos: first?.ingresos_total ?? 0,
  };
  const shipments = rows.map(({ total_count, en_curso_count, entregados_count, ingresos_total, ...rest }) => rest);
  return { shipments, stats };
}

export async function listShipments(query, user) {
  const q = (query.q || "").trim();
  const like = `%${q}%`;
  const onlyMine = query.mine === "1";
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let rows;
  if (onlyMine && q) {
    rows = await sql`
      SELECT *,
        COUNT(*) OVER()::int AS total_count,
        COUNT(*) FILTER (WHERE status NOT IN ('Entregado','Cancelado')) OVER()::int AS en_curso_count,
        COUNT(*) FILTER (WHERE status = 'Entregado') OVER()::int AS entregados_count,
        COALESCE(SUM(total) OVER(), 0)::int AS ingresos_total
      FROM shipments
      WHERE created_by = ${user.id}
        AND (code ILIKE ${like} OR sender_name ILIKE ${like} OR recipient_name ILIKE ${like}
             OR sender_dni ILIKE ${like} OR recipient_dni ILIKE ${like})
      ORDER BY created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  } else if (onlyMine) {
    rows = await sql`
      SELECT *,
        COUNT(*) OVER()::int AS total_count,
        COUNT(*) FILTER (WHERE status NOT IN ('Entregado','Cancelado')) OVER()::int AS en_curso_count,
        COUNT(*) FILTER (WHERE status = 'Entregado') OVER()::int AS entregados_count,
        COALESCE(SUM(total) OVER(), 0)::int AS ingresos_total
      FROM shipments
      WHERE created_by = ${user.id}
      ORDER BY created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  } else if (q) {
    rows = await sql`
      SELECT *,
        COUNT(*) OVER()::int AS total_count,
        COUNT(*) FILTER (WHERE status NOT IN ('Entregado','Cancelado')) OVER()::int AS en_curso_count,
        COUNT(*) FILTER (WHERE status = 'Entregado') OVER()::int AS entregados_count,
        COALESCE(SUM(total) OVER(), 0)::int AS ingresos_total
      FROM shipments
      WHERE code ILIKE ${like} OR sender_name ILIKE ${like} OR recipient_name ILIKE ${like}
         OR sender_dni ILIKE ${like} OR recipient_dni ILIKE ${like}
      ORDER BY created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT *,
        COUNT(*) OVER()::int AS total_count,
        COUNT(*) FILTER (WHERE status NOT IN ('Entregado','Cancelado')) OVER()::int AS en_curso_count,
        COUNT(*) FILTER (WHERE status = 'Entregado') OVER()::int AS entregados_count,
        COALESCE(SUM(total) OVER(), 0)::int AS ingresos_total
      FROM shipments
      ORDER BY created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  }

  const { shipments, stats } = splitAggregates(rows);
  return { status: 200, data: { shipments, stats, page, pageSize: PAGE_SIZE, total: stats.total } };
}

export async function getShipment(code) {
  const [row] = await sql`SELECT * FROM shipments WHERE code = ${code}`;
  if (!row) return { status: 404, data: { error: "Envio no encontrado" } };
  return { status: 200, data: { shipment: row } };
}

export async function updateShipment(code, body) {
  if (!body.sender_name || !body.recipient_name) {
    return { status: 400, data: { error: "El remitente y el destinatario son requeridos" } };
  }

  const [existing] = await sql`SELECT id FROM shipments WHERE code = ${code}`;
  if (!existing) return { status: 404, data: { error: "Envio no encontrado" } };

  const cost = Math.round(Number(body.cost)) || 0;
  const total = body.total !== undefined && body.total !== "" ? Math.round(Number(body.total)) : cost;
  const paymentMethod = body.payment_method || "Efectivo";

  const [shipment] = await sql`
    UPDATE shipments SET
      sender_name = ${body.sender_name}, sender_dni = ${body.sender_dni || null},
      sender_address = ${body.sender_address || null}, sender_phone = ${body.sender_phone || null},
      sender_email = ${body.sender_email || null},
      recipient_name = ${body.recipient_name}, recipient_dni = ${body.recipient_dni || null},
      recipient_address = ${body.recipient_address || null}, recipient_phone = ${body.recipient_phone || null},
      recipient_email = ${body.recipient_email || null},
      package_type = ${body.package_type || "Paquete"},
      origin = ${body.origin || null}, destination = ${body.destination || null},
      cost = ${cost}, total = ${total},
      payment_method = ${paymentMethod}, payment_reference = ${body.payment_reference || null},
      -- Si pasa a Efectivo/Transferencia y todavia no tenia fecha de pago,
      -- se considera cobrado recien ahora.
      paid_at = CASE
        WHEN paid_at IS NULL AND ${paymentMethod} IN ('Efectivo', 'Transferencia') THEN now()
        ELSE paid_at
      END,
      updated_at = now()
    WHERE code = ${code}
    RETURNING *
  `;
  return { status: 200, data: { shipment } };
}

export async function collectShipment(code, body) {
  const method = body.payment_method;
  if (!["Efectivo", "Transferencia"].includes(method)) {
    return { status: 400, data: { error: "Método de cobro inválido. Use Efectivo o Transferencia" } };
  }

  const [existing] = await sql`SELECT id, payment_method FROM shipments WHERE code = ${code}`;
  if (!existing) return { status: 404, data: { error: "Envio no encontrado" } };
  if (existing.payment_method !== "A cobrar") {
    return { status: 400, data: { error: "Este envío no está pendiente de cobro" } };
  }

  const [shipment] = await sql`
    UPDATE shipments SET payment_method = ${method}, paid_at = now(), updated_at = now()
    WHERE code = ${code}
    RETURNING *
  `;
  return { status: 200, data: { shipment } };
}

export async function listPendingCollection(query) {
  const q = (query.q || "").trim();
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await sql`
      SELECT *, COUNT(*) OVER()::int AS total_count FROM shipments
      WHERE payment_method = 'A cobrar'
        AND (code ILIKE ${like} OR sender_name ILIKE ${like} OR recipient_name ILIKE ${like}
             OR sender_dni ILIKE ${like} OR recipient_dni ILIKE ${like})
      ORDER BY created_at ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT *, COUNT(*) OVER()::int AS total_count FROM shipments
      WHERE payment_method = 'A cobrar'
      ORDER BY created_at ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  }
  const total = rows[0]?.total_count ?? 0;
  const shipments = rows.map(({ total_count, ...rest }) => rest);
  return { status: 200, data: { shipments, total, page, pageSize: PAGE_SIZE } };
}

export async function deleteShipment(code) {
  const [deleted] = await sql`DELETE FROM shipments WHERE code = ${code} RETURNING code`;
  if (!deleted) return { status: 404, data: { error: "Envio no encontrado" } };
  return { status: 200, data: { success: true } };
}

export async function updateShipmentStatus(code, body) {
  if (!STATUSES.includes(body.status)) {
    return { status: 400, data: { error: `Estado invalido. Use uno de: ${STATUSES.join(", ")}` } };
  }

  const [existing] = await sql`SELECT id FROM shipments WHERE code = ${code}`;
  if (!existing) return { status: 404, data: { error: "Envio no encontrado" } };

  const [updated] = await sql`
    UPDATE shipments SET status = ${body.status}, updated_at = now()
    WHERE code = ${code}
    RETURNING *
  `;
  return { status: 200, data: { shipment: updated } };
}

export async function trackShipment(code) {
  const [row] = await sql`
    SELECT code, status, origin, destination, package_type,
           sender_name, recipient_name, created_at, updated_at
    FROM shipments WHERE code = ${code}
  `;
  if (!row) return { status: 404, data: { error: "No se encontro un envio con ese codigo" } };
  return { status: 200, data: { shipment: row } };
}
