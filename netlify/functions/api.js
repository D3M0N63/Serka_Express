import { ensureSchema } from "./lib/db.js";
import { verifyToken } from "./lib/auth.js";
import { login, me } from "./lib/auth-handlers.js";
import {
  createShipment,
  listShipments,
  getShipment,
  updateShipmentStatus,
  trackShipment,
} from "./lib/shipments.js";

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function getAuthUser(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return verifyToken(token);
}

export default async (req) => {
  try {
    await ensureSchema();

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/api/, "") || "/";
    const query = Object.fromEntries(url.searchParams);
    const method = req.method;

    // ---- Rutas publicas ----
    if (pathname === "/auth/login" && method === "POST") {
      const { status, data } = await login(await safeJson(req));
      return json(status, data);
    }

    const trackMatch = pathname.match(/^\/track\/([^/]+)$/);
    if (trackMatch && method === "GET") {
      const { status, data } = await trackShipment(decodeURIComponent(trackMatch[1]));
      return json(status, data);
    }

    // ---- Rutas protegidas ----
    const user = getAuthUser(req);
    if (!user) return json(401, { error: "No autorizado" });

    if (pathname === "/auth/me" && method === "GET") {
      const { status, data } = await me(user);
      return json(status, data);
    }

    if (pathname === "/shipments" && method === "POST") {
      const { status, data } = await createShipment(await safeJson(req), user);
      return json(status, data);
    }

    if (pathname === "/shipments" && method === "GET") {
      const { status, data } = await listShipments(query);
      return json(status, data);
    }

    const shipmentMatch = pathname.match(/^\/shipments\/([^/]+)$/);
    if (shipmentMatch && method === "GET") {
      const { status, data } = await getShipment(decodeURIComponent(shipmentMatch[1]));
      return json(status, data);
    }
    if (shipmentMatch && method === "PATCH") {
      const { status, data } = await updateShipmentStatus(
        decodeURIComponent(shipmentMatch[1]),
        await safeJson(req)
      );
      return json(status, data);
    }

    return json(404, { error: "Ruta no encontrada" });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Error interno del servidor" });
  }
};

export const config = { path: "/api/*" };
