import { ensureSchema } from "./lib/db.js";
import { verifyToken } from "./lib/auth.js";
import { login, me, updateProfile } from "./lib/auth-handlers.js";
import {
  createShipment,
  listShipments,
  getShipment,
  updateShipment,
  deleteShipment,
  updateShipmentStatus,
  trackShipment,
  collectShipment,
  listPendingCollection,
  listDailyManifest,
  listManifests,
  createManifest,
  getManifest,
  dispatchManifest,
} from "./lib/shipments.js";
import {
  createClient,
  listClients,
  getClient,
  updateClient,
  deleteClient,
} from "./lib/clients.js";
import {
  getCurrentSession,
  openSession,
  addMovement,
  closeSession,
  listSessions,
  listAllSessions,
} from "./lib/cash.js";
import { listUsers, getUser, createUser, updateUser, deleteUser } from "./lib/users.js";

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
    if (pathname === "/auth/me" && method === "PATCH") {
      const { status, data } = await updateProfile(await safeJson(req), user);
      return json(status, data);
    }

    if (pathname === "/shipments" && method === "POST") {
      const { status, data } = await createShipment(await safeJson(req), user);
      return json(status, data);
    }

    if (pathname === "/shipments" && method === "GET") {
      const { status, data } = await listShipments(query, user);
      return json(status, data);
    }

    if (pathname === "/shipments/pending-collection" && method === "GET") {
      const { status, data } = await listPendingCollection(query, user);
      return json(status, data);
    }

    if (pathname === "/shipments/manifest" && method === "GET") {
      const { status, data } = await listDailyManifest(query, user);
      return json(status, data);
    }

    if (pathname === "/manifests" && method === "GET") {
      const { status, data } = await listManifests(query);
      return json(status, data);
    }

    if (pathname === "/manifests" && method === "POST") {
      const { status, data } = await createManifest(await safeJson(req), user);
      return json(status, data);
    }

    const manifestMatch = pathname.match(/^\/manifests\/([^/]+)$/);
    if (manifestMatch && method === "GET") {
      const { status, data } = await getManifest(decodeURIComponent(manifestMatch[1]));
      return json(status, data);
    }

    const manifestDispatchMatch = pathname.match(/^\/manifests\/([^/]+)\/dispatch$/);
    if (manifestDispatchMatch && method === "POST") {
      const { status, data } = await dispatchManifest(
        decodeURIComponent(manifestDispatchMatch[1]),
        await safeJson(req),
        user
      );
      return json(status, data);
    }

    const collectMatch = pathname.match(/^\/shipments\/([^/]+)\/collect$/);
    if (collectMatch && method === "POST") {
      const { status, data } = await collectShipment(
        decodeURIComponent(collectMatch[1]),
        await safeJson(req)
      );
      return json(status, data);
    }

    const shipmentMatch = pathname.match(/^\/shipments\/([^/]+)$/);
    if (shipmentMatch && method === "GET") {
      const { status, data } = await getShipment(decodeURIComponent(shipmentMatch[1]));
      return json(status, data);
    }
    if (shipmentMatch && method === "PUT") {
      const { status, data } = await updateShipment(
        decodeURIComponent(shipmentMatch[1]),
        await safeJson(req),
        user
      );
      return json(status, data);
    }
    if (shipmentMatch && method === "PATCH") {
      const { status, data } = await updateShipmentStatus(
        decodeURIComponent(shipmentMatch[1]),
        await safeJson(req),
        user
      );
      return json(status, data);
    }
    if (shipmentMatch && method === "DELETE") {
      const { status, data } = await deleteShipment(decodeURIComponent(shipmentMatch[1]), user);
      return json(status, data);
    }

    if (pathname === "/clients" && method === "POST") {
      const { status, data } = await createClient(await safeJson(req), user);
      return json(status, data);
    }
    if (pathname === "/clients" && method === "GET") {
      const { status, data } = await listClients(query);
      return json(status, data);
    }

    const clientMatch = pathname.match(/^\/clients\/([^/]+)$/);
    if (clientMatch && method === "GET") {
      const { status, data } = await getClient(decodeURIComponent(clientMatch[1]));
      return json(status, data);
    }
    if (clientMatch && method === "PUT") {
      const { status, data } = await updateClient(
        decodeURIComponent(clientMatch[1]),
        await safeJson(req)
      );
      return json(status, data);
    }
    if (clientMatch && method === "DELETE") {
      const { status, data } = await deleteClient(decodeURIComponent(clientMatch[1]));
      return json(status, data);
    }

    // La caja de un Repartidor esta a cargo de su Sucursal: no tiene
    // acceso propio a ninguna ruta de Caja.
    if (pathname.startsWith("/cash") && user.role === "repartidor") {
      return json(403, { error: "No tenés acceso a Caja. Tu caja está a cargo de tu sucursal." });
    }

    if (pathname === "/cash/current" && method === "GET") {
      const { status, data } = await getCurrentSession(user);
      return json(status, data);
    }
    if (pathname === "/cash/open" && method === "POST") {
      const { status, data } = await openSession(await safeJson(req), user);
      return json(status, data);
    }
    if (pathname === "/cash/movements" && method === "POST") {
      const { status, data } = await addMovement(await safeJson(req), user);
      return json(status, data);
    }
    if (pathname === "/cash/close" && method === "POST") {
      const { status, data } = await closeSession(await safeJson(req), user);
      return json(status, data);
    }
    if (pathname === "/cash/sessions" && method === "GET") {
      const { status, data } = await listSessions(query, user);
      return json(status, data);
    }

    // Panel de cierres de caja de todas las sucursales: exclusivo de Admin.
    if (pathname === "/cash/sessions/all" && method === "GET") {
      if (user.role !== "admin") return json(403, { error: "No autorizado" });
      const { status, data } = await listAllSessions(query);
      return json(status, data);
    }

    // Gestion de usuarios: exclusiva de Admin.
    if (pathname.startsWith("/users") && user.role !== "admin") {
      return json(403, { error: "No autorizado" });
    }
    if (pathname === "/users" && method === "GET") {
      const { status, data } = await listUsers(query);
      return json(status, data);
    }
    if (pathname === "/users" && method === "POST") {
      const { status, data } = await createUser(await safeJson(req));
      return json(status, data);
    }
    const userMatch = pathname.match(/^\/users\/(\d+)$/);
    if (userMatch && method === "GET") {
      const { status, data } = await getUser(userMatch[1]);
      return json(status, data);
    }
    if (userMatch && method === "PUT") {
      const { status, data } = await updateUser(userMatch[1], await safeJson(req));
      return json(status, data);
    }
    if (userMatch && method === "DELETE") {
      const { status, data } = await deleteUser(userMatch[1], user.id);
      return json(status, data);
    }

    return json(404, { error: "Ruta no encontrada" });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Error interno del servidor" });
  }
};

export const config = { path: "/api/*" };
