import { sql } from "./db.js";
import { findDepartmentForCity } from "../../../frontend/js/py-cities.js";
import { getOpenSession, cajaOwnerId, getOwnedCreatorIds } from "./cash.js";

const STATUSES = ["Registrado", "En transito", "En reparto", "Entregado", "Cancelado"];

// Deja constancia de quien marco cada paso del flujo de estados, para
// mostrarlo en la linea de tiempo del detalle de la boleta.
async function recordStatusHistory(shipmentId, status, userId) {
  await sql`
    INSERT INTO shipment_status_history (shipment_id, status, changed_by)
    VALUES (${shipmentId}, ${status}, ${userId})
  `;
}

export async function createShipment(body, user) {
  if (!(await getOpenSession(cajaOwnerId(user)))) {
    return { status: 400, data: { error: "La caja está cerrada. Abrí la caja para registrar nuevos envíos." } };
  }

  if (!body.sender_name || !body.recipient_name) {
    return { status: 400, data: { error: "El remitente y el destinatario son requeridos" } };
  }

  const cost = Math.round(Number(body.cost)) || 0;
  if (cost <= 0) {
    return { status: 400, data: { error: "El costo es requerido y debe ser mayor a cero" } };
  }
  const packageQuantity = Math.max(1, Math.round(Number(body.package_quantity)) || 1);
  // El total siempre es costo x cantidad: no se acepta un total distinto
  // desde el cliente.
  const total = cost * packageQuantity;
  const packageValue = Math.round(Number(body.package_value)) || 0;
  const paymentMethod = body.payment_method || "Efectivo";
  // Efectivo/Transferencia se consideran cobrados al momento de crear el
  // envio; "A cobrar" (y "Credito") quedan pendientes hasta que se cobren
  // desde la pantalla de Pagar, que setea paid_at ahi.
  const paidAt = ["Efectivo", "Transferencia"].includes(paymentMethod) ? new Date() : null;
  const destinationDepartment = findDepartmentForCity(body.destination);

  // El codigo (000001, 000002, ...) lo calcula la base de datos a partir
  // del id autoincremental, no se genera aqui.
  const [shipment] = await sql`
    INSERT INTO shipments (
      sender_name, sender_dni, sender_address, sender_phone, sender_email,
      recipient_name, recipient_dni, recipient_address, recipient_phone, recipient_email,
      package_type, package_content, package_value, package_quantity,
      origin, destination, destination_department, pickup_at_home,
      cost, total, payment_method, payment_reference,
      status, created_by, paid_at
    ) VALUES (
      ${body.sender_name}, ${body.sender_dni || null}, ${body.sender_address || null}, ${body.sender_phone || null}, ${body.sender_email || null},
      ${body.recipient_name}, ${body.recipient_dni || null}, ${body.recipient_address || null}, ${body.recipient_phone || null}, ${body.recipient_email || null},
      ${body.package_type || "Paquete"}, ${body.package_content || null}, ${packageValue}, ${packageQuantity},
      ${body.origin || null}, ${body.destination || null}, ${destinationDepartment}, ${!!body.pickup_at_home},
      ${cost}, ${total}, ${paymentMethod}, ${body.payment_reference || null},
      'Registrado', ${user.id}, ${paidAt}
    )
    RETURNING *
  `;
  await recordStatusHistory(shipment.id, "Registrado", user.id);

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

  if (onlyMine) {
    // Inicio (Mis Envios) solo muestra las boletas de la caja actualmente
    // abierta (la propia si es Admin/Sucursal, o la de su Sucursal padre
    // si es Repartidor): si esa caja esta cerrada, se vacia.
    const session = await getOpenSession(cajaOwnerId(user));
    if (!session) {
      return {
        status: 200,
        data: {
          shipments: [],
          stats: { total: 0, enCurso: 0, entregados: 0, ingresos: 0 },
          page,
          pageSize: PAGE_SIZE,
          total: 0,
          cajaAbierta: false,
        },
      };
    }

    const rows = q
      ? await sql`
          SELECT *,
            COUNT(*) OVER()::int AS total_count,
            COUNT(*) FILTER (WHERE status NOT IN ('Entregado','Cancelado')) OVER()::int AS en_curso_count,
            COUNT(*) FILTER (WHERE status = 'Entregado') OVER()::int AS entregados_count,
            COALESCE(SUM(total) OVER(), 0)::int AS ingresos_total
          FROM shipments
          WHERE created_by = ${user.id}
            AND created_at >= ${session.opened_at}
            AND (code ILIKE ${like} OR sender_name ILIKE ${like} OR recipient_name ILIKE ${like}
                 OR sender_dni ILIKE ${like} OR recipient_dni ILIKE ${like})
          ORDER BY created_at DESC
          LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `
      : await sql`
          SELECT *,
            COUNT(*) OVER()::int AS total_count,
            COUNT(*) FILTER (WHERE status NOT IN ('Entregado','Cancelado')) OVER()::int AS en_curso_count,
            COUNT(*) FILTER (WHERE status = 'Entregado') OVER()::int AS entregados_count,
            COALESCE(SUM(total) OVER(), 0)::int AS ingresos_total
          FROM shipments
          WHERE created_by = ${user.id}
            AND created_at >= ${session.opened_at}
          ORDER BY created_at DESC
          LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `;

    const { shipments, stats } = splitAggregates(rows);
    return { status: 200, data: { shipments, stats, page, pageSize: PAGE_SIZE, total: stats.total, cajaAbierta: true } };
  }

  let rows;
  if (q) {
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

  const history = await sql`
    SELECT h.status, h.changed_at, u.name AS changed_by_name
    FROM shipment_status_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.shipment_id = ${row.id}
    ORDER BY h.changed_at ASC
  `;

  return { status: 200, data: { shipment: row, history } };
}

// Un Admin puede editar todos los datos de la boleta. El resto de los
// usuarios solo puede editar los datos de Remitente y Destinatario; todo
// lo demas (tipo/cantidad, origen/destino, costo/pago) queda tal cual
// estaba, sin importar lo que venga en el body.
export async function updateShipment(code, body, user) {
  if (!body.sender_name || !body.recipient_name) {
    return { status: 400, data: { error: "El remitente y el destinatario son requeridos" } };
  }

  const [existing] = await sql`SELECT * FROM shipments WHERE code = ${code}`;
  if (!existing) return { status: 404, data: { error: "Envio no encontrado" } };

  const isAdmin = user.role === "admin";
  let cost = existing.cost;
  let paymentMethod = existing.payment_method;
  let paymentReference = existing.payment_reference;
  let packageType = existing.package_type;
  let packageQuantity = existing.package_quantity;
  let origin = existing.origin;
  let destination = existing.destination;
  let destinationDepartment = existing.destination_department;

  if (isAdmin) {
    cost = Math.round(Number(body.cost)) || 0;
    if (cost <= 0) {
      return { status: 400, data: { error: "El costo es requerido y debe ser mayor a cero" } };
    }
    paymentMethod = body.payment_method || "Efectivo";
    paymentReference = body.payment_reference || null;
    packageType = body.package_type || "Paquete";
    packageQuantity = Math.max(1, Math.round(Number(body.package_quantity)) || 1);
    origin = body.origin || null;
    destination = body.destination || null;
    destinationDepartment = findDepartmentForCity(destination);
  }

  // El total siempre es costo x cantidad: no se acepta un total distinto
  // desde el cliente.
  const total = cost * packageQuantity;

  const [shipment] = await sql`
    UPDATE shipments SET
      sender_name = ${body.sender_name}, sender_dni = ${body.sender_dni || null},
      sender_address = ${body.sender_address || null}, sender_phone = ${body.sender_phone || null},
      sender_email = ${body.sender_email || null},
      recipient_name = ${body.recipient_name}, recipient_dni = ${body.recipient_dni || null},
      recipient_address = ${body.recipient_address || null}, recipient_phone = ${body.recipient_phone || null},
      recipient_email = ${body.recipient_email || null},
      package_type = ${packageType}, package_quantity = ${packageQuantity},
      origin = ${origin}, destination = ${destination},
      destination_department = ${destinationDepartment},
      cost = ${cost}, total = ${total},
      payment_method = ${paymentMethod}, payment_reference = ${paymentReference},
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

  const [existing] = await sql`SELECT id, payment_method, status FROM shipments WHERE code = ${code}`;
  if (!existing) return { status: 404, data: { error: "Envio no encontrado" } };
  if (existing.payment_method !== "A cobrar") {
    return { status: 400, data: { error: "Este envío no está pendiente de cobro" } };
  }
  // Solo se puede cobrar una vez que salio a reparto (marcado desde
  // Planilla): antes de eso el repartidor todavia no tiene la boleta en mano.
  if (existing.status !== "En reparto") {
    return { status: 400, data: { error: "Esta boleta todavía no está en reparto. Primero debe marcarse En Reparto desde Planilla." } };
  }

  const [shipment] = await sql`
    UPDATE shipments SET payment_method = ${method}, paid_at = now(), updated_at = now()
    WHERE code = ${code}
    RETURNING *
  `;
  return { status: 200, data: { shipment } };
}

// Pagar: solo boletas "A cobrar" que ya estan En Reparto (recien ahi tiene
// sentido cobrarlas, cuando el repartidor ya salio con ellas). Ademas se
// filtran por la ciudad de destino configurada en la cuenta del usuario
// (para Repartidor, la de su Sucursal padre) — incluye a Admin tambien.
export async function listPendingCollection(query, user) {
  const q = (query.q || "").trim();
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [owner] = await sql`SELECT city FROM users WHERE id = ${cajaOwnerId(user)}`;
  const city = owner?.city || null;

  let rows;
  if (city && q) {
    const like = `%${q}%`;
    rows = await sql`
      SELECT *, COUNT(*) OVER()::int AS total_count FROM shipments
      WHERE payment_method = 'A cobrar' AND status = 'En reparto'
        AND destination = ${city}
        AND (code ILIKE ${like} OR sender_name ILIKE ${like} OR recipient_name ILIKE ${like}
             OR sender_dni ILIKE ${like} OR recipient_dni ILIKE ${like})
      ORDER BY created_at ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  } else if (city) {
    rows = await sql`
      SELECT *, COUNT(*) OVER()::int AS total_count FROM shipments
      WHERE payment_method = 'A cobrar' AND status = 'En reparto'
        AND destination = ${city}
      ORDER BY created_at ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  } else if (q) {
    const like = `%${q}%`;
    rows = await sql`
      SELECT *, COUNT(*) OVER()::int AS total_count FROM shipments
      WHERE payment_method = 'A cobrar' AND status = 'En reparto'
        AND (code ILIKE ${like} OR sender_name ILIKE ${like} OR recipient_name ILIKE ${like}
             OR sender_dni ILIKE ${like} OR recipient_dni ILIKE ${like})
      ORDER BY created_at ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT *, COUNT(*) OVER()::int AS total_count FROM shipments
      WHERE payment_method = 'A cobrar' AND status = 'En reparto'
      ORDER BY created_at ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  }
  const total = rows[0]?.total_count ?? 0;
  const shipments = rows.map(({ total_count, ...rest }) => rest);
  return { status: 200, data: { shipments, total, page, pageSize: PAGE_SIZE } };
}

