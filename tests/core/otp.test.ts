import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateTOTP,
  generateHOTP,
  verifyTOTP,
  getRemainingSeconds,
  getRemainingRatio,
  parseOTPAuthURI,
  buildOTPAuthURI,
  createSecret,
} from '@/core/otp';

describe('otp module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateTOTP', () => {
    it('should generate a 6-digit code by default', async () => {
      const secret = createSecret();
      const token = await generateTOTP(secret);
      expect(token).toMatch(/^\d{6}$/);
    });

    it('should generate an 8-digit code when specified', async () => {
      const secret = createSecret();
      const token = await generateTOTP(secret, 'SHA1', 8);
      expect(token).toMatch(/^\d{8}$/);
    });

    it('should generate consistent token for same time window', async () => {
      const secret = createSecret();
      const token1 = await generateTOTP(secret);
      const token2 = await generateTOTP(secret);
      expect(token1).toBe(token2);
    });

    it('should generate consistent token for same time window', async () => {
      const secret = createSecret();
      const token1 = await generateTOTP(secret);
      const token2 = await generateTOTP(secret);
      expect(token1).toBe(token2);
    });

    it('should generate valid tokens with 80bit length secret', async () => {
      const secret = 'C5D2GCMH32DC2MSA';
      const token = await generateTOTP(secret);
      expect(token).match(/\d{6}/);
    });
  });

  describe('generateHOTP', () => {
    it('should generate a 6-digit code', async () => {
      const secret = createSecret();
      const token = await generateHOTP(secret, 0);
      expect(token).toMatch(/^\d{6}$/);
    });

    it('should generate different codes for different counters', async () => {
      const secret = createSecret();
      const token0 = await generateHOTP(secret, 0);
      const token1 = await generateHOTP(secret, 1);
      expect(token0).not.toBe(token1);
    });

    it('should generate the same code for the same counter', async () => {
      const secret = createSecret();
      const a = await generateHOTP(secret, 5);
      const b = await generateHOTP(secret, 5);
      expect(a).toBe(b);
    });

    it('should match RFC 4226 test vector (counter 0)', async () => {
      // RFC 4226 Appendix D: secret "12345678901234567890" (ASCII)
      // Base32 of that ASCII = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ, HOTP(count=0) = 755224
      const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
      const token = await generateHOTP(secret, 0);
      expect(token).toBe('755224');
    });

    it('should match RFC 4226 test vector (counter 1)', async () => {
      const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
      const token = await generateHOTP(secret, 1);
      expect(token).toBe('287082');
    });

    it('should generate 8-digit codes', async () => {
      const secret = createSecret();
      const token = await generateHOTP(secret, 0, 'SHA1', 8);
      expect(token).toMatch(/^\d{8}$/);
    });
  });

  describe('verifyTOTP', () => {
    it('should verify a valid token', async () => {
      const secret = createSecret();
      const token = await generateTOTP(secret);
      const isValid = await verifyTOTP(token, secret);
      expect(isValid).toBe(true);
    });

    it('should reject an invalid token', async () => {
      const secret = createSecret();
      // 통계적으로 거의 항상 false이지만, 아주 드물게 맞을 수 있으므로
      // 대신 생성한 것과 다른 코드로 테스트
      const token = await generateTOTP(secret);
      const wrongToken = token === '123456' ? '654321' : '123456';
      const result = await verifyTOTP(wrongToken, secret);
      expect(result).toBe(false);
    });

    it('should verify with SHA256 algorithm', async () => {
      const secret = createSecret();
      const token = await generateTOTP(secret, 'SHA256', 6, 30);
      const isValid = await verifyTOTP(token, secret, 'SHA256', 6, 30);
      expect(isValid).toBe(true);
    });

    it('should verify with SHA512 algorithm', async () => {
      const secret = createSecret();
      const token = await generateTOTP(secret, 'SHA512', 6, 30);
      const isValid = await verifyTOTP(token, secret, 'SHA512', 6, 30);
      expect(isValid).toBe(true);
    });
  });

  describe('getRemainingSeconds', () => {
    it('should return value between 1 and period', () => {
      const remaining = getRemainingSeconds(30);
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect(remaining).toBeLessThanOrEqual(30);
    });

    it('should return value between 1 and 60 for 60s period', () => {
      const remaining = getRemainingSeconds(60);
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect(remaining).toBeLessThanOrEqual(60);
    });

    it('should calculate correctly at specific time', () => {
      // Mock Date.now to a known value
      // Unix time 1000000 * 1000ms => second 1000000
      // 1000000 % 30 = 10 => remaining = 30 - 10 = 20
      vi.spyOn(Date, 'now').mockReturnValue(1000000 * 1000);
      const remaining = getRemainingSeconds(30);
      expect(remaining).toBe(20);
    });
  });

  describe('getRemainingRatio', () => {
    it('should return value between 0 and 1', () => {
      const ratio = getRemainingRatio(30);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    it('should calculate correctly at specific time', () => {
      // remaining = 20, period = 30 => ratio = 20/30
      vi.spyOn(Date, 'now').mockReturnValue(1000000 * 1000);
      const ratio = getRemainingRatio(30);
      expect(ratio).toBeCloseTo(20 / 30);
    });
  });

  describe('parseOTPAuthURI', () => {
    it('should parse a standard TOTP URI', () => {
      const uri =
        'otpauth://totp/Google:user@gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=Google&algorithm=SHA1&digits=6&period=30';
      const result = parseOTPAuthURI(uri);

      expect(result.type).toBe('totp');
      expect(result.issuer).toBe('Google');
      expect(result.label).toBe('user@gmail.com');
      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(result.algorithm).toBe('SHA1');
      expect(result.digits).toBe(6);
      expect(result.period).toBe(30);
    });

    it('should parse URI without explicit issuer in path', () => {
      const uri =
        'otpauth://totp/user@gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
      const result = parseOTPAuthURI(uri);

      expect(result.issuer).toBe('GitHub');
      expect(result.label).toBe('user@gmail.com');
    });

    it('should use issuer param over path issuer', () => {
      const uri =
        'otpauth://totp/PathIssuer:user@test.com?secret=JBSWY3DPEHPK3PXP&issuer=ParamIssuer';
      const result = parseOTPAuthURI(uri);

      expect(result.issuer).toBe('ParamIssuer');
    });

    it('should default to SHA1, 6 digits, 30s period', () => {
      const uri = 'otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP';
      const result = parseOTPAuthURI(uri);

      expect(result.algorithm).toBe('SHA1');
      expect(result.digits).toBe(6);
      expect(result.period).toBe(30);
    });

    it('should parse SHA256 and 8 digits', () => {
      const uri =
        'otpauth://totp/Service:account?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60';
      const result = parseOTPAuthURI(uri);

      expect(result.algorithm).toBe('SHA256');
      expect(result.digits).toBe(8);
      expect(result.period).toBe(60);
    });

    it('should handle URL-encoded characters', () => {
      const uri =
        'otpauth://totp/My%20Service:hello%40world.com?secret=JBSWY3DPEHPK3PXP&issuer=My%20Service';
      const result = parseOTPAuthURI(uri);

      expect(result.issuer).toBe('My Service');
      expect(result.label).toBe('hello@world.com');
    });

    it('should uppercase the secret', () => {
      const uri = 'otpauth://totp/Test:user?secret=jbswy3dpehpk3pxp';
      const result = parseOTPAuthURI(uri);
      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    });

    it('should throw for non-otpauth URI', () => {
      expect(() => parseOTPAuthURI('https://example.com')).toThrow(
        'must start with "otpauth://"',
      );
    });

    it('should parse HOTP URI with counter', () => {
      const result = parseOTPAuthURI(
        'otpauth://hotp/Test:user?secret=JBSWY3DPEHPK3PXP&counter=5',
      );
      expect(result.type).toBe('hotp');
      expect(result.counter).toBe(5);
      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    });

    it('should default HOTP counter to 0 when missing', () => {
      const result = parseOTPAuthURI(
        'otpauth://hotp/Test:user?secret=JBSWY3DPEHPK3PXP',
      );
      expect(result.type).toBe('hotp');
      expect(result.counter).toBe(0);
    });

    it('should throw for unsupported type', () => {
      expect(() =>
        parseOTPAuthURI('otpauth://foo/Test:user?secret=JBSWY3DPEHPK3PXP'),
      ).toThrow('Unsupported OTP type');
    });

    it('should throw for missing secret', () => {
      expect(() => parseOTPAuthURI('otpauth://totp/Test:user')).toThrow(
        'missing "secret"',
      );
    });

    it('should throw for invalid algorithm', () => {
      expect(() =>
        parseOTPAuthURI(
          'otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP&algorithm=MD5',
        ),
      ).toThrow('Unsupported algorithm');
    });

    it('should throw for invalid digits', () => {
      expect(() =>
        parseOTPAuthURI(
          'otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP&digits=7',
        ),
      ).toThrow('Unsupported digits');
    });

    it('should handle trimmed whitespace', () => {
      const uri = '  otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP  ';
      const result = parseOTPAuthURI(uri);
      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    });
  });

  describe('buildOTPAuthURI', () => {
    it('should generate a valid otpauth URI', () => {
      const uri = buildOTPAuthURI({
        issuer: 'Google',
        label: 'user@gmail.com',
        secret: 'JBSWY3DPEHPK3PXP',
      });

      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=Google');
    });

    it('should produce a URI that can be parsed back', () => {
      const original = {
        issuer: 'MyApp',
        label: 'test@example.com',
        secret: 'JBSWY3DPEHPK3PXP',
        algorithm: 'SHA256' as const,
        digits: 8 as const,
        period: 60,
      };

      const uri = buildOTPAuthURI(original);
      const parsed = parseOTPAuthURI(uri);

      expect(parsed.issuer).toBe(original.issuer);
      expect(parsed.label).toBe(original.label);
      expect(parsed.secret).toBe(original.secret);
      expect(parsed.algorithm).toBe(original.algorithm);
      expect(parsed.digits).toBe(original.digits);
      expect(parsed.period).toBe(original.period);
    });

    it('should build and parse an HOTP URI round-trip', () => {
      const uri = buildOTPAuthURI({
        type: 'hotp',
        issuer: 'MyApp',
        label: 'test@example.com',
        secret: 'JBSWY3DPEHPK3PXP',
        counter: 7,
      });

      expect(uri).toContain('otpauth://hotp/');
      expect(uri).toContain('counter=7');

      const parsed = parseOTPAuthURI(uri);
      expect(parsed.type).toBe('hotp');
      expect(parsed.counter).toBe(7);
      expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP');
    });
  });

  describe('createSecret', () => {
    it('should generate a Base32 string', () => {
      const secret = createSecret();
      // Base32 contains only A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    });

    it('should generate unique secrets', () => {
      const s1 = createSecret();
      const s2 = createSecret();
      expect(s1).not.toBe(s2);
    });

    it('should generate a secret of expected length', () => {
      const secret = createSecret(20); // 20 bytes = 32 base32 chars
      expect(secret.replace(/=/g, '').length).toBeGreaterThanOrEqual(16);
    });
  });
});
