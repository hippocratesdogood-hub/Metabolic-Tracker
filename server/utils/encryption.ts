import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * PHI (Protected Health Information) Encryption Module
 *
 * Uses AES-256-GCM for authenticated encryption of sensitive health data.
 * - 256-bit key (32 bytes)
 * - 96-bit IV (12 bytes) - recommended for GCM
 * - 128-bit authentication tag
 *
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the PHI encryption key from environment
 * Key must be 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.PHI_ENCRYPTION_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PHI_ENCRYPTION_KEY environment variable is required in production");
    }
    // Development fallback - NOT SECURE, just for testing
    console.warn("[SECURITY WARNING] Using development encryption key. Set PHI_ENCRYPTION_KEY in production!");
    return Buffer.from("0".repeat(64), "hex"); // 32 zero bytes
  }

  if (key.length !== 64) {
    throw new Error("PHI_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)");
  }

  return Buffer.from(key, "hex");
}

/**
 * Encrypt sensitive PHI data
 * @param plaintext - The sensitive data to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext
 */
export function encryptPHI(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt PHI data
 * @param ciphertext - Encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext
 */
export function decryptPHI(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(":")) {
    // Return as-is if not encrypted (for backwards compatibility during migration)
    return ciphertext;
  }

  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    // Not in expected format, return as-is
    return ciphertext;
  }

  const [ivHex, authTagHex, encrypted] = parts;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    // If decryption fails, data might not be encrypted yet
    // Return as-is for backwards compatibility
    console.error("PHI decryption failed, returning raw data:", error);
    return ciphertext;
  }
}

/**
 * Encrypt a JSON object's sensitive fields
 * @param obj - Object containing sensitive data
 * @param fields - Array of field names to encrypt
 * @returns New object with specified fields encrypted
 */
export function encryptObjectFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };

  for (const field of fields) {
    const value = result[field];
    if (value !== null && value !== undefined) {
      if (typeof value === "string") {
        (result as any)[field] = encryptPHI(value);
      } else if (typeof value === "object") {
        // Encrypt JSON objects as stringified JSON
        (result as any)[field] = encryptPHI(JSON.stringify(value));
      }
    }
  }

  return result;
}

/**
 * Decrypt a JSON object's sensitive fields
 * @param obj - Object containing encrypted data
 * @param fields - Array of field names to decrypt
 * @param jsonFields - Fields that should be parsed as JSON after decryption
 * @returns New object with specified fields decrypted
 */
export function decryptObjectFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[],
  jsonFields: (keyof T)[] = []
): T {
  const result = { ...obj };

  for (const field of fields) {
    const value = result[field];
    if (value !== null && value !== undefined && typeof value === "string") {
      const decrypted = decryptPHI(value);

      if (jsonFields.includes(field)) {
        try {
          (result as any)[field] = JSON.parse(decrypted);
        } catch {
          // If not valid JSON, keep as string
          (result as any)[field] = decrypted;
        }
      } else {
        (result as any)[field] = decrypted;
      }
    }
  }

  return result;
}

/**
 * Generate a new encryption key (for setup)
 * @returns 64-character hex string (32 bytes)
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Check if a string appears to be encrypted
 * @param value - String to check
 * @returns true if string matches encrypted format
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const parts = value.split(":");
  // Format: iv(24 hex chars):authTag(32 hex chars):ciphertext
  return parts.length === 3 &&
         parts[0].length === IV_LENGTH * 2 &&
         parts[1].length === AUTH_TAG_LENGTH * 2;
}