// Planilla del dia (pestaña "Boletas"): los envios del propio "grupo de
// caja" del usuario (una Sucursal y todos sus Repartidores comparten las
// mismas boletas entre si) para una fecha (por defecto hoy, en horario de
// Paraguay), opcionalmente filtrados por departamento/ciudad de destino.
// No se pagina: es para armar/imprimir la hoja de ruta. Las boletas de
// otras Sucursales NO se muestran aca (a diferencia del detalle de una
// planilla ya creada, que si es compartido entre todos los usuarios).
export async function listDailyManifest(query, user) {
  const date = (query.date || "").trim() || new Date().toISOString().slice(0, 10);
  const department = (query.department || "").trim();
  const city = (query.city || "").trim();
  const creatorIds = await getOwnedCreatorIds(cajaOwnerId(user));

  let rows;
  if (department && city) {
    rows = await sql`
      SELECT * FROM shipments
      WHERE created_by = ANY(${creatorIds})
        AND (created_at AT TIME ZONE 'America/Asuncion')::date = ${date}::date
        AND destination_department = ${department}
        AND destination = ${city}
      ORDER BY created_at ASC
    `;
  } else if (department) {
    rows = await sql`
      SELECT * FROM shipments
      WHERE created_by = ANY(${creatorIds})
        AND (created_at AT TIME ZONE 'America/Asuncion')::date = ${date}::date
        AND destination_department = ${department}
      ORDER BY created_at ASC
    `;
  } else {
    rows = await sql`
      SELECT * FROM shipments
      WHERE created_by = ANY(${creatorIds})
        AND (created_at AT TIME ZONE 'America/Asuncion')::date = ${date}::date
      ORDER BY created_at ASC
    `;
  }

  return { status: 200, data: { shipments: rows, date, department, city } };
}

