import { sql } from "./db.js";

// La "empresa" de un envío a crédito es su remitente: se agrupa por su
// CI/RUC si lo tiene cargado, y si no por el nombre. Este mismo criterio
// (COALESCE(NULLIF(TRIM(sender_dni), ''), sender_name)) se usa como
// client_key en credit_reports para poder reencontrar los informes de una
// empresa. El driver de Neon no compone fragmentos sql anidados, así que
// la expresión se repite literal en cada consulta (no lleva datos del
// usuario: son nombres de columna).

// Mes en formato YYYY-MM. Si no viene uno válido, se usa el mes actual en
// horario de Paraguay (el frontend siempre manda uno; esto es la red).
async function resolveMonth(input) {
  const month = (input || "").trim();
  if (/^\d{4}-\d{2}$/.test(month)) return month;
  const [{ m }] = await sql`SELECT to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYY-MM') AS m`;
  return m;
}

// Listado principal: empresas (remitentes) con movimiento de crédito en el
// mes elegido — ya sea boletas a crédito sin cobrar, o informes emitidos
// ese mes (aunque estén todos pagados, para poder reimprimirlos desde el
// historial). Devuelve, por empresa, el saldo adeudado del mes, cuántas
// boletas quedan sin informe y cuántos informes tiene el mes.
export async function listCredits(query) {
  const month = await resolveMonth(query.month);

  const rows = await sql`
    WITH ship_agg AS (
      SELECT
        COALESCE(NULLIF(TRIM(sender_dni), ''), sender_name) AS client_key,
        MAX(sender_name) AS client_name,
        MAX(NULLIF(TRIM(sender_dni), '')) AS client_dni,
        COUNT(*) FILTER (WHERE paid_at IS NULL)::int AS pending_count,
        COALESCE(SUM(total) FILTER (WHERE paid_at IS NULL), 0)::int AS pending_total,
        COUNT(*) FILTER (WHERE paid_at IS NULL AND credit_report_id IS NULL)::int AS unbilled_count
      FROM shipments
      WHERE payment_method = 'Crédito'
        AND to_char(created_at AT TIME ZONE 'America/Asuncion', 'YYYY-MM') = ${month}
      GROUP BY 1
    ),
    report_agg AS (
      SELECT
        client_key,
        MAX(client_name) AS client_name,
        MAX(client_dni) AS client_dni,
        COUNT(*)::int AS report_count,
        COUNT(*) FILTER (WHERE paid_at IS NULL)::int AS report_pending_count
      FROM credit_reports
      WHERE to_char(created_at AT TIME ZONE 'America/Asuncion', 'YYYY-MM') = ${month}
      GROUP BY 1
    )
    SELECT
      COALESCE(s.client_key, r.client_key) AS client_key,
      COALESCE(s.client_name, r.client_name) AS client_name,
      COALESCE(s.client_dni, r.client_dni) AS client_dni,
      COALESCE(s.pending_count, 0) AS shipment_count,
      COALESCE(s.pending_total, 0) AS total,
      COALESCE(s.unbilled_count, 0) AS unbilled_count,
      COALESCE(r.report_count, 0) AS report_count,
      COALESCE(r.report_pending_count, 0) AS report_pending_count
    FROM ship_agg s
    FULL OUTER JOIN report_agg r ON r.client_key = s.client_key
    ORDER BY client_name ASC
  `;

  return { status: 200, data: { clients: rows, month } };
}

// Detalle de una empresa: sus boletas a crédito sin cobrar del mes que
// todavía no están en ningún informe (seleccionables para imprimir), el
// saldo del mes y el historial completo de informes de esa empresa.
export async function getCreditClient(query) {
  const key = (query.key || "").trim();
  if (!key) return { status: 400, data: { error: "Falta la empresa" } };
  const month = await resolveMonth(query.month);

  const pendingShipments = await sql`
    SELECT id, code, recipient_name, destination, total, created_at
    FROM shipments
    WHERE payment_method = 'Crédito'
      AND paid_at IS NULL
      AND credit_report_id IS NULL
      AND COALESCE(NULLIF(TRIM(sender_dni), ''), sender_name) = ${key}
      AND to_char(created_at AT TIME ZONE 'America/Asuncion', 'YYYY-MM') = ${month}
    ORDER BY created_at ASC
  `;

  const [monthTotals] = await sql`
    SELECT
      COALESCE(SUM(total), 0)::int AS balance,
      COUNT(*)::int AS shipment_count,
      MAX(sender_name) AS client_name,
      MAX(NULLIF(TRIM(sender_dni), '')) AS client_dni
    FROM shipments
    WHERE payment_method = 'Crédito'
      AND paid_at IS NULL
      AND COALESCE(NULLIF(TRIM(sender_dni), ''), sender_name) = ${key}
      AND to_char(created_at AT TIME ZONE 'America/Asuncion', 'YYYY-MM') = ${month}
  `;

  const reports = await sql`
    SELECT cr.*, u.name AS created_by_name
    FROM credit_reports cr
    LEFT JOIN users u ON u.id = cr.created_by
    WHERE cr.client_key = ${key}
    ORDER BY cr.created_at DESC
    LIMIT 100
  `;

  // Si no hay boletas del mes, igual devolvemos el nombre a partir del
  // último informe conocido para no mostrar la pantalla vacía sin título.
  const clientName = monthTotals.client_name || reports[0]?.client_name || key;
  const clientDni = monthTotals.client_dni || reports[0]?.client_dni || null;

  return {
    status: 200,
    data: {
      client: { key, name: clientName, dni: clientDni },
      month,
      balance: monthTotals.balance,
      pendingShipments,
      reports,
    },
  };
}

