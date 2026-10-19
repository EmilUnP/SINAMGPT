import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const API_KEY_VERSION = "v1";

const encryptionKey = (): Buffer => {
  const dedicated = process.env.PROVIDER_KEY_SECRET?.trim();
  const session = process.env.SESSION_SECRET?.trim();
  const secret = dedicated || session;
  if (!secret) {
    throw new Error(
      "PROVIDER_KEY_SECRET or SESSION_SECRET is required to encrypt provider API keys.",
    );
  }
  return createHash("sha256")
    .update("sinamgpt:provider-api-key:v1\0")
    .update(secret)
    .digest();
};

export const encryptProviderApiKey = (apiKey: string): string => {
  const value = apiKey.trim();
  if (!value) throw new Error("Provider API key cannot be empty.");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    API_KEY_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

export const decryptProviderApiKey = (encrypted: string): string => {
  const [version, ivRaw, tagRaw, ciphertextRaw, extra] = encrypted.split(".");
  if (
    version !== API_KEY_VERSION ||
    !ivRaw ||
    !tagRaw ||
    !ciphertextRaw ||
    extra
  ) {
    throw new Error("Provider API key has an unsupported encrypted format.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Provider API key could not be decrypted. Check PROVIDER_KEY_SECRET or SESSION_SECRET.",
    );
  }
};

