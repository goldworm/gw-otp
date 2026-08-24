/**
 * OTP 생성 모듈
 *
 * - TOTP 코드 생성 (otplib 사용)
 * - 남은 시간 계산
 * - otpauth:// URI 파싱
 * - otpauth:// URI 생성
 *
 * 이 모듈은 순수 TypeScript이며 UI 관련 의존성이 없다.
 */

import { generate, verify, generateSecret, generateURI, createGuardrails } from 'otplib'
import type { Algorithm, Digits, ParsedOTPAuthURI } from '@/types'

// ─── TOTP Generation ─────────────────────────────────────────────────────────

/** otplib에서 사용하는 알고리즘 이름 매핑 */
const ALGORITHM_MAP: Record<Algorithm, 'sha1' | 'sha256' | 'sha512'> = {
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA512: 'sha512',
}

/**
 * TOTP 코드를 생성한다.
 *
 * @param secret - Base32 인코딩된 secret
 * @param algorithm - 해시 알고리즘 (기본: SHA1)
 * @param digits - OTP 자릿수 (기본: 6)
 * @param period - 갱신 주기 초 (기본: 30)
 * @returns 6자리 또는 8자리 OTP 문자열
 */
export async function generateTOTP(
  secret: string,
  algorithm: Algorithm = 'SHA1',
  digits: Digits = 6,
  period: number = 30
): Promise<string> {
  const normalized = normalizeSecret(secret)
  const token = await generate({
    secret: normalized,
    algorithm: ALGORITHM_MAP[algorithm],
    digits,
    period,
    guardrails: createGuardrails({ MIN_SECRET_BYTES: 10 }),
  })
  return token
}

/**
 * TOTP 코드를 검증한다.
 *
 * @param token - 검증할 OTP 코드
 * @param secret - Base32 인코딩된 secret
 * @param algorithm - 해시 알고리즘
 * @param digits - OTP 자릿수
 * @param period - 갱신 주기 초
 * @returns 유효하면 true
 */
export async function verifyTOTP(
  token: string,
  secret: string,
  algorithm: Algorithm = 'SHA1',
  digits: Digits = 6,
  period: number = 30
): Promise<boolean> {
  const normalized = normalizeSecret(secret)
  const result = await verify({
    token,
    secret: normalized,
    algorithm: ALGORITHM_MAP[algorithm],
    digits,
    period,
  })
  return result.valid
}

// ─── Time Utilities ──────────────────────────────────────────────────────────

/**
 * 현재 TOTP 주기에서 남은 시간(초)을 계산한다.
 *
 * @param period - 갱신 주기 (초, 기본: 30)
 * @returns 남은 초 수 (1 ~ period)
 */
export function getRemainingSeconds(period: number = 30): number {
  const now = Math.floor(Date.now() / 1000)
  return period - (now % period)
}

/**
 * 남은 시간을 비율(0~1)로 반환한다.
 * 1은 주기 시작, 0에 가까울수록 만료 임박.
 *
 * @param period - 갱신 주기 (초, 기본: 30)
 * @returns 0~1 사이의 비율
 */
export function getRemainingRatio(period: number = 30): number {
  return getRemainingSeconds(period) / period
}

// ─── URI Parsing ─────────────────────────────────────────────────────────────

/**
 * otpauth:// URI를 파싱하여 OTP 설정 정보를 추출한다.
 *
 * URI 형식:
 * otpauth://totp/Issuer:label?secret=BASE32&issuer=Issuer&algorithm=SHA1&digits=6&period=30
 *
 * @param uri - otpauth:// URI 문자열
 * @returns 파싱 결과
 * @throws URI 형식이 잘못된 경우
 */
export function parseOTPAuthURI(uri: string): ParsedOTPAuthURI {
  const trimmed = uri.trim()

  if (!trimmed.startsWith('otpauth://')) {
    throw new Error('Invalid OTP Auth URI: must start with "otpauth://"')
  }

  const url = new URL(trimmed)
  const type = url.hostname as 'totp' | 'hotp'

  if (type !== 'totp') {
    throw new Error(`Unsupported OTP type: ${type}. Only "totp" is supported.`)
  }

  // pathname: /Issuer:label 또는 /label
  const path = decodeURIComponent(url.pathname.slice(1)) // remove leading /
  let issuer = ''
  let label = ''

  if (path.includes(':')) {
    const colonIndex = path.indexOf(':')
    issuer = path.slice(0, colonIndex).trim()
    label = path.slice(colonIndex + 1).trim()
  } else {
    label = path.trim()
  }

  // Query parameters
  const params = url.searchParams
  const secret = params.get('secret')
  if (!secret) {
    throw new Error('Invalid OTP Auth URI: missing "secret" parameter')
  }

  // issuer 파라미터가 있으면 path의 issuer보다 우선
  const issuerParam = params.get('issuer')
  if (issuerParam) {
    issuer = issuerParam
  }

  const algorithmParam = (params.get('algorithm') ?? 'SHA1').toUpperCase()
  const algorithm = validateAlgorithm(algorithmParam)

  const digitsParam = parseInt(params.get('digits') ?? '6', 10)
  const digits = validateDigits(digitsParam)

  const period = parseInt(params.get('period') ?? '30', 10)
  if (isNaN(period) || period <= 0) {
    throw new Error(`Invalid period: ${params.get('period')}`)
  }

  return {
    type: 'totp',
    issuer,
    label,
    secret: secret.toUpperCase(),
    algorithm,
    digits,
    period,
  }
}

function validateAlgorithm(value: string): Algorithm {
  if (value === 'SHA1' || value === 'SHA256' || value === 'SHA512') {
    return value
  }
  throw new Error(`Unsupported algorithm: ${value}`)
}

function validateDigits(value: number): Digits {
  if (value === 6 || value === 8) {
    return value
  }
  throw new Error(`Unsupported digits: ${value}. Must be 6 or 8.`)
}

// ─── URI Generation ──────────────────────────────────────────────────────────

/**
 * OTP 설정에서 otpauth:// URI를 생성한다.
 *
 * @param options - URI 생성 옵션
 * @returns otpauth:// URI 문자열
 */
export function buildOTPAuthURI(options: {
  issuer: string
  label: string
  secret: string
  algorithm?: Algorithm
  digits?: Digits
  period?: number
}): string {
  return generateURI({
    strategy: 'totp',
    issuer: options.issuer,
    label: options.label,
    secret: options.secret,
    algorithm: ALGORITHM_MAP[options.algorithm ?? 'SHA1'],
    digits: options.digits ?? 6,
    period: options.period ?? 30,
  })
}

// ─── Secret Normalization ─────────────────────────────────────────────────────

/**
 * 사용자 입력의 secret을 정규화한다.
 * 공백, 하이픈, 기타 구분자를 제거하고 대문자로 변환한다.
 *
 * @param secret - 원본 secret 문자열
 * @returns 정규화된 Base32 secret (대문자, 구분자 제거)
 */
export function normalizeSecret(secret: string): string {
  return secret.replace(/[\s\-_.]+/g, '').toUpperCase()
}

// ─── Secret Generation ───────────────────────────────────────────────────────

/**
 * 새로운 랜덤 secret을 생성한다 (Base32 인코딩).
 *
 * @param length - 바이트 길이 (기본: 20, 즉 160-bit)
 * @returns Base32 인코딩된 secret
 */
export function createSecret(length: number = 20): string {
  return generateSecret({ length })
}
