import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isProduction } from "../config.js";
import { badRequest } from "./errors.js";

function ipv4ToNumber(address: string) {
  return address
    .split(".")
    .reduce((total, octet) => total * 256 + Number(octet), 0);
}

const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
];

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const value = ipv4ToNumber(address);
    return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) >>> 0 === (ipv4ToNumber(base) & mask) >>> 0;
    });
  }
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) {
    return isPrivateAddress(mappedIpv4[1]);
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    /^f[cd]/.test(normalized) ||
    /^fe[89ab]/.test(normalized)
  );
}

/**
 * Valida una URL de un servicio externo configurada por un negocio (Evolution, Chatwoot)
 * antes de que el servidor le haga peticiones. En produccion exige HTTPS y bloquea
 * direcciones privadas, de loopback y de metadatos de la nube (SSRF).
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  options: { allowPrivateNetworks?: boolean } = {},
) {
  const allowPrivateNetworks = options.allowPrivateNetworks ?? !isProduction;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw badRequest("La URL no es valida", "INVALID_URL");
  }

  const allowedProtocols = allowPrivateNetworks
    ? ["https:", "http:"]
    : ["https:"];
  if (!allowedProtocols.includes(url.protocol)) {
    throw badRequest("La URL debe usar HTTPS", "INSECURE_URL");
  }
  if (url.username || url.password) {
    throw badRequest(
      "La URL no puede incluir credenciales",
      "URL_WITH_CREDENTIALS",
    );
  }
  if (allowPrivateNetworks) {
    return url;
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [hostname]
    : await lookup(hostname, { all: true })
        .then((rows) => rows.map((row) => row.address))
        .catch(() => {
          throw badRequest(
            "No se pudo resolver el dominio de la URL",
            "UNRESOLVABLE_URL",
          );
        });
  if (addresses.some(isPrivateAddress)) {
    throw badRequest(
      "La URL apunta a una red privada y no esta permitida",
      "PRIVATE_NETWORK_URL",
    );
  }
  return url;
}
