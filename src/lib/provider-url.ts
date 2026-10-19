const stripHostDecorators = (hostname: string): string =>
  hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

/**
 * IPv4-mapped IPv6 → dotted quad. WHATWG `new URL()` rewrites
 * `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, so the hex form has to be decoded
 * or loopback and RFC1918 addresses slip past the string checks below.
 * Handles `::ffff:a.b.c.d`, `::ffff:7f00:1`, and the expanded `0:0:0:0:0:ffff:…`.
 */
const mappedIpv4 = (hostname: string): string | null => {
  const host = stripHostDecorators(hostname);
  if (!host.includes(":")) return null;

  const tail = host
    .replace(/^0{0,4}(:0{0,4}){0,4}:ffff:/, "")
    .replace(/^::ffff:/, "");
  if (tail === host) return null;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) return tail;

  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = Number.parseInt(hex[1]!, 16);
  const low = Number.parseInt(hex[2]!, 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
};

/** Cloud instance-metadata hosts, including common encodings. */
export const isCloudMetadataHostname = (hostname: string): boolean => {
  const host = stripHostDecorators(hostname);

  const mapped = mappedIpv4(host);
  if (mapped && mapped !== host) return isCloudMetadataHostname(mapped);
  if (
    host === "metadata.google.internal" ||
    host.endsWith(".metadata.google.internal")
  ) {
    return true;
  }
  if (
    host === "0:0:0:0:0:ffff:a9fe:a9fe" ||
    host === "::ffff:a9fe:a9fe" ||
    host === "a9fe:a9fe" ||
    host === "fd00:ec2::254"
  ) {
    return true;
  }
  if (host.startsWith("::ffff:")) {
    return isCloudMetadataHostname(host.slice("::ffff:".length));
  }
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b, c, d] = ipv4.slice(1).map(Number);
  if ([a, b, c, d].some((octet) => octet > 255)) return false;
  if (a === 169 && b === 254 && c === 169 && d === 254) return true;
  if (a === 100 && b === 100 && c === 100 && d === 200) return true;
  return false;
};

/** Hostnames that stay inside the building (loopback, RFC1918, link-local, ULA). */
export const isPrivateOrLocalHostname = (hostname: string): boolean => {
  const host = stripHostDecorators(hostname);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

  const mapped = mappedIpv4(host);
  if (mapped && mapped !== host) return isPrivateOrLocalHostname(mapped);

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  if (host.includes(":")) {
    const compact = host.replace(/^::ffff:/, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(compact)) {
      return isPrivateOrLocalHostname(compact);
    }
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("fe80")) return true;
    return false;
  }

  return false;
};

export const providerUrlIsRemote = (baseUrl: string): boolean => {
  try {
    const url = new URL(baseUrl.trim());
    return !isPrivateOrLocalHostname(url.hostname);
  } catch {
    return false;
  }
};

export const REMOTE_PROVIDER_ACK_MESSAGE =
  "This URL is not on your LAN. Confirm that traffic may leave the building.";
