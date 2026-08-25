// ─── OTP Entry ───────────────────────────────────────────────────────────────

/** HMAC 알고리즘 */
export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** OTP 자릿수 */
export type Digits = 6 | 8;

/** OTP 항목 */
export interface OTPEntry {
  /** 고유 식별자 (UUID v4) */
  id: string;
  /** 서비스 제공자 이름 (예: Google, GitHub) */
  issuer: string;
  /** 계정 식별자 (예: hello@gmail.com) */
  label: string;
  /** 암호화된 secret 키 (Base64 인코딩) */
  encryptedSecret: string;
  /** 할당된 태그 ID 목록 */
  tags: string[];
  /** HMAC 알고리즘 */
  algorithm: Algorithm;
  /** OTP 자릿수 */
  digits: Digits;
  /** 갱신 주기 (초) */
  period: number;
  /** 생성 일시 (ISO 8601) */
  createdAt: string;
  /** 수정 일시 (ISO 8601) */
  updatedAt: string;
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

/** 태그 */
export interface Tag {
  /** 고유 식별자 (UUID v4) */
  id: string;
  /** 태그 표시 이름 */
  name: string;
  /** 태그 색상 (hex) */
  color: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

/** 테마 설정 */
export type Theme = 'light' | 'dark' | 'system';

/** 자동 잠금 시간 (분). 0=팝업 닫을 때 즉시, 'never'=수동 잠금만 */
export type AutoLockMinutes = 0 | 1 | 5 | 10 | 15 | 30 | 'never';

/** 앱 설정 */
export interface Settings {
  /** hover 시에만 OTP 코드 표시 */
  hideCodesUntilHover: boolean;
  /** 테마 설정 */
  theme: Theme;
  /** 자동 잠금 시간 (분) */
  autoLockMinutes: AutoLockMinutes;
  /** 마스터 비밀번호 검증용 암호문 (Base64) */
  passwordHash: string;
  /** PBKDF2 salt (Base64) */
  salt: string;
}

// ─── Storage Schema ──────────────────────────────────────────────────────────

/** chrome.storage.sync에 저장되는 전체 데이터 구조 */
export interface StorageSchema {
  /** 설정 */
  settings: Settings;
  /** OTP 항목 목록 */
  entries: OTPEntry[];
  /** 태그 목록 */
  tags: Tag[];
  /** OTP 표시 순서 (entry ID 배열) */
  order: string[];
}

// ─── Messages (Background ↔ Popup) ──────────────────────────────────────────

/** Popup → Background 요청 */
export type MessageRequest =
  | { type: 'unlock'; password: string }
  | { type: 'lock' }
  | { type: 'getStatus' }
  | { type: 'getKey' }
  | { type: 'resetTimer' }
  | { type: 'changePassword'; currentPassword: string; newPassword: string };

/** Background → Popup 응답 */
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

/** 내보내기 파일 구조 */
export interface BackupFile {
  /** 파일 포맷 버전 */
  version: 1;
  /** 생성 일시 (ISO 8601) */
  exportedAt: string;
  /** PBKDF2 salt (Base64, 백업 전용) */
  salt: string;
  /** 암호화된 데이터 (Base64) */
  encryptedData: string;
}

// ─── OTP Auth URI (파싱 결과) ────────────────────────────────────────────────

/** otpauth:// URI 파싱 결과 */
export interface ParsedOTPAuthURI {
  /** OTP 타입 (현재 totp만 지원) */
  type: 'totp';
  /** 서비스 제공자 */
  issuer: string;
  /** 계정 식별자 */
  label: string;
  /** secret (평문, Base32 인코딩) */
  secret: string;
  /** 알고리즘 */
  algorithm: Algorithm;
  /** 자릿수 */
  digits: Digits;
  /** 갱신 주기 */
  period: number;
}

// ─── Page Navigation ─────────────────────────────────────────────────────────

/** 팝업 내 페이지 */
export type Page = 'unlock' | 'main' | 'add' | 'edit' | 'settings';
