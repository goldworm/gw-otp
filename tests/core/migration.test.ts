import { describe, it, expect } from 'vitest';
import { parseMigrationURI, isMigrationURI } from '@/core/migration';

// ─── Test Data ───────────────────────────────────────────────────────────────

/**
 * Generate a test otpauth-migration URI from known protobuf data.
 *
 * Protobuf structure (MigrationPayload):
 *   field 1 (OtpParameters, repeated):
 *     field 1: secret (bytes)
 *     field 2: name (string)
 *     field 3: issuer (string)
 *     field 4: algorithm (varint) - 1=SHA1
 *     field 5: digits (varint) - 1=SIX
 *     field 6: type (varint) - 2=TOTP
 *   field 2: version (varint)
 *   field 3: batch_size (varint)
 *   field 4: batch_index (varint)
 */

function buildProtobuf(): Uint8Array {
  // Helper to build a protobuf message manually
  function varint(value: number): number[] {
    const bytes: number[] = [];
    while (value > 0x7f) {
      bytes.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    bytes.push(value & 0x7f);
    return bytes;
  }

  function tag(fieldNumber: number, wireType: number): number[] {
    return varint((fieldNumber << 3) | wireType);
  }

  function lengthDelimited(fieldNumber: number, data: Uint8Array): number[] {
    return [...tag(fieldNumber, 2), ...varint(data.length), ...data];
  }

  function varintField(fieldNumber: number, value: number): number[] {
    return [...tag(fieldNumber, 0), ...varint(value)];
  }

  function stringField(fieldNumber: number, str: string): number[] {
    const encoded = new TextEncoder().encode(str);
    return lengthDelimited(fieldNumber, encoded);
  }

  function bytesField(fieldNumber: number, bytes: Uint8Array): number[] {
    return lengthDelimited(fieldNumber, bytes);
  }

  // Secret: "Hello!" in bytes (known Base32 = JBSWY3DP)
  const secret1 = new TextEncoder().encode('Hello!');
  // Secret2: "World" (known Base32 = K5UWK3Q)
  const secret2 = new TextEncoder().encode('World');

  // OtpParameters 1: TOTP, SHA1, 6 digits
  const otp1 = new Uint8Array([
    ...bytesField(1, secret1),
    ...stringField(2, 'Google:user@gmail.com'),
    ...stringField(3, 'Google'),
    ...varintField(4, 1), // SHA1
    ...varintField(5, 1), // SIX
    ...varintField(6, 2), // TOTP
  ]);

  // OtpParameters 2: TOTP, SHA256, 8 digits
  const otp2 = new Uint8Array([
    ...bytesField(1, secret2),
    ...stringField(2, 'GitHub:dev@github.com'),
    ...stringField(3, 'GitHub'),
    ...varintField(4, 2), // SHA256
    ...varintField(5, 2), // EIGHT
    ...varintField(6, 2), // TOTP
  ]);

  // MigrationPayload
  const payload = new Uint8Array([
    ...lengthDelimited(1, otp1),
    ...lengthDelimited(1, otp2),
    ...varintField(2, 1), // version
    ...varintField(3, 1), // batch_size
    ...varintField(4, 0), // batch_index
  ]);

  return payload;
}

function buildMigrationURI(): string {
  const payload = buildProtobuf();
  let binary = '';
  for (let i = 0; i < payload.length; i++) {
    binary += String.fromCharCode(payload[i]);
  }
  const base64 = btoa(binary);
  return `otpauth-migration://offline?data=${encodeURIComponent(base64)}`;
}

// Build a URI with an HOTP entry (should be filtered out)
function buildMigrationURIWithHOTP(): string {
  function varint(value: number): number[] {
    const bytes: number[] = [];
    while (value > 0x7f) {
      bytes.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    bytes.push(value & 0x7f);
    return bytes;
  }
  function tag(fieldNumber: number, wireType: number): number[] {
    return varint((fieldNumber << 3) | wireType);
  }
  function lengthDelimited(fieldNumber: number, data: Uint8Array): number[] {
    return [...tag(fieldNumber, 2), ...varint(data.length), ...data];
  }
  function varintField(fieldNumber: number, value: number): number[] {
    return [...tag(fieldNumber, 0), ...varint(value)];
  }
  function stringField(fieldNumber: number, str: string): number[] {
    const encoded = new TextEncoder().encode(str);
    return lengthDelimited(fieldNumber, encoded);
  }
  function bytesField(fieldNumber: number, bytes: Uint8Array): number[] {
    return lengthDelimited(fieldNumber, bytes);
  }

  const secret = new TextEncoder().encode('Test');

  // HOTP entry (type=1)
  const hotpEntry = new Uint8Array([
    ...bytesField(1, secret),
    ...stringField(2, 'HOTP:counter@test.com'),
    ...stringField(3, 'HOTP'),
    ...varintField(4, 1),
    ...varintField(5, 1),
    ...varintField(6, 1), // HOTP
  ]);

  // TOTP entry
  const totpEntry = new Uint8Array([
    ...bytesField(1, secret),
    ...stringField(2, 'TOTP:time@test.com'),
    ...stringField(3, 'TOTP'),
    ...varintField(4, 1),
    ...varintField(5, 1),
    ...varintField(6, 2), // TOTP
  ]);

  const payload = new Uint8Array([
    ...lengthDelimited(1, hotpEntry),
    ...lengthDelimited(1, totpEntry),
    ...varintField(2, 1),
  ]);

  let binary = '';
  for (let i = 0; i < payload.length; i++) {
    binary += String.fromCharCode(payload[i]);
  }
  return `otpauth-migration://offline?data=${encodeURIComponent(btoa(binary))}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('migration module', () => {
  describe('isMigrationURI', () => {
    it('should return true for migration URI', () => {
      expect(isMigrationURI('otpauth-migration://offline?data=abc')).toBe(true);
    });

    it('should return true with whitespace', () => {
      expect(isMigrationURI('  otpauth-migration://offline?data=abc  ')).toBe(
        true,
      );
    });

    it('should return false for otpauth URI', () => {
      expect(isMigrationURI('otpauth://totp/Test?secret=ABC')).toBe(false);
    });

    it('should return false for random string', () => {
      expect(isMigrationURI('hello world')).toBe(false);
    });
  });

  describe('parseMigrationURI', () => {
    it('should parse a valid migration URI with 2 TOTP entries', () => {
      const uri = buildMigrationURI();
      const results = parseMigrationURI(uri);

      expect(results).toHaveLength(2);

      // Entry 1
      expect(results[0].type).toBe('totp');
      expect(results[0].issuer).toBe('Google');
      expect(results[0].label).toBe('user@gmail.com');
      expect(results[0].algorithm).toBe('SHA1');
      expect(results[0].digits).toBe(6);
      expect(results[0].period).toBe(30);
      expect(results[0].secret).toBeTruthy();
      expect(results[0].secret.length).toBeGreaterThan(0);

      // Entry 2
      expect(results[1].type).toBe('totp');
      expect(results[1].issuer).toBe('GitHub');
      expect(results[1].label).toBe('dev@github.com');
      expect(results[1].algorithm).toBe('SHA256');
      expect(results[1].digits).toBe(8);
      expect(results[1].period).toBe(30);
    });

    it('should filter out HOTP entries and keep TOTP', () => {
      const uri = buildMigrationURIWithHOTP();
      const results = parseMigrationURI(uri);

      expect(results).toHaveLength(1);
      expect(results[0].issuer).toBe('TOTP');
      expect(results[0].label).toBe('time@test.com');
    });

    it('should produce Base32 encoded secrets', () => {
      const uri = buildMigrationURI();
      const results = parseMigrationURI(uri);

      // Base32 characters: A-Z, 2-7
      for (const result of results) {
        expect(result.secret).toMatch(/^[A-Z2-7]+$/);
      }
    });

    it('should extract issuer from name field when issuer field is empty', () => {
      // Build a payload with issuer only in name "Issuer:Label"
      function varint(value: number): number[] {
        const bytes: number[] = [];
        while (value > 0x7f) {
          bytes.push((value & 0x7f) | 0x80);
          value >>>= 7;
        }
        bytes.push(value & 0x7f);
        return bytes;
      }
      function tag(fieldNumber: number, wireType: number): number[] {
        return varint((fieldNumber << 3) | wireType);
      }
      function lengthDelimited(
        fieldNumber: number,
        data: Uint8Array,
      ): number[] {
        return [...tag(fieldNumber, 2), ...varint(data.length), ...data];
      }
      function varintField(fieldNumber: number, value: number): number[] {
        return [...tag(fieldNumber, 0), ...varint(value)];
      }
      function stringField(fieldNumber: number, str: string): number[] {
        const encoded = new TextEncoder().encode(str);
        return lengthDelimited(fieldNumber, encoded);
      }
      function bytesField(fieldNumber: number, bytes: Uint8Array): number[] {
        return lengthDelimited(fieldNumber, bytes);
      }

      const secret = new TextEncoder().encode('Key');
      const otpEntry = new Uint8Array([
        ...bytesField(1, secret),
        ...stringField(2, 'MyService:account@test.com'),
        // No field 3 (issuer)
        ...varintField(4, 1),
        ...varintField(5, 1),
        ...varintField(6, 2),
      ]);

      const payload = new Uint8Array([
        ...lengthDelimited(1, otpEntry),
        ...varintField(2, 1),
      ]);

      let binary = '';
      for (let i = 0; i < payload.length; i++) {
        binary += String.fromCharCode(payload[i]);
      }
      const uri = `otpauth-migration://offline?data=${encodeURIComponent(btoa(binary))}`;

      const results = parseMigrationURI(uri);
      expect(results).toHaveLength(1);
      expect(results[0].issuer).toBe('MyService');
      expect(results[0].label).toBe('account@test.com');
    });

    it('should throw for non-migration URI', () => {
      expect(() => parseMigrationURI('otpauth://totp/X?secret=Y')).toThrow(
        'must start with "otpauth-migration://"',
      );
    });

    it('should throw for missing data parameter', () => {
      expect(() => parseMigrationURI('otpauth-migration://offline')).toThrow(
        'missing "data"',
      );
    });

    it('should throw for invalid base64', () => {
      expect(() =>
        parseMigrationURI('otpauth-migration://offline?data=!!!invalid!!!'),
      ).toThrow();
    });

    it('should handle default algorithm/digits (unspecified = SHA1/6)', () => {
      function varint(value: number): number[] {
        const bytes: number[] = [];
        while (value > 0x7f) {
          bytes.push((value & 0x7f) | 0x80);
          value >>>= 7;
        }
        bytes.push(value & 0x7f);
        return bytes;
      }
      function tag(fieldNumber: number, wireType: number): number[] {
        return varint((fieldNumber << 3) | wireType);
      }
      function lengthDelimited(
        fieldNumber: number,
        data: Uint8Array,
      ): number[] {
        return [...tag(fieldNumber, 2), ...varint(data.length), ...data];
      }
      function varintField(fieldNumber: number, value: number): number[] {
        return [...tag(fieldNumber, 0), ...varint(value)];
      }
      function stringField(fieldNumber: number, str: string): number[] {
        const encoded = new TextEncoder().encode(str);
        return lengthDelimited(fieldNumber, encoded);
      }
      function bytesField(fieldNumber: number, bytes: Uint8Array): number[] {
        return lengthDelimited(fieldNumber, bytes);
      }

      const secret = new TextEncoder().encode('Default');
      const otpEntry = new Uint8Array([
        ...bytesField(1, secret),
        ...stringField(2, 'Test:default@test.com'),
        // algorithm=0 (unspecified), digits=0 (unspecified), type=0 (unspecified → treated as TOTP)
      ]);

      const payload = new Uint8Array([...lengthDelimited(1, otpEntry)]);

      let binary = '';
      for (let i = 0; i < payload.length; i++) {
        binary += String.fromCharCode(payload[i]);
      }
      const uri = `otpauth-migration://offline?data=${encodeURIComponent(btoa(binary))}`;

      const results = parseMigrationURI(uri);
      expect(results).toHaveLength(1);
      expect(results[0].algorithm).toBe('SHA1');
      expect(results[0].digits).toBe(6);
    });
  });
});
