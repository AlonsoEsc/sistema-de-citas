import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@citas/db";
import {
  isRetryableTransactionError,
  retryOnTransactionConflict,
} from "../src/shared/prisma-errors.js";

function postgresError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("error de base de datos", {
    code: "P2010",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { code } } },
  });
}

test("solo los deadlocks y conflictos de serializacion se reintentan", () => {
  assert.equal(isRetryableTransactionError(postgresError("40P01")), true);
  assert.equal(isRetryableTransactionError(postgresError("40001")), true);
  assert.equal(isRetryableTransactionError(postgresError("23P01")), false);
  assert.equal(isRetryableTransactionError(new Error("otro")), false);
});

test("una transaccion que choca por concurrencia se repite hasta 3 veces", async () => {
  let calls = 0;
  const result = await retryOnTransactionConflict(async () => {
    calls += 1;
    if (calls < 3) {
      throw postgresError("40P01");
    }
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 3);

  let failingCalls = 0;
  await assert.rejects(
    retryOnTransactionConflict(async () => {
      failingCalls += 1;
      throw postgresError("40P01");
    }),
  );
  assert.equal(failingCalls, 3, "no reintenta para siempre");

  let otherCalls = 0;
  await assert.rejects(
    retryOnTransactionConflict(async () => {
      otherCalls += 1;
      throw postgresError("23P01");
    }),
  );
  assert.equal(otherCalls, 1, "un conflicto de negocio no se reintenta");
});
