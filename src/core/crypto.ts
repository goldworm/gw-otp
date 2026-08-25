/**
 * 암호화 모듈 (Web Crypto API)
 *
 * - PBKDF2로 마스터 비밀번호에서 AES-256 키 유도
 * - AES-GCM으로 데이터 암호화/복호화
 * - 비밀번호 검증을 위한 해시 생성/확인
 *
 * 이 모듈은 순수 TypeScript이며 UI 관련 의존성이 없다.
 */

/** PBKDF2 반복 횟수 (brute-force 방어) */
const PBKDF2_ITERATIONS = 600_000;

/** salt 길이 (bytes) */
const SALT_LENGTH = 16;

/** AES-GCM IV 길이 (bytes) */
const IV_LENGTH = 12;

/** 비밀번호 검증용 고정 문자열 */
const VERIFY_PLAINTEXT = 'gw-otp-verify';

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Uint8Array를 Base64 문자열로 변환
 */
export function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Base64 문자열을 Uint8Array로 변환
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
 * 랜덤 salt 생성
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * PBKDF2로 마스터 비밀번호에서 AES-256-GCM 키를 유도한다.
 *
 * @param password - 마스터 비밀번호
 * @param salt - PBKDF2 salt (Uint8Array)
 * @returns CryptoKey (AES-GCM 256-bit)
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

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * AES-256-GCM으로 평문을 암호화한다.
 *
 * 반환값: Base64(IV(12 bytes) + ciphertext + authTag(16 bytes))
 *
 * @param plaintext - 암호화할 평문
 * @param key - AES-GCM CryptoKey
 * @returns Base64 인코딩된 암호문
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

  // IV + ciphertext (authTag 포함)를 결합
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return bufferToBase64(combined);
}

/**
 * AES-256-GCM으로 암호문을 복호화한다.
 *
 * @param encryptedBase64 - Base64(IV + ciphertext + authTag)
 * @param key - AES-GCM CryptoKey
 * @returns 복호화된 평문
 * @throws 키가 올바르지 않거나 데이터가 변조된 경우
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
 * 마스터 비밀번호 검증용 해시를 생성한다.
 * 고정 문자열("gw-otp-verify")을 암호화한 결과를 저장하여
 * 이후 비밀번호 입력 시 복호화 성공 여부로 검증한다.
 *
 * @param key - 유도된 CryptoKey
 * @returns Base64 인코딩된 검증 암호문
 */
export async function createPasswordHash(key: CryptoKey): Promise<string> {
  return encrypt(VERIFY_PLAINTEXT, key);
}

/**
 * 마스터 비밀번호가 올바른지 검증한다.
 *
 * @param passwordHash - 저장된 검증 암호문 (Base64)
 * @param key - 입력된 비밀번호로 유도한 CryptoKey
 * @returns 비밀번호가 올바르면 true
 */
export async function verifyPassword(
  passwordHash: string,
  key: CryptoKey,
): Promise<boolean> {
  try {
    const decrypted = await decrypt(passwordHash, key);
    return decrypted === VERIFY_PLAINTEXT;
  } catch {
    // 복호화 실패 = 비밀번호 불일치
    return false;
  }
}

// ─── High-level API ──────────────────────────────────────────────────────────

/**
 * 최초 비밀번호 설정 시 호출.
 * salt와 passwordHash를 생성하여 반환한다.
 *
 * @param password - 마스터 비밀번호
 * @returns { salt, passwordHash, key } - storage에 저장할 값들과 세션 키
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
 * 잠금 해제 시 호출.
 * 저장된 salt와 passwordHash를 사용하여 비밀번호를 검증하고,
 * 성공 시 세션 키를 반환한다.
 *
 * @param password - 입력된 비밀번호
 * @param saltBase64 - 저장된 salt (Base64)
 * @param passwordHash - 저장된 검증 암호문 (Base64)
 * @returns CryptoKey (성공 시) 또는 null (실패 시)
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
