/**
 * OTP generation module
 *
 * - Generate TOTP codes (using otplib)
 * - Compute remaining time
 * - Parse otpauth:// URIs
 * - Build otpauth:// URIs
 *
 * This module is pure TypeScript and has no UI dependencies.
 */

import {
  generate,
  verify,
  generateSecret,
  generateURI,
  createGuardrails,
} from 'otplib';
import type { Algorithm, Digits, OTPType, ParsedOTPAuthURI } from '@/types';

// ─── TOTP Generation ─────────────────────────────────────────────────────────

/** Mapping to the algorithm names used by otplib */
const ALGORITHM_MAP: Record<Algorithm, 'sha1' | 'sha256' | 'sha512'> = {
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA512: 'sha512',
};

/**
 * Generate a TOTP code.
 *
 * @param secret - the Base32-encoded secret
 * @param algorithm - the hash algorithm (default: SHA1)
 * @param digits - number of OTP digits (default: 6)
 * @param period - refresh period in seconds (default: 30)
 * @returns a 6- or 8-digit OTP string
 */
export async function generateTOTP(
  secret: string,
  algorithm: Algorithm = 'SHA1',
  digits: Digits = 6,
  period: number = 30,
): Promise<string> {
  const normalized = normalizeSecret(secret);
  const token = await generate({
    secret: normalized,
    algorithm: ALGORITHM_MAP[algorithm],
    digits,
    period,
    guardrails: createGuardrails({ MIN_SECRET_BYTES: 10 }),
  });
  return token;
}

/**
 * Generate an HOTP code (counter-based).
 *
 * @param secret - the Base32-encoded secret
 * @param counter - the HOTP counter value
 * @param algorithm - the hash algorithm (default: SHA1)
 * @param digits - number of OTP digits (default: 6)
 * @returns a 6- or 8-digit OTP string
 */
export async function generateHOTP(
  secret: string,
  counter: number,
  algorithm: Algorithm = 'SHA1',
  digits: Digits = 6,
): Promise<string> {
  const normalized = normalizeSecret(secret);
  const token = await generate({
    strategy: 'hotp',
    secret: normalized,
    counter,
    algorithm: ALGORITHM_MAP[algorithm],
    digits,
    guardrails: createGuardrails({ MIN_SECRET_BYTES: 10 }),
  });
  return token;
}

/**
 * Verify a TOTP code.
 *
 * @param token - the OTP code to verify
 * @param secret - the Base32-encoded secret
 * @param algorithm - the hash algorithm
 * @param digits - number of OTP digits
 * @param period - refresh period in seconds
 * @returns true if valid
 */
export async function verifyTOTP(
  token: string,
  secret: string,
  algorithm: Algorithm = 'SHA1',
  digits: Digits = 6,
  period: number = 30,
): Promise<boolean> {
  const normalized = normalizeSecret(secret);
  const result = await verify({
    token,
    secret: normalized,
    algorithm: ALGORITHM_MAP[algorithm],
    digits,
    period,
  });
  return result.valid;
}

// ─── Time Utilities ──────────────────────────────────────────────────────────

/**
 * Compute the remaining time (seconds) in the current TOTP period.
 *
 * @param period - the refresh period (seconds, default: 30)
 * @returns the number of seconds remaining (1 ~ period)
 */
export function getRemainingSeconds(period: number = 30): number {
  const now = Math.floor(Date.now() / 1000);
  return period - (now % period);
}

/**
 * Return the remaining time as a ratio (0~1).
 * 1 means the start of the period; closer to 0 means expiration is near.
 *
 * @param period - the refresh period (seconds, default: 30)
 * @returns a ratio between 0 and 1
 */
export function getRemainingRatio(period: number = 30): number {
  return getRemainingSeconds(period) / period;
}

// ─── URI Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse an otpauth:// URI and extract the OTP configuration.
 *
 * URI format:
 * otpauth://totp/Issuer:label?secret=BASE32&issuer=Issuer&algorithm=SHA1&digits=6&period=30
 *
 * @param uri - the otpauth:// URI string
 * @returns the parsed result
 * @throws if the URI format is invalid
 */
