const FALLBACK_ORIGIN = "http://127.0.0.1:3055";

const firstHeaderValue = (value: string | null): string =>
  value?.split(",")[0]?.trim() || "";

const isSafeHost = (host: string): boolean =>
  host.length > 0 && host.length <= 253 && !/[\s/]/.test(host);

export const resolveAppOrigin = (request: Request): string => {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      // fall through to the request host
    }
  }

  const trustProxy = process.env.TRUST_PROXY === "1";
  const host = firstHeaderValue(
    trustProxy
      ? request.headers.get("x-forwarded-host") || request.headers.get("host")
      : request.headers.get("host"),
  );

  if (!isSafeHost(host)) return FALLBACK_ORIGIN;

  const forwardedProto = trustProxy
    ? firstHeaderValue(request.headers.get("x-forwarded-proto"))
    : "";
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : process.env.NODE_ENV === "production"
        ? "https"
        : "http";

  return `${proto}://${host}`;
};
