import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALG = "aes-256-gcm";

let _keyWarned = false;
let _cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (_cachedKey) return _cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (!_keyWarned) {
      _keyWarned = true;
      process.stderr.write(
        "[nova] WARNING: ENCRYPTION_KEY is not set. " +
        "A derived fallback key is being used. " +
        "Set ENCRYPTION_KEY to a stable secret so encrypted tokens survive bot-token rotations.\n"
      );
    }
    _cachedKey = scryptSync("nova-fallback-key-set-ENCRYPTION_KEY", "nova-salt-v1", 32) as Buffer;
  } else {
    _cachedKey = scryptSync(raw, "nova-salt-v1", 32) as Buffer;
  }
  return _cachedKey;
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
