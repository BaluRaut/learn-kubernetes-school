// Data layer with two modes:
//   1. If DATABASE_URL is set  -> PostgreSQL (used with docker-compose and on AWS RDS)
//   2. If DATABASE_URL is NOT set -> in-memory store (lets you run the API with zero setup)
//
// This keeps the learning path gradual: run it plain first, add Postgres later.
import pg from "pg";

const usePostgres = Boolean(process.env.DATABASE_URL);
let pool = null;

const memory = {
  students: [
    { id: 1, name: "Aarav Sharma", grade: "5A" },
    { id: 2, name: "Diya Patel", grade: "6B" },
  ],
  teachers: [{ id: 1, name: "Mrs. Kulkarni", subject: "Mathematics" }],
  nextId: { students: 3, teachers: 2 },
};

export async function init() {
  if (!usePostgres) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL
    );
  `);
}

// Used by the Kubernetes readiness probe: the pod only receives traffic
// once its database connection actually works.
export async function ping() {
  if (!usePostgres) return true;
  await pool.query("SELECT 1");
  return true;
}

export async function list(table) {
  if (!usePostgres) return memory[table];
  const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
  return rows;
}

export async function get(table, id) {
  if (!usePostgres) return memory[table].find((r) => r.id === id) ?? null;
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function create(table, fields) {
  if (!usePostgres) {
    const row = { id: memory.nextId[table]++, ...fields };
    memory[table].push(row);
    return row;
  }
  const cols = Object.keys(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const { rows } = await pool.query(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    Object.values(fields),
  );
  return rows[0];
}

export async function remove(table, id) {
  if (!usePostgres) {
    const idx = memory[table].findIndex((r) => r.id === id);
    if (idx === -1) return false;
    memory[table].splice(idx, 1);
    return true;
  }
  const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return rowCount > 0;
}

export function mode() {
  return usePostgres ? "postgres" : "in-memory";
}
