// Departamentos y ciudades que la empresa realmente trabaja (no todo
// Paraguay). Se usa para los buscadores de ciudad (Origen/Destino/perfil)
// y para el filtro por departamento de la Planilla.
export const PY_DEPARTMENTS = [
  {
    name: "Central",
    cities: [
      "Asunción", "Fernando de la Mora", "Capiatá", "Lambaré", "Ñemby",
      "San Lorenzo", "Limpio", "Luque", "Mariano Roque Alonso",
    ],
  },
  {
    name: "Alto Paraná",
    cities: ["Ciudad del Este", "Hernandarias"],
  },
  {
    name: "Amambay",
    cities: ["Capitán Bado", "Pedro Juan Caballero"],
  },
  {
    name: "Concepción",
    cities: ["Concepción"],
  },
  {
    name: "Itapúa",
    cities: ["Encarnación"],
  },
  {
    name: "Canindeyú",
    cities: ["Salto del Guairá", "Katueté", "Puente Kyha", "La Paloma"],
  },
];

// Lista plana de todas las ciudades, ordenada alfabeticamente. Usada por
// los buscadores (datalist) de Origen/Destino y ciudad de perfil.
export const PY_CITIES = PY_DEPARTMENTS.flatMap((d) => d.cities).sort((a, b) =>
  a.localeCompare(b, "es")
);

// Dado el nombre de una ciudad, devuelve el departamento al que pertenece
// (o null si no coincide con ninguna ciudad conocida). Comparacion sin
// distinguir mayusculas/acentos exactos de mas/menos espacios.
export function findDepartmentForCity(city) {
  if (!city) return null;
  const normalized = city.trim().toLowerCase();
  for (const dept of PY_DEPARTMENTS) {
    if (dept.cities.some((c) => c.toLowerCase() === normalized)) return dept.name;
  }
  return null;
}
