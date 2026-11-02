import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/shared/errors.js";
import {
  assertSafeOutboundUrl,
  isPrivateAddress,
} from "../src/shared/outbound-url.js";

function rejectsWith(code: string) {
  return (error: unknown) => error instanceof HttpError && error.code === code;
}

test("detecta direcciones privadas, de loopback y de metadatos", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateAddress(address), false, address);
  }
});

test("en produccion exige HTTPS y bloquea redes privadas (SSRF)", async () => {
  const production = { allowPrivateNetworks: false };

  await assert.rejects(
    assertSafeOutboundUrl("http://example.com", production),
    rejectsWith("INSECURE_URL"),
  );
  await assert.rejects(
    assertSafeOutboundUrl(
      "https://169.254.169.254/latest/meta-data",
      production,
    ),
    rejectsWith("PRIVATE_NETWORK_URL"),
  );
  await assert.rejects(
    assertSafeOutboundUrl("https://127.0.0.1:5432", production),
    rejectsWith("PRIVATE_NETWORK_URL"),
  );
  await assert.rejects(
    assertSafeOutboundUrl("https://user:secret@8.8.8.8", production),
    rejectsWith("URL_WITH_CREDENTIALS"),
  );
  await assert.rejects(
    assertSafeOutboundUrl("no es una url", production),
    rejectsWith("INVALID_URL"),
  );

  const allowed = await assertSafeOutboundUrl(
    "https://8.8.8.8/api",
    production,
  );
  assert.equal(allowed.origin, "https://8.8.8.8");
});

test("en desarrollo permite servicios locales (Evolution o Chatwoot en localhost)", async () => {
  const url = await assertSafeOutboundUrl("http://localhost:8081", {
    allowPrivateNetworks: true,
  });
  assert.equal(url.origin, "http://localhost:8081");
});