// Lista todas las planillas creadas (paginado), con la cantidad de boletas
// y las ciudades de destino que agrupa cada una, para el buscador/listado
// de la pantalla de Planilla. Se puede filtrar por ciudad de destino.
export async function listManifests(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const city = (query.city || "").trim();

  const rows = city
    ? await sql`
        SELECT m.*, u.name AS created_by_name,
          agg.shipment_count, agg.destinations,
          COUNT(*) OVER()::int AS total_count
        FROM manifests m
        LEFT JOIN users u ON u.id = m.created_by
        JOIN (
          SELECT manifest_id, COUNT(*)::int AS shipment_count,
            STRING_AGG(DISTINCT destination, ', ' ORDER BY destination) AS destinations
          FROM shipments
          WHERE manifest_id IS NOT NULL
          GROUP BY manifest_id
        ) agg ON agg.manifest_id = m.id
        WHERE EXISTS (
          SELECT 1 FROM shipments s2 WHERE s2.manifest_id = m.id AND s2.destination = ${city}
        )
        ORDER BY m.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `
    : await sql`
        SELECT m.*, u.name AS created_by_name,
          agg.shipment_count, agg.destinations,
          COUNT(*) OVER()::int AS total_count
        FROM manifests m
        LEFT JOIN users u ON u.id = m.created_by
        JOIN (
          SELECT manifest_id, COUNT(*)::int AS shipment_count,
            STRING_AGG(DISTINCT destination, ', ' ORDER BY destination) AS destinations
          FROM shipments
          WHERE manifest_id IS NOT NULL
          GROUP BY manifest_id
        ) agg ON agg.manifest_id = m.id
        ORDER BY m.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `;

  const total = rows[0]?.total_count ?? 0;
  const manifests = rows.map(({ total_count, ...rest }) => rest);
  return { status: 200, data: { manifests, total, page, pageSize: PAGE_SIZE } };
}

