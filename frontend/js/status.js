export const STATUS_ORDER = ["Registrado", "En transito", "En reparto", "Entregado"];

export function statusClass(status) {
  switch (status) {
    case "Registrado": return "badge-registrado";
    case "En transito": return "badge-transito";
    case "En reparto": return "badge-reparto";
    case "Entregado": return "badge-entregado";
    case "Cancelado": return "badge-cancelado";
    default: return "badge-registrado";
  }
}

export function formatDate(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString.replace(" ", "T") + "Z");
  return d.toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return `$${n.toFixed(2)}`;
}
