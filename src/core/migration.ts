/**
 * Google Authenticator migration URI parsing module
 *
 * Parses URIs of the form otpauth-migration://offline?data=<base64> and
 * extracts multiple OTP entries at once.
 *
 * Internally uses a manual Protocol Buffers decoder (a lightweight implementation).
 *
 * This module is pure TypeScript and has no UI dependencies.
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
  counter: number; // HOTP counter (field 7)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse an otpauth-migration:// URI and return the list of OTP entries.
 *
 * @param uri - a URI of the form otpauth-migration://offline?data=...
 * @returns the parsed array of OTP entries
 * @throws if the URI format is invalid
 */
export function parseMigrationURI(uri: string): ParsedOTPAuthURI[] {
  const trimmed = uri.trim();

  if (!trimmed.startsWith('otpauth-migration://')) {
    throw new Error(
      'Invalid migration URI: must start with "otpauth-migration://"',
    );
  }

  // Extract the data parameter
  const url = new URL(trimmed);
  const dataParam = url.searchParams.get('data');
  if (!dataParam) {
    throw new Error('Invalid migration URI: missing "data" parameter');
  }

  // Base64 decode
  const binaryStr = atob(dataParam);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Protobuf decode
  const otpParams = decodeMigrationPayload(bytes);

  // Convert to ParsedOTPAuthURI
  // Both TOTP(2) and HOTP(1) are supported. unspecified(0) is treated as TOTP.
  return otpParams.map((p) => convertToOTPAuthURI(p));
}

/**
 * Check whether the given URI is in otpauth-migration:// format.
 */
export function isMigrationURI(uri: string): boolean {
  return uri.trim().startsWith('otpauth-migration://');
}

// ─── Protobuf Decoding ───────────────────────────────────────────────────────

/**
 * Extract otp_parameters (field 1) from a MigrationPayload protobuf message.
 */
function decodeMigrationPayload(data: Uint8Array): OtpParameters[] {
  const results: OtpParameters[] = [];
  let offset = 0;

  while (offset < data.length) {
    const { fieldNumber, wireType, newOffset } = readTag(data, offset);
    offset = newOffset;

    if (fieldNumber === 1 && wireType === 2) {
      // length-delimited: OtpParameters message
      const { value, newOffset: nextOffset } = readBytes(data, offset);
      offset = nextOffset;
      results.push(decodeOtpParameters(value));
    } else {
      // Skip other fields
      offset = skipField(data, offset, wireType);
    }
  }

  return results;
}

/**
 * Decode an OtpParameters protobuf message.
 */
function decodeOtpParameters(data: Uint8Array): OtpParameters {
  const result: OtpParameters = {
    secret: new Uint8Array(0),
    name: '',
    issuer: '',
    algorithm: 0,
    digits: 0,
    type: 0,
    counter: 0,
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
      case 7: // counter (varint, HOTP only)
        if (wireType === 0) {
          const { value, newOffset: nextOffset } = readVarint(data, offset);
          offset = nextOffset;
          result.counter = value;
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
 * Convert OtpParameters to a ParsedOTPAuthURI.
 */
function convertToOTPAuthURI(params: OtpParameters): ParsedOTPAuthURI {
  // Encode the secret to Base32
  const secret = base32Encode(params.secret);

  // Parse name: "Issuer:Label" or "Label"
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

  // Map the algorithm
  const algorithm = mapAlgorithm(params.algorithm);

  // Map the digits
  const digits = mapDigits(params.digits);

  // Map the type: 1=HOTP, otherwise (2=TOTP, 0=unspecified)=TOTP
  if (params.type === 1) {
    return {
      type: 'hotp',
      issuer,
      label,
      secret,
      algorithm,
      digits,
      period: 30,
      counter: params.counter,
    };
  }

  return {
    type: 'totp',
    issuer,
    label,
    secret,
    algorithm,
    digits,
    period: 30, // Google Authenticator always uses 30 seconds
  };
}

function mapAlgorithm(value: number): Algorithm {
  switch (value) {
    case 2:
      return 'SHA256';
    case 3:
      return 'SHA512';
    default:
      return 'SHA1'; // 0 (unspecified) or 1 (SHA1)
  }
}

function mapDigits(value: number): Digits {
  switch (value) {
    case 2:
      return 8;
    default:
      return 6; // 0 (unspecified) or 1 (SIX)
  }
}

// ─── Base32 Encoding ─────────────────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a Uint8Array to a Base32 string (RFC 4648).
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
