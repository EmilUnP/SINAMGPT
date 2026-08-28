/** Login/register identifier: a short username or a normal email address. */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const ACCOUNT_NAME_MAX = 254;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export type AccountNameIssue = "empty" | "min" | "max" | "chars" | "email";

export type AccountNameResult =
  | { ok: true; value: string }
  | { ok: false; issue: AccountNameIssue };

export const parseAccountName = (raw: string): AccountNameResult => {
  const value = raw.trim();
  if (!value) return { ok: false, issue: "empty" };

  if (value.includes("@")) {
    if (value.length > ACCOUNT_NAME_MAX) return { ok: false, issue: "max" };
    if (!EMAIL_RE.test(value)) return { ok: false, issue: "email" };
    return { ok: true, value };
  }

  if (value.length < USERNAME_MIN) return { ok: false, issue: "min" };
  if (value.length > USERNAME_MAX) return { ok: false, issue: "max" };
  if (!USERNAME_RE.test(value)) return { ok: false, issue: "chars" };
  return { ok: true, value };
};

export const displayAccountName = (accountName: string): string => {
  const trimmed = accountName.trim();
  const at = trimmed.indexOf("@");
  if (at > 0) return trimmed.slice(0, at);
  return trimmed;
};
