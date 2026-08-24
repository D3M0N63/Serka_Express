import { neon } from "@neondatabase/serverless";
import { hashPassword } from "./auth.js";
import { PY_DEPARTMENTS } from "../../../frontend/js/py-cities.js";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Falta la variable de entorno DATABASE_URL (cadena de conexión de Neon). " +
      "Configúrala en Netlify (Site settings > Environment variables) o en .env para desarrollo local."
  );
}

export const sql = neon(process.env.DATABASE_URL);

// Netlify puede reutilizar la misma instancia de función entre invocaciones
// (contenedor "tibio"), así que cacheamos la promesa de inicialización para
// no repetir el CREATE TABLE / seed en cada request.
let schemaReady = null;

export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = initSchema().catch((err) => {
      schemaReady = null; // permitir reintentar si falló
      throw err;
    });
  }
  return schemaReady;
}

async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operador',
      city TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Migra usuarios creados antes de que existiera la columna `city`.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT`;

  // parent_id: para usuarios "repartidor", indica a que usuario "sucursal"
  // pertenecen (su caja se contabiliza dentro de la caja de esa sucursal).
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES users(id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      code TEXT GENERATED ALWAYS AS (LPAD(id::text, 6, '0')) STORED UNIQUE,
      sender_name TEXT NOT NULL,
      sender_dni TEXT,
      sender_address TEXT,
      sender_phone TEXT,
      sender_email TEXT,
      recipient_name TEXT NOT NULL,
      recipient_dni TEXT,
      recipient_address TEXT,
      recipient_phone TEXT,
      recipient_email TEXT,
      package_type TEXT,
      package_content TEXT,
      package_value INTEGER DEFAULT 0,
      origin TEXT,
      destination TEXT,
      destination_department TEXT,
      pickup_at_home BOOLEAN DEFAULT false,
      cost INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      payment_method TEXT,
      payment_reference TEXT,
      status TEXT NOT NULL DEFAULT 'Registrado',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at TIMESTAMPTZ
    )
  `;

  // Migra bases de datos creadas antes de que estas columnas fueran
  // INTEGER (guaranies no usan decimales). Es seguro correrlo aunque
  // ya sean INTEGER.
  await sql`ALTER TABLE shipments ALTER COLUMN package_value TYPE INTEGER USING ROUND(package_value)::INTEGER`;
  await sql`ALTER TABLE shipments ALTER COLUMN cost TYPE INTEGER USING ROUND(cost)::INTEGER`;
  await sql`ALTER TABLE shipments ALTER COLUMN total TYPE INTEGER USING ROUND(total)::INTEGER`;

  // Migra envios creados antes de que existiera `paid_at`: los que ya
  // estaban cobrados (Efectivo/Transferencia) se consideran pagados en el
  // momento en que se crearon. Los "A cobrar"/"Credito" quedan sin pagar
  // hasta que se cobren desde la pantalla de Pagar.
  await sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
  await sql`
    UPDATE shipments SET paid_at = created_at
    WHERE paid_at IS NULL AND payment_method IN ('Efectivo', 'Transferencia')
  `;

  // Migra envios creados antes de que existiera `destination_department`
  // (usado para filtrar la Planilla por departamento de destino).
  await sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS destination_department TEXT`;
  await backfillDestinationDepartments();

  // Nombre de quien recibio el envio al marcarlo Entregado (el
  // destinatario registrado, u otra persona indicada a mano).
  await sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS received_by TEXT`;

  // Cantidad de bultos/paquetes que componen el envio (campo de
  // "Detalles del Envio").
  await sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS package_quantity INTEGER DEFAULT 1`;

  // Planillas: hojas de ruta con numeracion propia (P000001, P000002, ...)
  // que agrupan las boletas seleccionadas para despacho. Al crear una
  // planilla, las boletas seleccionadas quedan vinculadas via manifest_id.
  await sql`
    CREATE TABLE IF NOT EXISTS manifests (
      id SERIAL PRIMARY KEY,
      code TEXT GENERATED ALWAYS AS ('P' || LPAD(id::text, 6, '0')) STORED UNIQUE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS manifest_id INTEGER REFERENCES manifests(id)`;

  // Historial de cambios de estado: quien marco cada paso del flujo
  // (Registrado/En transito/En reparto/Entregado/Cancelado) y cuando, para
  // mostrarlo en la linea de tiempo del detalle de la boleta.
  await sql`
    CREATE TABLE IF NOT EXISTS shipment_status_history (
      id SERIAL PRIMARY KEY,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id),
      status TEXT NOT NULL,
      changed_by INTEGER REFERENCES users(id),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      dni TEXT UNIQUE,
      address TEXT,
      phone TEXT,
      email TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id SERIAL PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'abierta',
      opening_amount INTEGER NOT NULL DEFAULT 0,
      expected_amount INTEGER,
      counted_amount INTEGER,
      difference INTEGER,
      transfer_income INTEGER,
      notes TEXT,
      opened_by INTEGER REFERENCES users(id),
      closed_by INTEGER REFERENCES users(id),
      opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ
    )
  `;
  await sql`ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS transfer_income INTEGER`;

  await sql`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await migrateSequentialCodes();

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  if (count === 0) {
    await sql`
      INSERT INTO users (username, password, name, role, city)
      VALUES ('admin', ${hashPassword("admin123")}, 'AresorExito', 'admin', 'Asunción')
    `;
  }
}