export function parseOTPAuthURI(uri: string): ParsedOTPAuthURI {
  const trimmed = uri.trim();

  if (!trimmed.startsWith('otpauth://')) {
    throw new Error('Invalid OTP Auth URI: must start with "otpauth://"');
  }

  const url = new URL(trimmed);
  const type = url.hostname;

  if (type !== 'totp' && type !== 'hotp') {
    throw new Error(
      `Unsupported OTP type: ${type}. Only "totp" and "hotp" are supported.`,
    );
  }

  // pathname: /Issuer:label or /label
  const path = decodeURIComponent(url.pathname.slice(1)); // remove leading /
  let issuer = '';
  let label = '';

  if (path.includes(':')) {
    const colonIndex = path.indexOf(':');
    issuer = path.slice(0, colonIndex).trim();
    label = path.slice(colonIndex + 1).trim();
  } else {
    label = path.trim();
  }

  // Query parameters
  const params = url.searchParams;
  const secret = params.get('secret');
  if (!secret) {
    throw new Error('Invalid OTP Auth URI: missing "secret" parameter');
  }

  // The issuer parameter, if present, takes precedence over the path issuer
  const issuerParam = params.get('issuer');
  if (issuerParam) {
    issuer = issuerParam;
  }

  const algorithmParam = (params.get('algorithm') ?? 'SHA1').toUpperCase();
  const algorithm = validateAlgorithm(algorithmParam);

  const digitsParam = parseInt(params.get('digits') ?? '6', 10);
  const digits = validateDigits(digitsParam);

  const period = parseInt(params.get('period') ?? '30', 10);
  if (isNaN(period) || period <= 0) {
    throw new Error(`Invalid period: ${params.get('period')}`);
  }

  if (type === 'hotp') {
    // HOTP requires a counter parameter (defaults to 0 if absent)
    const counter = parseInt(params.get('counter') ?? '0', 10);
    if (isNaN(counter) || counter < 0) {
      throw new Error(`Invalid counter: ${params.get('counter')}`);
    }
    return {
      type: 'hotp',
      issuer,
      label,
      secret: secret.toUpperCase(),
      algorithm,
      digits,
      period,
      counter,
    };
  }

  return {
    type: 'totp',
    issuer,
    label,
    secret: secret.toUpperCase(),
    algorithm,
    digits,
    period,
  };
}

function validateAlgorithm(value: string): Algorithm {
  if (value === 'SHA1' || value === 'SHA256' || value === 'SHA512') {
    return value;
  }
  throw new Error(`Unsupported algorithm: ${value}`);
}

function validateDigits(value: number): Digits {
  if (value === 6 || value === 8) {
    return value;
  }
  throw new Error(`Unsupported digits: ${value}. Must be 6 or 8.`);
}

// ─── URI Generation ──────────────────────────────────────────────────────────

/**
 * Build an otpauth:// URI from an OTP configuration.
 *
 * @param options - URI build options
 * @returns the otpauth:// URI string
 */
export function buildOTPAuthURI(options: {
  type?: OTPType;
  issuer: string;
  label: string;
  secret: string;
  algorithm?: Algorithm;
  digits?: Digits;
  period?: number;
  counter?: number;
}): string {
  if (options.type === 'hotp') {
    return generateURI({
      strategy: 'hotp',
      issuer: options.issuer,
      label: options.label,
      secret: options.secret,
      algorithm: ALGORITHM_MAP[options.algorithm ?? 'SHA1'],
      digits: options.digits ?? 6,
      counter: options.counter ?? 0,
    });
  }

  return generateURI({
    strategy: 'totp',
    issuer: options.issuer,
    label: options.label,
    secret: options.secret,
    algorithm: ALGORITHM_MAP[options.algorithm ?? 'SHA1'],
    digits: options.digits ?? 6,
    period: options.period ?? 30,
  });
}

// ─── Secret Normalization ─────────────────────────────────────────────────────

/**
 * Normalize a user-entered secret.
 * Removes whitespace, hyphens, and other separators and uppercases the result.
 *
 * @param secret - the raw secret string
 * @returns the normalized Base32 secret (uppercased, separators removed)
 */
export function normalizeSecret(secret: string): string {
  return secret.replace(/[\s\-_.]+/g, '').toUpperCase();
}

// ─── Secret Generation ───────────────────────────────────────────────────────

/**
 * Generate a new random secret (Base32-encoded).
 *
 * @param length - byte length (default: 20, i.e. 160-bit)
 * @returns the Base32-encoded secret
 */
export function createSecret(length: number = 20): string {
  return generateSecret({ length });
}