// Crea una planilla a partir de las boletas seleccionadas: les asigna el
// codigo de la nueva planilla y pasa su estado de Registrado a En transito
// (las boletas que ya estaban en otro estado no se tocan).
export async function createManifest(body, user) {
  const codes = Array.isArray(body.codes) ? [...new Set(body.codes.filter(Boolean))] : [];
  if (codes.length === 0) {
    return { status: 400, data: { error: "Selecciona al menos una boleta para crear la planilla" } };
  }

  const [manifest] = await sql`
    INSERT INTO manifests (created_by) VALUES (${user.id}) RETURNING *
  `;

  const transitioning = await sql`
    SELECT id FROM shipments WHERE code = ANY(${codes}) AND status = 'Registrado'
  `;

  await sql`
    UPDATE shipments SET
      manifest_id = ${manifest.id},
      status = CASE WHEN status = 'Registrado' THEN 'En transito' ELSE status END,
      updated_at = now()
    WHERE code = ANY(${codes})
  `;

  for (const row of transitioning) {
    await recordStatusHistory(row.id, "En transito", user.id);
  }

  const shipments = await sql`
    SELECT * FROM shipments WHERE manifest_id = ${manifest.id} ORDER BY created_at ASC
  `;
  return { status: 201, data: { manifest, shipments } };
}

// Busca una planilla por su codigo (P000001, ...) junto con las boletas
// que agrupa, para el buscador de la pantalla de Planilla.
export async function getManifest(code) {
  const [manifest] = await sql`SELECT * FROM manifests WHERE code = ${code}`;
  if (!manifest) return { status: 404, data: { error: "Planilla no encontrada" } };

  const shipments = await sql`
    SELECT * FROM shipments WHERE manifest_id = ${manifest.id} ORDER BY created_at ASC
  `;
  return { status: 200, data: { manifest, shipments } };
}

