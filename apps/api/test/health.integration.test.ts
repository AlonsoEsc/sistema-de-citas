import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";

test("health responde sin base y ready confirma la conexion", async () => {
  const app = await buildApp();
  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().ok, true);

    const ready = await app.inject({ method: "GET", url: "/ready" });
    assert.equal(ready.statusCode, 200);
    assert.equal(ready.json().ok, true);
  } finally {
    await app.close();
  }
});
