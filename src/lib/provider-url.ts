/** Hostnames that stay inside the building (loopback, RFC1918, link-local, ULA). */
export const isPrivateOrLocalHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

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