// Migra bases de datos donde `code` todavia era una columna de texto libre
// (codigos aleatorios tipo "EV-123456") a una columna generada a partir del
// id, con formato numerico secuencial de 6 digitos (000001, 000002, ...).
// Es segura de correr en cada arranque: si `code` ya es una columna
// generada no hace nada.
async function migrateSequentialCodes() {
  const [column] = await sql`
    SELECT is_generated FROM information_schema.columns
    WHERE table_name = 'shipments' AND column_name = 'code'
  `;
  if (!column || column.is_generated === "ALWAYS") return;

  // Renumera los ids existentes en orden de creacion (el mas antiguo queda
  // en 1) usando un offset temporal para evitar choques de clave unica
  // mientras se reasignan.
  await sql`UPDATE shipments SET id = id + 1000000`;
  const rows = await sql`SELECT id FROM shipments ORDER BY created_at ASC, id ASC`;
  let next = 1;
  for (const row of rows) {
    await sql`UPDATE shipments SET id = ${next} WHERE id = ${row.id}`;
    next++;
  }

  // Reinicia la secuencia de id para que el proximo envio continue justo
  // despues del ultimo id renumerado.
  await sql`
    SELECT setval(
      pg_get_serial_sequence('shipments', 'id'),
      COALESCE((SELECT MAX(id) FROM shipments), 0) + 1,
      false
    )
  `;

  await sql`ALTER TABLE shipments DROP COLUMN IF EXISTS code`;
  await sql`ALTER TABLE shipments ADD COLUMN code TEXT GENERATED ALWAYS AS (LPAD(id::text, 6, '0')) STORED UNIQUE`;
}

// Completa destination_department para envios existentes que tengan un
// destino que coincide con una ciudad conocida pero todavia no tengan el
// departamento calculado (p.ej. creados antes de que existiera este campo).
// Recalcula siempre (no solo si esta en null): si la lista de
// departamentos/ciudades que trabaja la empresa cambia, esto vuelve a
// sincronizar los envios existentes con la lista actual.
// Una consulta por departamento (no por envio): con miles de envios esto
// son ~6 consultas en vez de miles, evitando timeouts en el arranque.
async function backfillDestinationDepartments() {
  for (const dept of PY_DEPARTMENTS) {
    await sql`
      UPDATE shipments SET destination_department = ${dept.name}
      WHERE destination = ANY(${dept.cities})
        AND destination_department IS DISTINCT FROM ${dept.name}
    `;
  }
  const knownCities = PY_DEPARTMENTS.flatMap((d) => d.cities);
  await sql`
    UPDATE shipments SET destination_department = NULL
    WHERE destination_department IS NOT NULL
      AND NOT (destination = ANY(${knownCities}))
  `;
}
