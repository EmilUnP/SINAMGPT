/** Connection-level failures that may retry on a fallback provider. HTTP errors do not. */
export const isUnreachableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  const cause =
    error.cause instanceof Error
      ? `${error.cause.name} ${error.cause.message}`
      : String(error.cause ?? "");
  const text = `${error.name} ${error.message} ${cause}`.toLowerCase();
  return (
    error.name === "TypeError" ||
    text.includes("fetch failed") ||
    text.includes("econnrefused") ||
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("etimedout") ||
    text.includes("econnreset") ||
    text.includes("network") ||
    text.includes("not reachable") ||
    text.includes("unreachable")
  );
};
