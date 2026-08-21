import { sql } from "./db.js";
import { verifyPassword, createToken } from "./auth.js";

export async function login(body) {
  const { username, password } = body;
  if (!username || !password) {
    return { status: 400, data: { error: "Usuario y contraseña son requeridos" } };
  }

  const [user] = await sql`SELECT * FROM users WHERE username = ${username}`;
  if (!user || !verifyPassword(password, user.password)) {
    return { status: 401, data: { error: "Credenciales invalidas" } };
  }

  const token = createToken({ id: user.id, username: user.username, role: user.role });
  return {
    status: 200,
    data: {
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    },
  };
}

export async function me(authUser) {
  const [user] = await sql`
    SELECT id, username, name, role FROM users WHERE id = ${authUser.id}
  `;
  if (!user) return { status: 404, data: { error: "Usuario no encontrado" } };
  return { status: 200, data: { user } };
}
