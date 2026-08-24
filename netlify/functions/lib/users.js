import { sql } from "./db.js";
import { hashPassword } from "./auth.js";

const ROLES = ["admin", "sucursal", "repartidor"];

export async function listUsers(query) {
  const roleFilter = (query.role || "").trim();
  const rows = roleFilter
    ? await sql`
        SELECT u.id, u.username, u.name, u.role, u.city, u.parent_id, p.name AS parent_name, u.created_at
        FROM users u LEFT JOIN users p ON p.id = u.parent_id
        WHERE u.role = ${roleFilter}
        ORDER BY u.created_at DESC
      `
    : await sql`
        SELECT u.id, u.username, u.name, u.role, u.city, u.parent_id, p.name AS parent_name, u.created_at
        FROM users u LEFT JOIN users p ON p.id = u.parent_id
        ORDER BY u.created_at DESC
      `;
  return { status: 200, data: { users: rows } };
}

// Valida y resuelve el parent_id: solo los Repartidores tienen sucursal
// padre, y debe ser un usuario con rol "sucursal" existente.
async function resolveParentId(role, parentIdInput) {
  if (role !== "repartidor") return { parentId: null };

  const parentId = Number(parentIdInput) || null;
  if (!parentId) {
    return { error: "Selecciona la sucursal a la que pertenece el repartidor" };
  }
  const [parent] = await sql`SELECT id FROM users WHERE id = ${parentId} AND role = 'sucursal'`;
  if (!parent) {
    return { error: "La sucursal seleccionada no es válida" };
  }
  return { parentId };
}

export async function getUser(id) {
  const [user] = await sql`
    SELECT u.id, u.username, u.name, u.role, u.city, u.parent_id, p.name AS parent_name, u.created_at
    FROM users u LEFT JOIN users p ON p.id = u.parent_id
    WHERE u.id = ${id}
  `;
  if (!user) return { status: 404, data: { error: "Usuario no encontrado" } };
  return { status: 200, data: { user } };
}

export async function createUser(body) {
  const username = (body.username || "").trim();
  const password = body.password || "";
  const name = (body.name || "").trim();
  const role = body.role;
  const city = (body.city || "").trim();

  if (!username || !password || !name) {
    return { status: 400, data: { error: "Usuario, contraseña y nombre son requeridos" } };
  }
  if (!ROLES.includes(role)) {
    return { status: 400, data: { error: `Rol inválido. Use uno de: ${ROLES.join(", ")}` } };
  }

  const { parentId, error } = await resolveParentId(role, body.parent_id);
  if (error) return { status: 400, data: { error } };

  const [existing] = await sql`SELECT id FROM users WHERE username = ${username}`;
  if (existing) {
    return { status: 409, data: { error: "Ya existe un usuario con ese nombre de usuario" } };
  }

  const [user] = await sql`
    INSERT INTO users (username, password, name, role, city, parent_id)
    VALUES (${username}, ${hashPassword(password)}, ${name}, ${role}, ${city || null}, ${parentId})
    RETURNING id, username, name, role, city, parent_id
  `;
  return { status: 201, data: { user } };
}

export async function updateUser(id, body) {
  const [existing] = await sql`SELECT * FROM users WHERE id = ${id}`;
  if (!existing) return { status: 404, data: { error: "Usuario no encontrado" } };

  const name = (body.name || "").trim();
  const city = (body.city || "").trim();
  const role = body.role || existing.role;

  if (!name) return { status: 400, data: { error: "El nombre es requerido" } };
  if (!ROLES.includes(role)) {
    return { status: 400, data: { error: `Rol inválido. Use uno de: ${ROLES.join(", ")}` } };
  }

  const { parentId, error } = await resolveParentId(role, body.parent_id ?? existing.parent_id);
  if (error) return { status: 400, data: { error } };

  const password = body.password ? hashPassword(body.password) : existing.password;

  const [user] = await sql`
    UPDATE users SET name = ${name}, city = ${city || null}, role = ${role},
      parent_id = ${parentId}, password = ${password}
    WHERE id = ${id}
    RETURNING id, username, name, role, city, parent_id
  `;
  return { status: 200, data: { user } };
}

export async function deleteUser(id, currentUserId) {
  if (Number(id) === Number(currentUserId)) {
    return { status: 400, data: { error: "No podés eliminar tu propio usuario" } };
  }

  const [hasChildren] = await sql`SELECT id FROM users WHERE parent_id = ${id} LIMIT 1`;
  if (hasChildren) {
    return {
      status: 400,
      data: { error: "No se puede eliminar: tiene repartidores asignados. Reasignalos o eliminalos primero." },
    };
  }

  try {
    const [deleted] = await sql`DELETE FROM users WHERE id = ${id} RETURNING id`;
    if (!deleted) return { status: 404, data: { error: "Usuario no encontrado" } };
    return { status: 200, data: { success: true } };
  } catch (err) {
    if (String(err.message).includes("foreign key constraint")) {
      return {
        status: 400,
        data: { error: "No se puede eliminar: tiene envíos, clientes o cajas asociadas." },
      };
    }
    throw err;
  }
}
