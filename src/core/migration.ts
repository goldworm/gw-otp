/**
 * Google Authenticator Migration URI 파싱 모듈
 *
 * otpauth-migration://offline?data=<base64> 형식의 URI를 파싱하여
 * 여러 OTP 항목을 한 번에 추출한다.
 *
 * 내부적으로 Protocol Buffers 수동 디코딩을 사용한다 (경량 구현).
 *
 * 이 모듈은 순수 TypeScript이며 UI 관련 의존성이 없다.
 */

import type { Algorithm, Digits, ParsedOTPAuthURI } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OtpParameters {
  secret: Uint8Array;
  name: string;
  issuer: string;
  algorithm: number; // 0=unspecified, 1=SHA1, 2=SHA256, 3=SHA512
  digits: number; // 0=unspecified, 1=SIX, 2=EIGHT
  type: number; // 0=unspecified, 1=HOTP, 2=TOTP
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * otpauth-migration:// URI를 파싱하여 OTP 항목 목록을 반환한다.
 *
 * @param uri - otpauth-migration://offline?data=... 형식의 URI
 * @returns 파싱된 OTP 항목 배열
 * @throws URI 형식이 잘못된 경우
 */
export function parseMigrationURI(uri: string): ParsedOTPAuthURI[] {
  const trimmed = uri.trim();

  if (!trimmed.startsWith('otpauth-migration://')) {
    throw new Error(
      'Invalid migration URI: must start with "otpauth-migration://"',
    );
  }

  // data 파라미터 추출
  const url = new URL(trimmed);
  const dataParam = url.searchParams.get('data');
  if (!dataParam) {
    throw new Error('Invalid migration URI: missing "data" parameter');
  }

  // Base64 디코딩
  const binaryStr = atob(dataParam);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Protobuf 디코딩
  const otpParams = decodeMigrationPayload(bytes);

  // ParsedOTPAuthURI로 변환
  return otpParams
    .filter((p) => p.type === 2 || p.type === 0) // TOTP만 (unspecified도 TOTP로 취급)
    .map((p) => convertToOTPAuthURI(p));
}

/**
 * 주어진 URI가 otpauth-migration:// 형식인지 확인한다.
 */
export function isMigrationURI(uri: string): boolean {
  return uri.trim().startsWith('otpauth-migration://');
}

// ─── Protobuf Decoding ───────────────────────────────────────────────────────

/**
 * MigrationPayload protobuf 메시지에서 otp_parameters (field 1) 를 추출한다.
 */
function decodeMigrationPayload(data: Uint8Array): OtpParameters[] {
  const results: OtpParameters[] = [];
  let offset = 0;

  while (offset < data.length) {
    const { fieldNumber, wireType, newOffset } = readTag(data, offset);
    offset = newOffset;

    if (fieldNumber === 1 && wireType === 2) {
      // length-delimited: OtpParameters 메시지
      const { value, newOffset: nextOffset } = readBytes(data, offset);
      offset = nextOffset;
      results.push(decodeOtpParameters(value));
    } else {
      // 다른 필드는 건너뛰기
      offset = skipField(data, offset, wireType);
    }
  }

  return results;
}

/**
 * OtpParameters protobuf 메시지를 디코딩한다.
 */
function decodeOtpParameters(data: Uint8Array): OtpParameters {
  const result: OtpParameters = {
    secret: new Uint8Array(0),
    name: '',
    issuer: '',
    algorithm: 0,
    digits: 0,
    type: 0,
  };

  let offset = 0;
  while (offset < data.length) {
    const { fieldNumber, wireType, newOffset } = readTag(data, offset);
    offset = newOffset;

    switch (fieldNumber) {
      case 1: // secret (bytes)
        if (wireType === 2) {
          const { value, newOffset: nextOffset } = readBytes(data, offset);
          offset = nextOffset;
          result.secret = value;
        }
        break;
      case 2: // name (string)
        if (wireType === 2) {
          const { value, newOffset: nextOffset } = readBytes(data, offset);
          offset = nextOffset;
          result.name = new TextDecoder().decode(value);
        }
        break;
      case 3: // issuer (string)
        if (wireType === 2) {
          const { value, newOffset: nextOffset } = readBytes(data, offset);
          offset = nextOffset;
          result.issuer = new TextDecoder().decode(value);
        }
        break;
      case 4: // algorithm (varint)
        if (wireType === 0) {
          const { value, newOffset: nextOffset } = readVarint(data, offset);
          offset = nextOffset;
          result.algorithm = value;
        }
        break;
      case 5: // digits (varint)
        if (wireType === 0) {
          const { value, newOffset: nextOffset } = readVarint(data, offset);
          offset = nextOffset;
          result.digits = value;
        }
        break;
      case 6: // type (varint)
        if (wireType === 0) {
          const { value, newOffset: nextOffset } = readVarint(data, offset);
          offset = nextOffset;
          result.type = value;
        }
        break;
      default:
        offset = skipField(data, offset, wireType);
    }
  }

  return result;
}

// ─── Protobuf Primitives ─────────────────────────────────────────────────────

function readTag(
  data: Uint8Array,
  offset: number,
): {
  fieldNumber: number;
  wireType: number;
  newOffset: number;
} {
  const { value, newOffset } = readVarint(data, offset);
  return {
    fieldNumber: value >>> 3,
    wireType: value & 0x07,
    newOffset,
  };
}

function readVarint(
  data: Uint8Array,
  offset: number,
): {
  value: number;
  newOffset: number;
} {
  let value = 0;
  let shift = 0;
  let byte: number;

  do {
    if (offset >= data.length) {
      throw new Error('Protobuf decoding error: unexpected end of data');
    }
    byte = data[offset++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);

  return { value: value >>> 0, newOffset: offset };
}

function readBytes(
  data: Uint8Array,
  offset: number,
): {
  value: Uint8Array;
  newOffset: number;
} {
  const { value: length, newOffset } = readVarint(data, offset);
  const value = data.slice(newOffset, newOffset + length);
  return { value, newOffset: newOffset + length };
}

function skipField(data: Uint8Array, offset: number, wireType: number): number {
  switch (wireType) {
    case 0: {
      // varint
      const { newOffset } = readVarint(data, offset);
      return newOffset;
    }
    case 1: // 64-bit
      return offset + 8;
    case 2: {
      // length-delimited
      const { value: length, newOffset } = readVarint(data, offset);
      return newOffset + length;
    }
    case 5: // 32-bit
      return offset + 4;
    default:
      throw new Error(`Protobuf decoding error: unknown wire type ${wireType}`);
  }
}

// ─── Conversion ──────────────────────────────────────────────────────────────

/**
 * OtpParameters를 ParsedOTPAuthURI로 변환한다.
 */
function convertToOTPAuthURI(params: OtpParameters): ParsedOTPAuthURI {
  // secret을 Base32로 인코딩
  const secret = base32Encode(params.secret);

  // name 파싱: "Issuer:Label" 또는 "Label"
  let issuer = params.issuer;
  let label = params.name;

  if (params.name.includes(':')) {
    const colonIndex = params.name.indexOf(':');
    const nameIssuer = params.name.slice(0, colonIndex).trim();
    label = params.name.slice(colonIndex + 1).trim();
    if (!issuer) {
      issuer = nameIssuer;
    }
  }

  // algorithm 매핑
  const algorithm = mapAlgorithm(params.algorithm);

  // digits 매핑
  const digits = mapDigits(params.digits);

  return {
    type: 'totp',
    issuer,
    label,
    secret,
    algorithm,
    digits,
    period: 30, // Google Authenticator는 항상 30초
  };
}

function mapAlgorithm(value: number): Algorithm {
  switch (value) {
    case 2:
      return 'SHA256';
    case 3:
      return 'SHA512';
    default:
      return 'SHA1'; // 0 (unspecified) 또는 1 (SHA1)
  }
}

function mapDigits(value: number): Digits {
  switch (value) {
    case 2:
      return 8;
    default:
      return 6; // 0 (unspecified) 또는 1 (SIX)
  }
}

// ─── Base32 Encoding ─────────────────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Uint8Array를 Base32 문자열로 인코딩한다 (RFC 4648).
 */
function base32Encode(data: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i];
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}