// Crea un informe de crédito con las boletas seleccionadas. paid=true lo
// marca (y a sus boletas) como cobrado en el acto; paid=false lo deja como
// impreso pendiente de cobro.
export async function createCreditReport(body, user) {
  const codes = Array.isArray(body.codes) ? [...new Set(body.codes.filter(Boolean))] : [];
  const paid = body.paid === true;
  if (codes.length === 0) {
    return { status: 400, data: { error: "Seleccioná al menos una boleta" } };
  }

  const shipments = await sql`
    SELECT id, code,
           COALESCE(NULLIF(TRIM(sender_dni), ''), sender_name) AS client_key,
           sender_name,
           NULLIF(TRIM(sender_dni), '') AS sender_dni,
           total
    FROM shipments
    WHERE code = ANY(${codes})
      AND payment_method = 'Crédito'
      AND paid_at IS NULL
      AND credit_report_id IS NULL
  `;

  if (shipments.length === 0) {
    return { status: 400, data: { error: "Las boletas seleccionadas ya no están disponibles para un informe de crédito" } };
  }

  const keys = new Set(shipments.map((s) => s.client_key));
  if (keys.size > 1) {
    return { status: 400, data: { error: "Todas las boletas del informe deben ser de la misma empresa" } };
  }

  const clientKey = shipments[0].client_key;
  const clientName = shipments[0].sender_name;
  const clientDni = shipments[0].sender_dni;
  const total = shipments.reduce((sum, s) => sum + (s.total || 0), 0);
  const ids = shipments.map((s) => s.id);

  const [report] = await sql`
    INSERT INTO credit_reports (client_key, client_name, client_dni, total, shipment_count, created_by, paid_at)
    VALUES (${clientKey}, ${clientName}, ${clientDni}, ${total}, ${shipments.length}, ${user.id}, ${paid ? new Date() : null})
    RETURNING *
  `;

  await sql`
    UPDATE shipments
    SET credit_report_id = ${report.id},
        paid_at = CASE WHEN ${paid} THEN now() ELSE paid_at END,
        updated_at = now()
    WHERE id = ANY(${ids})
  `;

  const reportShipments = await loadReportShipments(report.id);
  return { status: 201, data: { report, shipments: reportShipments } };
}

export async function getCreditReport(code) {
  const [report] = await sql`
    SELECT cr.*, u.name AS created_by_name
    FROM credit_reports cr
    LEFT JOIN users u ON u.id = cr.created_by
    WHERE cr.code = ${code}
  `;
  if (!report) return { status: 404, data: { error: "Informe de crédito no encontrado" } };
  const shipments = await loadReportShipments(report.id);
  return { status: 200, data: { report, shipments } };
}

// Marca un informe (y todas sus boletas) como cobrado. Si ya estaba
// pagado no hace nada y lo devuelve tal cual.
export async function markCreditReportPaid(code) {
  const [report] = await sql`SELECT * FROM credit_reports WHERE code = ${code}`;
  if (!report) return { status: 404, data: { error: "Informe de crédito no encontrado" } };

  if (!report.paid_at) {
    await sql`UPDATE credit_reports SET paid_at = now() WHERE id = ${report.id}`;
    await sql`
      UPDATE shipments SET paid_at = now(), updated_at = now()
      WHERE credit_report_id = ${report.id} AND paid_at IS NULL
    `;
  }

  const [updated] = await sql`
    SELECT cr.*, u.name AS created_by_name
    FROM credit_reports cr
    LEFT JOIN users u ON u.id = cr.created_by
    WHERE cr.id = ${report.id}
  `;
  const shipments = await loadReportShipments(report.id);
  return { status: 200, data: { report: updated, shipments } };
}

async function loadReportShipments(reportId) {
  return sql`
    SELECT id, code, recipient_name, destination, total, created_at, payment_method, paid_at
    FROM shipments
    WHERE credit_report_id = ${reportId}
    ORDER BY created_at ASC
  `;
}
