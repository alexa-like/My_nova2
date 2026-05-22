import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALG = "aes-256-gcm";

function getKey(): Buffer {
  const raw =
    process.env.ENCRYPTION_KEY ||
    process.env.TELEGRAM_BOT_TOKEN ||
    "nova-default-enc-key-change-me!!";
  return scryptSync(raw, "nova-salt-v1", 32) as Buffer;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a dot-separated string: iv.authTag.ciphertext (all hex).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value previously encrypted with `encrypt`.
 * Returns null if the value is invalid or tampered.
 */
export function decrypt(encoded: string): string | null {
  try {
    const parts = encoded.split(".");
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(cipherHex, "hex");
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
