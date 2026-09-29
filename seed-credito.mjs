// Datos de prueba para la pantalla de Crédito.
//   node --env-file=.env seed-credito.mjs         -> carga los datos
//   node --env-file=.env seed-credito.mjs clean   -> los elimina
import { ensureSchema, sql } from "./netlify/functions/lib/db.js";
import { createCreditReport } from "./netlify/functions/lib/credits.js";

const MARKER = "[SEED CREDITO]";
const CREATED_BY = 1; // admin
const RUCS = ["80011223-4", "80022334-5", "80033445-6", "80044556-7", "80055667-8"];

const companies = [
  { name: "Distribuidora La Estrella S.A.", dni: "80011223-4" },
  { name: "Farmacia San Roque S.R.L.", dni: "80022334-5" },
  { name: "Importadora Guaraní S.A.", dni: "80033445-6" },
  { name: "Comercial del Este", dni: "80044556-7" },
  { name: "Ferretería Central", dni: "80055667-8" },
];

const cities = [
  "Ciudad del Este", "Encarnación", "Coronel Oviedo", "Pedro Juan Caballero",
  "Salto del Guairá", "Hernandarias", "Caaguazú",
];
const people = [
  "Rossana Benítez", "Miguel Ávalos", "Lucía Portillo", "Derlis Cardozo",
  "Nadia Fretes", "Osvaldo Gaona", "Belén Riquelme", "Hugo Meza",
  "Carmen Duarte", "Fabio Ortellado", "Sandra Vega", "Elvio Cáceres",
  "Norma Bogado", "Cristian Paredes", "Yenny Acosta", "Marcos Frutos",
];
let p = 0;
const nextPerson = () => people[p++ % people.length];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// [empresa, monto, created_at ISO en UTC (-3h = hora Asunción)]
const rows = [
  [0, 145000, "2026-09-01T13:10:00Z"],
  [0, 90000, "2026-09-02T14:30:00Z"],
  [0, 62000, "2026-09-04T12:05:00Z"],
  [0, 118000, "2026-09-06T16:40:00Z"],
  [0, 75000, "2026-08-18T13:00:00Z"],
  [0, 132000, "2026-08-25T15:20:00Z"],

  [1, 48000, "2026-09-02T11:15:00Z"],
  [1, 53000, "2026-09-03T17:00:00Z"],
  [1, 39000, "2026-09-05T13:45:00Z"],

  [2, 210000, "2026-09-01T12:00:00Z"],
  [2, 175000, "2026-09-01T18:30:00Z"],
  [2, 96000, "2026-09-03T14:10:00Z"],
  [2, 140000, "2026-09-04T15:50:00Z"],
  [2, 88000, "2026-09-06T11:25:00Z"],

  [3, 67000, "2026-09-02T13:20:00Z"],
  [3, 54000, "2026-09-03T16:05:00Z"],
  [3, 79000, "2026-09-05T12:40:00Z"],

  [4, 43000, "2026-09-04T13:30:00Z"],
  [4, 61000, "2026-09-06T15:15:00Z"],
  [4, 58000, "2026-08-22T14:00:00Z"],
];

async function cleanup() {
  await sql`
    DELETE FROM credit_reports
    WHERE client_key = ANY(${RUCS})
       OR id IN (SELECT DISTINCT credit_report_id FROM shipments
                 WHERE package_content = ${MARKER} AND credit_report_id IS NOT NULL)
  `;
  await sql`DELETE FROM shipment_status_history
            WHERE shipment_id IN (SELECT id FROM shipments WHERE package_content = ${MARKER})`;
  await sql`DELETE FROM shipments WHERE package_content = ${MARKER}`;
}

async function main() {
  await ensureSchema();
  await cleanup(); // idempotente: se puede correr varias veces

  const inserted = [];
  for (const [ci, amount, iso] of rows) {
    const c = companies[ci];
    const [row] = await sql`
      INSERT INTO shipments (
        sender_name, sender_dni, sender_address, sender_phone,
        recipient_name, recipient_address, recipient_phone,
        package_type, package_content, package_quantity,
        origin, destination, cost, total,
        payment_method, status, created_by, created_at, updated_at
      ) VALUES (
        ${c.name}, ${c.dni}, 'Av. Mcal. López 1234', '0981123456',
        ${nextPerson()}, 'Barrio Centro', '0985000000',
        'Paquete', ${MARKER}, 1,
        'Asunción', ${pick(cities)}, ${amount}, ${amount},
        'Crédito', 'Registrado', ${CREATED_BY}, ${iso}::timestamptz, ${iso}::timestamptz
      )
      RETURNING code, sender_dni, created_at
    `;
    inserted.push(row);
  }

  // Informe PENDIENTE de cobro: Importadora Guaraní, 2 boletas de septiembre.
  const guaraniSep = inserted
    .filter((r) => r.sender_dni === "80033445-6" && r.created_at.toISOString().startsWith("2026-09"))
    .slice(0, 2)
    .map((r) => r.code);
  const pend = await createCreditReport({ codes: guaraniSep, paid: false }, { id: CREATED_BY });
  console.log("Informe PENDIENTE:", pend.data.report?.code || pend.data.error);

  // Informe PAGADO: Comercial del Este, sus 3 boletas de septiembre.
  const cde = inserted.filter((r) => r.sender_dni === "80044556-7").map((r) => r.code);
  const paid = await createCreditReport({ codes: cde, paid: true }, { id: CREATED_BY });
  console.log("Informe PAGADO:   ", paid.data.report?.code || paid.data.error);

  const summary = await sql`
    SELECT sender_name AS empresa,
      count(*)::int AS boletas,
      count(*) FILTER (WHERE paid_at IS NULL)::int AS impagas,
      count(*) FILTER (WHERE credit_report_id IS NULL AND paid_at IS NULL)::int AS sin_informe,
      to_char(sum(total) FILTER (WHERE paid_at IS NULL), 'FM999G999G999') AS saldo
    FROM shipments WHERE package_content = ${MARKER}
    GROUP BY 1 ORDER BY 1
  `;
  console.table(summary);
}

const done = () => sql`SELECT 1`.then(() => process.exit(0));
if (process.argv[2] === "clean") {
  ensureSchema().then(cleanup).then(() => console.log("Datos de prueba eliminados.")).then(done)
    .catch((e) => { console.error(e); process.exit(1); });
} else {
  main().then(() => console.log("\nDatos de prueba cargados (mes actual: septiembre 2026)."))
    .then(done).catch((e) => { console.error(e); process.exit(1); });
}
