/**
 * Cryptography module (Web Crypto API)
 *
 * - Derive an AES-256 key from the master password using PBKDF2
 * - Encrypt/decrypt data with AES-GCM
 * - Create/verify a hash used for password verification
 *
 * This module is pure TypeScript and has no UI dependencies.
 */

/** PBKDF2 iteration count (brute-force resistance) */
const PBKDF2_ITERATIONS = 600_000;

/** Salt length (bytes) */
const SALT_LENGTH = 16;

/** AES-GCM IV length (bytes) */
const IV_LENGTH = 12;

/** Fixed plaintext used for password verification */
const VERIFY_PLAINTEXT = 'gw-otp-verify';

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Convert a Uint8Array to a Base64 string.
 */
export function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Convert a Base64 string to a Uint8Array.
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Key Derivation ──────────────────────────────────────────────────────────

/**
 * Generate a random salt.
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Derive an AES-256-GCM key from the master password using PBKDF2.
 *
 * @param password - the master password
 * @param salt - the PBKDF2 salt (Uint8Array)
 * @returns a CryptoKey (AES-GCM 256-bit)
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt) as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Restore a raw base64-encoded AES-GCM key back into a CryptoKey.
 * Used by the popup to restore the session key passed from the background.
 *
 * @param base64 - the Base64 encoding of the raw key
 * @returns a CryptoKey (AES-GCM 256-bit)
 */
export async function importKeyFromBase64(base64: string): Promise<CryptoKey> {
  const bytes = base64ToBuffer(base64);
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(bytes) as unknown as BufferSource,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * Return value: Base64(IV(12 bytes) + ciphertext + authTag(16 bytes))
 *
 * @param plaintext - the plaintext to encrypt
 * @param key - the AES-GCM CryptoKey
 * @returns the Base64-encoded ciphertext
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );

  // Concatenate IV + ciphertext (which includes the authTag)
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return bufferToBase64(combined);
}

/**
 * Decrypt ciphertext with AES-256-GCM.
 *
 * @param encryptedBase64 - Base64(IV + ciphertext + authTag)
 * @param key - the AES-GCM CryptoKey
 * @returns the decrypted plaintext
 * @throws if the key is incorrect or the data has been tampered with
 */
export async function decrypt(
  encryptedBase64: string,
  key: CryptoKey,
): Promise<string> {
  const combined = base64ToBuffer(encryptedBase64);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// ─── Password Verification ───────────────────────────────────────────────────

/**
 * Create a verification hash for the master password.
 * Stores the ciphertext of a fixed string ("gw-otp-verify") so that a later
 * password attempt can be verified by whether decryption succeeds.
 *
 * @param key - the derived CryptoKey
 * @returns the Base64-encoded verification ciphertext
 */
export async function createPasswordHash(key: CryptoKey): Promise<string> {
  return encrypt(VERIFY_PLAINTEXT, key);
}

/**
 * Verify whether the master password is correct.
 *
 * @param passwordHash - the stored verification ciphertext (Base64)
 * @param key - the CryptoKey derived from the entered password
 * @returns true if the password is correct
 */
export async function verifyPassword(
  passwordHash: string,
  key: CryptoKey,
): Promise<boolean> {
  try {
    const decrypted = await decrypt(passwordHash, key);
    return decrypted === VERIFY_PLAINTEXT;
  } catch {
    // Decryption failure = password mismatch
    return false;
  }
}

// ─── High-level API ──────────────────────────────────────────────────────────

/**
 * Called when the password is set for the first time.
 * Generates and returns the salt and passwordHash.
 *
 * @param password - the master password
 * @returns { salt, passwordHash, key } - values to persist plus the session key
 */
export async function initializePassword(password: string): Promise<{
  salt: string;
  passwordHash: string;
  key: CryptoKey;
}> {
  const saltBytes = generateSalt();
  const key = await deriveKey(password, saltBytes);
  const passwordHash = await createPasswordHash(key);

  return {
    salt: bufferToBase64(saltBytes),
    passwordHash,
    key,
  };
}

/**
 * Called when unlocking.
 * Verifies the password using the stored salt and passwordHash, and returns
 * the session key on success.
 *
 * @param password - the entered password
 * @param saltBase64 - the stored salt (Base64)
 * @param passwordHash - the stored verification ciphertext (Base64)
 * @returns a CryptoKey (on success) or null (on failure)
 */
export async function unlockWithPassword(
  password: string,
  saltBase64: string,
  passwordHash: string,
): Promise<CryptoKey | null> {
  const salt = base64ToBuffer(saltBase64);
  const key = await deriveKey(password, salt);
  const isValid = await verifyPassword(passwordHash, key);
  return isValid ? key : null;
}
