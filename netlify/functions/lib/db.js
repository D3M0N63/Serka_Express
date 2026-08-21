import { neon } from "@neondatabase/serverless";
import { hashPassword } from "./auth.js";

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
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
      package_value NUMERIC DEFAULT 0,
      origin TEXT,
      destination TEXT,
      pickup_at_home BOOLEAN DEFAULT false,
      cost NUMERIC DEFAULT 0,
      total NUMERIC DEFAULT 0,
      payment_method TEXT,
      payment_reference TEXT,
      status TEXT NOT NULL DEFAULT 'Registrado',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  if (count === 0) {
    await sql`
      INSERT INTO users (username, password, name, role)
      VALUES ('admin', ${hashPassword("admin123")}, 'AresorExito', 'admin')
    `;
  }
}
