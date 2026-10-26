// Consulta de contribuyentes por RUC/CI en el padron publico de Tu RUC
// (https://turuc.com.py/swagger-ui/index.html). Se hace desde el backend
// para no depender de CORS ni exponer el servicio externo al navegador.
const TURUC_URL = "https://turuc.com.py/api/contribuyente";

export async function lookupContribuyente(query) {
  const ruc = (query.ruc || "").trim();
  if (!ruc) return { status: 400, data: { error: "El RUC o CI es requerido" } };

  try {
    const res = await fetch(`${TURUC_URL}?ruc=${encodeURIComponent(ruc)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404 || res.status === 400) {
      return { status: 404, data: { error: "No se encontró el contribuyente" } };
    }
    if (!res.ok) throw new Error(`Tu RUC respondió ${res.status}`);
    const body = await res.json();
    const c = body?.data;
    if (!c || !c.razonSocial) return { status: 404, data: { error: "No se encontró el contribuyente" } };
    return {
      status: 200,
      data: {
        contribuyente: {
          ruc: c.ruc,
          razonSocial: c.razonSocial,
          estado: c.estado,
          esPersonaJuridica: !!c.esPersonaJuridica,
        },
      },
    };
  } catch (err) {
    console.error("Consulta de contribuyente fallida:", err.message);
    return { status: 502, data: { error: "No se pudo consultar el padrón de contribuyentes" } };
  }
}
