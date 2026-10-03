import { sql } from "./db.js";

const CLIENT_TYPES = ["Empresa", "Tienda", "Casual"];

function isUniqueViolation(err) {
  return err && err.code === "23505";
}

// Si no viene un tipo valido se usa "Casual" por defecto, en vez de
// rechazar la carga (la mayoria de los clientes son personas sueltas).
function resolveType(input) {
  return CLIENT_TYPES.includes(input) ? input : "Casual";
}

export async function createClient(body, user) {
  const name = (body.name || "").trim();
  if (!name) {
    return { status: 400, data: { error: "El nombre es requerido" } };
  }
  const type = resolveType(body.type);

  try {
    const [client] = await sql`
      INSERT INTO clients (name, dni, address, phone, email, type, created_by)
      VALUES (
        ${name}, ${body.dni || null}, ${body.address || null},
        ${body.phone || null}, ${body.email || null}, ${type}, ${user.id}
      )
      RETURNING *
    `;
    return { status: 201, data: { client } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { status: 409, data: { error: "Ya existe un cliente registrado con ese CI/RUC" } };
    }
    throw err;
  }
}

const PAGE_SIZE = 20;

export async function listClients(query) {
  const q = (query.q || "").trim();
  const dni = (query.dni || "").trim();
  const type = CLIENT_TYPES.includes(query.type) ? query.type : "";

  if (dni) {
    // Busqueda exacta, usada por el formulario de envio para autocompletar
    // los datos del remitente/destinatario a partir de su CI/RUC. No se
    // pagina: siempre devuelve como mucho una coincidencia.
    const rows = await sql`SELECT * FROM clients WHERE dni = ${dni}`;
    return { status: 200, data: { clients: rows, total: rows.length, page: 1, pageSize: PAGE_SIZE } };
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const like = `%${q}%`;

  const rows = await sql`
    SELECT *, COUNT(*) OVER()::int AS total_count FROM clients
    WHERE (${q} = '' OR name ILIKE ${like} OR dni ILIKE ${like})
      AND (${type} = '' OR type = ${type})
    ORDER BY name ASC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `;

  const total = rows[0]?.total_count ?? 0;
  const clients = rows.map(({ total_count, ...rest }) => rest);
  return { status: 200, data: { clients, total, page, pageSize: PAGE_SIZE } };
}

export async function getClient(id) {
  const [client] = await sql`SELECT * FROM clients WHERE id = ${id}`;
  if (!client) return { status: 404, data: { error: "Cliente no encontrado" } };
  return { status: 200, data: { client } };
}

export async function updateClient(id, body) {
  const name = (body.name || "").trim();
  if (!name) {
    return { status: 400, data: { error: "El nombre es requerido" } };
  }

  const [existing] = await sql`SELECT id FROM clients WHERE id = ${id}`;
  if (!existing) return { status: 404, data: { error: "Cliente no encontrado" } };
  const type = resolveType(body.type);

  try {
    const [client] = await sql`
      UPDATE clients SET
        name = ${name}, dni = ${body.dni || null}, address = ${body.address || null},
        phone = ${body.phone || null}, email = ${body.email || null}, type = ${type}, updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return { status: 200, data: { client } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { status: 409, data: { error: "Ya existe un cliente registrado con ese CI/RUC" } };
    }
    throw err;
  }
}

export async function deleteClient(id) {
  const [deleted] = await sql`DELETE FROM clients WHERE id = ${id} RETURNING id`;
  if (!deleted) return { status: 404, data: { error: "Cliente no encontrado" } };
  return { status: 200, data: { success: true } };
}
