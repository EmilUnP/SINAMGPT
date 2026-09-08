import {
  isCloudMetadataHostname,
  isPrivateOrLocalHostname,
} from "@/lib/provider-url";

export class PublicUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicUrlError";
  }
}

const stripHost = (hostname: string): string =>
  hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

/**
 * Model-supplied URLs must be public http(s). LAN, loopback, link-local,
 * and cloud metadata are the attack — the inverse of provider URL policy.
 */
export const assertPublicHttpUrl = (
  raw: string,
  denyHosts: string[] = [],
): string => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new PublicUrlError("URL is missing or too long.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PublicUrlError("URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicUrlError("Only HTTP and HTTPS URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new PublicUrlError("Credentials in URLs are not allowed.");
  }

  const host = stripHost(url.hostname);
  if (!host) {
    throw new PublicUrlError("URL host is missing.");
  }
  if (isCloudMetadataHostname(host) || isPrivateOrLocalHostname(host)) {
    throw new PublicUrlError("Private, local, and metadata URLs are not allowed.");
  }

  const denied = denyHosts.some((entry) => hostMatchesDeny(host, entry));
  if (denied) {
    throw new PublicUrlError("This host is blocked by admin policy.");
  }

  return url.href;
};

export const hostMatchesDeny = (hostname: string, pattern: string): boolean => {
  const host = stripHost(hostname);
  const needle = stripHost(pattern.trim());
  if (!needle) return false;
  return host === needle || host.endsWith(`.${needle}`);
};

/**
 * Admin-configured search provider (SearXNG). LAN is allowed; metadata is not.
 */
export const normalizeSearchProviderUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Search provider URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Search provider URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Search provider credentials must not be embedded in the URL.");
  }
  if (url.search || url.hash) {
    throw new Error("Search provider URL must not include a query or fragment.");
  }
  const hostname = stripHost(url.hostname);
  if (isCloudMetadataHostname(hostname)) {
    throw new Error("Cloud metadata endpoints cannot be search providers.");
  }
  return url.toString().replace(/\/+$/, "");
};
