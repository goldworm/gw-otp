// ─── OTP Entry ───────────────────────────────────────────────────────────────

/** HMAC algorithm */
export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** Number of OTP digits */
export type Digits = 6 | 8;

/** OTP type: TOTP (time-based) or HOTP (counter-based) */
export type OTPType = 'totp' | 'hotp';

/** OTP entry */
export interface OTPEntry {
  /** Unique identifier (UUID v4) */
  id: string;
  /** OTP type (optional, default 'totp' — for backward compatibility) */
  type?: OTPType;
  /** Service provider name (e.g. Google, GitHub) */
  issuer: string;
  /** Account identifier (e.g. hello@gmail.com) */
  label: string;
  /** Encrypted secret key (Base64-encoded) */
  encryptedSecret: string;
  /** List of assigned tag IDs */
  tags: string[];
  /** HMAC algorithm */
  algorithm: Algorithm;
  /** Number of OTP digits */
  digits: Digits;
  /** Refresh period (seconds, TOTP only) */
  period: number;
  /** HOTP counter (HOTP only, default 0) */
  counter?: number;
  /** Whether pinned to the top (optional, default false) */
  pinned?: boolean;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Update timestamp (ISO 8601) */
  updatedAt: string;
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

/** Tag */
export interface Tag {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Tag display name */
  name: string;
  /** Tag color (hex) */
  color: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

/** Theme setting */
export type Theme = 'light' | 'dark' | 'system';

/** Auto-lock delay (minutes). 0 = immediately on popup close, 'never' = manual lock only */
export type AutoLockMinutes = 0 | 1 | 5 | 10 | 15 | 30 | 'never';

/** Supported languages */
export type Language = 'en' | 'ko';

/** App settings */
export interface Settings {
  /** Show OTP codes only on hover */
  hideCodesUntilHover: boolean;
  /** Theme setting */
  theme: Theme;
  /** Auto-lock delay (minutes) */
  autoLockMinutes: AutoLockMinutes;
  /** UI language */
  language: Language;
  /** Ciphertext used to verify the master password (Base64) */
  passwordHash: string;
  /** PBKDF2 salt (Base64) */
  salt: string;
}

// ─── Storage Schema ──────────────────────────────────────────────────────────

/** The full data structure stored in chrome.storage.local */
export interface StorageSchema {
  /** Settings */
  settings: Settings;
  /** List of OTP entries */
  entries: OTPEntry[];
  /** List of tags */
  tags: Tag[];
  /** OTP display order (array of entry IDs) */
  order: string[];
}

// ─── Messages (Background ↔ Popup) ──────────────────────────────────────────

/** Popup → Background request */
export type MessageRequest =
  | { type: 'unlock'; password: string }
  | { type: 'lock' }
  | { type: 'getStatus' }
  | { type: 'getKey' }
  | { type: 'resetTimer' }
  | { type: 'changePassword'; currentPassword: string; newPassword: string };

/** Background → Popup response */
export type MessageResponse =
  | { type: 'unlock'; success: boolean; error?: string }
  | { type: 'lock'; success: boolean }
  | { type: 'getStatus'; isUnlocked: boolean; isInitialized: boolean }
  | { type: 'getKey'; key: string | null }
  | {
      type: 'changePassword';
      success: boolean;
      error?: string;
      newKey?: CryptoKey;
    };

// ─── Backup ──────────────────────────────────────────────────────────────────

/** Export file structure */
export interface BackupFile {
  /** File format version */
  version: 1;
  /** Creation timestamp (ISO 8601) */
  exportedAt: string;
  /** PBKDF2 salt (Base64, backup-specific) */
  salt: string;
  /** Encrypted data (Base64) */
  encryptedData: string;
}

// ─── OTP Auth URI (parse result) ─────────────────────────────────────────────

/** Result of parsing an otpauth:// URI */
export interface ParsedOTPAuthURI {
  /** OTP type (totp or hotp) */
  type: OTPType;
  /** Service provider */
  issuer: string;
  /** Account identifier */
  label: string;
  /** Secret (plaintext, Base32-encoded) */
  secret: string;
  /** Algorithm */
  algorithm: Algorithm;
  /** Number of digits */
  digits: Digits;
  /** Refresh period (TOTP only) */
  period: number;
  /** HOTP counter (HOTP only) */
  counter?: number;
}

// ─── Page Navigation ─────────────────────────────────────────────────────────

/** Page within the popup */
export type Page = 'unlock' | 'main' | 'add' | 'edit' | 'settings';
