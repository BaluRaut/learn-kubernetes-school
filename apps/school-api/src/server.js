// School Management API — intentionally small so the focus stays on
// Docker / Kubernetes / Terraform / CircleCI, not on application code.
import express from "express";
import * as db from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------------------------
// Health endpoints — Kubernetes calls these (see k8s/deployment.yaml probes)
// ---------------------------------------------------------------------------
// Liveness: "is the process alive?" — if this fails, Kubernetes restarts the pod.
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// Readiness: "can I serve traffic?" — if this fails, Kubernetes stops sending
// requests to the pod (e.g. while the database is unreachable) but does not restart it.
app.get("/readyz", async (_req, res) => {
  try {
    await db.ping();
    res.json({ status: "ready", db: db.mode() });
  } catch {
    res.status(503).json({ status: "not-ready" });
  }
});

app.get("/", (_req, res) =>
  res.json({
    service: "school-api",
    version: process.env.APP_VERSION || "dev",
    db: db.mode(),
    endpoints: ["/students", "/teachers", "/healthz", "/readyz"],
  }),
);

// ---------------------------------------------------------------------------
// CRUD routes for students and teachers
// ---------------------------------------------------------------------------
function crudRoutes(table, requiredFields) {
  const router = express.Router();

  router.get("/", async (_req, res) => res.json(await db.list(table)));

  router.get("/:id", async (req, res) => {
    const row = await db.get(table, Number(req.params.id));
    if (!row) return res.status(404).json({ error: `${table} entry not found` });
    res.json(row);
  });

  router.post("/", async (req, res) => {
    const missing = requiredFields.filter((f) => !req.body?.[f]);
    if (missing.length) {
      return res.status(400).json({ error: `missing fields: ${missing.join(", ")}` });
    }
    const fields = Object.fromEntries(requiredFields.map((f) => [f, req.body[f]]));
    res.status(201).json(await db.create(table, fields));
  });

  router.delete("/:id", async (req, res) => {
    const deleted = await db.remove(table, Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: `${table} entry not found` });
    res.status(204).end();
  });

  return router;
}

app.use("/students", crudRoutes("students", ["name", "grade"]));
app.use("/teachers", crudRoutes("teachers", ["name", "subject"]));

await db.init();
app.listen(PORT, () => {
  console.log(`school-api listening on port ${PORT} (db: ${db.mode()})`);
});