// Cuando el repartidor sale con las boletas de una planilla, el usuario las
// vuelve a marcar desde el buscador para pasarlas de En transito a En
// reparto. Solo afecta boletas que pertenecen a esa planilla.
export async function dispatchManifest(code, body, user) {
  const codes = Array.isArray(body.codes) ? [...new Set(body.codes.filter(Boolean))] : [];
  if (codes.length === 0) {
    return { status: 400, data: { error: "Selecciona al menos una boleta" } };
  }

  const [manifest] = await sql`SELECT * FROM manifests WHERE code = ${code}`;
  if (!manifest) return { status: 404, data: { error: "Planilla no encontrada" } };

  const transitioning = await sql`
    SELECT id FROM shipments
    WHERE manifest_id = ${manifest.id} AND code = ANY(${codes}) AND status = 'En transito'
  `;

  await sql`
    UPDATE shipments SET
      status = CASE WHEN status = 'En transito' THEN 'En reparto' ELSE status END,
      updated_at = now()
    WHERE manifest_id = ${manifest.id} AND code = ANY(${codes})
  `;

  for (const row of transitioning) {
    await recordStatusHistory(row.id, "En reparto", user.id);
  }

  const shipments = await sql`
    SELECT * FROM shipments WHERE manifest_id = ${manifest.id} ORDER BY created_at ASC
  `;
  return { status: 200, data: { manifest, shipments } };
}

export async function deleteShipment(code, user) {
  if (user.role !== "admin") {
    return { status: 403, data: { error: "Solo un administrador puede eliminar una boleta" } };
  }

  const [existing] = await sql`SELECT id FROM shipments WHERE code = ${code}`;
  if (!existing) return { status: 404, data: { error: "Envio no encontrado" } };

  // Se borra primero el historial de estados: la boleta ya tiene una fila
  // (o mas) referenciandola desde que createShipment empezo a registrarlo.
  await sql`DELETE FROM shipment_status_history WHERE shipment_id = ${existing.id}`;
  await sql`DELETE FROM shipments WHERE id = ${existing.id}`;
  return { status: 200, data: { success: true } };
}

// Flujo de estados, aplicado al cambio manual desde el detalle de una
// boleta (los cambios automaticos de Planilla van por otro lado). El
// selector "Actualizar estado" solo aparece en dos casos:
// - Registrado -> Cancelado: exclusivo de Admin.
// - En reparto -> Entregado: para todos los usuarios (la boleta ya llego a
//   En reparto via Planilla, esa es la unica forma de llegar ahi).
// El resto de las transiciones (Registrado, En transito, En reparto) son
// automaticas (creacion de la boleta / creacion y despacho de planilla) y
// no se pueden forzar manualmente desde aca.
export async function updateShipmentStatus(code, body, user) {
  if (!STATUSES.includes(body.status)) {
    return { status: 400, data: { error: `Estado invalido. Use uno de: ${STATUSES.join(", ")}` } };
  }

  const [existing] = await sql`SELECT id, status, received_by FROM shipments WHERE code = ${code}`;
  if (!existing) return { status: 404, data: { error: "Envio no encontrado" } };

  const newStatus = body.status;
  const current = existing.status;

  if (newStatus !== current) {
    if (newStatus === "Registrado") {
      return { status: 400, data: { error: "No se puede volver una boleta a Registrado" } };
    }
    if (newStatus === "En transito") {
      return {
        status: 400,
        data: { error: "El estado En Transito se asigna automáticamente al crear una planilla" },
      };
    }
    if (newStatus === "En reparto") {
      return {
        status: 400,
        data: { error: "El estado En Reparto se asigna desde Planilla, no se puede marcar manualmente" },
      };
    }
    if (newStatus === "Entregado") {
      if (current !== "En reparto") {
        return { status: 400, data: { error: "Solo se puede marcar Entregado una boleta que esté En Reparto" } };
      }
      if (!(body.received_by || "").trim()) {
        return { status: 400, data: { error: "Indicá quién recibió el envío" } };
      }
    }
    if (newStatus === "Cancelado") {
      if (user.role !== "admin") {
        return { status: 400, data: { error: "Solo un administrador puede cancelar una boleta" } };
      }
      if (current !== "Registrado") {
        return { status: 400, data: { error: "Solo se puede cancelar una boleta que todavía esté Registrada" } };
      }
    }
  }

  const receivedBy = newStatus === "Entregado" ? body.received_by.trim() : existing.received_by;

  const [updated] = await sql`
    UPDATE shipments SET status = ${newStatus}, received_by = ${receivedBy}, updated_at = now()
    WHERE code = ${code}
    RETURNING *
  `;
  if (newStatus !== current) await recordStatusHistory(updated.id, newStatus, user.id);
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
