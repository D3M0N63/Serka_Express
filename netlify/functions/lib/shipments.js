import { sql } from "./db.js";

const STATUSES = ["Registrado", "En transito", "En reparto", "Entregado", "Cancelado"];

async function codeExists(code) {
  const [row] = await sql`SELECT 1 FROM shipments WHERE code = ${code}`;
  return !!row;
}

async function generateCode() {
  let code;
  let exists = true;
  while (exists) {
    const num = Math.floor(100000 + Math.random() * 900000);
    code = `EV-${num}`;
    exists = await codeExists(code);
  }
  return code;
}

export async function createShipment(body, user) {
  if (!body.sender_name || !body.recipient_name) {
    return { status: 400, data: { error: "El remitente y el destinatario son requeridos" } };
  }

  const code = await generateCode();
  const cost = Number(body.cost) || 0;
  const total = body.total !== undefined && body.total !== "" ? Number(body.total) : cost;

  const [shipment] = await sql`
    INSERT INTO shipments (
      code, sender_name, sender_dni, sender_address, sender_phone, sender_email,
      recipient_name, recipient_dni, recipient_address, recipient_phone, recipient_email,
      package_type, package_content, package_value,
      origin, destination, pickup_at_home,
      cost, total, payment_method, payment_reference,
      status, created_by
    ) VALUES (
      ${code},
      ${body.sender_name}, ${body.sender_dni || null}, ${body.sender_address || null}, ${body.sender_phone || null}, ${body.sender_email || null},
      ${body.recipient_name}, ${body.recipient_dni || null}, ${body.recipient_address || null}, ${body.recipient_phone || null}, ${body.recipient_email || null},
      ${body.package_type || "Paquete"}, ${body.package_content || null}, ${Number(body.package_value) || 0},
      ${body.origin || null}, ${body.destination || null}, ${!!body.pickup_at_home},
      ${cost}, ${total}, ${body.payment_method || "Efectivo"}, ${body.payment_reference || null},
      'Registrado', ${user.id}
    )
    RETURNING *
  `;

  return { status: 201, data: { shipment } };
}

export async function listShipments(query) {
  const q = (query.q || "").trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await sql`
      SELECT * FROM shipments
      WHERE code ILIKE ${like} OR sender_name ILIKE ${like} OR recipient_name ILIKE ${like}
      ORDER BY created_at DESC
    `;
  } else {
    rows = await sql`SELECT * FROM shipments ORDER BY created_at DESC`;
  }
  return { status: 200, data: { shipments: rows } };
}

export async function getShipment(code) {
  const [row] = await sql`SELECT * FROM shipments WHERE code = ${code}`;
  if (!row) return { status: 404, data: { error: "Envio no encontrado" } };
  return { status: 200, data: { shipment: row } };
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
