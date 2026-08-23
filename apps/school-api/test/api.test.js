// Minimal smoke test run by CircleCI (`npm test`).
// It exercises the data layer in in-memory mode — enough to prove the
// pipeline runs real tests before building the Docker image.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as db from "../src/db.js";

test("lists seeded students", async () => {
  const students = await db.list("students");
  assert.ok(students.length >= 2);
  assert.equal(students[0].name, "Aarav Sharma");
});

test("creates and deletes a student", async () => {
  const created = await db.create("students", { name: "Test Kid", grade: "1A" });
  assert.ok(created.id);
  const fetched = await db.get("students", created.id);
  assert.equal(fetched.name, "Test Kid");
  assert.equal(await db.remove("students", created.id), true);
  assert.equal(await db.get("students", created.id), null);
});
