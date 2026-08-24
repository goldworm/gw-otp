import { describe, it, expect } from 'vitest';
import {
  bufferToBase64,
  base64ToBuffer,
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  createPasswordHash,
  verifyPassword,
  initializePassword,
  unlockWithPassword,
} from '@/core/crypto';

describe('crypto module', () => {
  describe('bufferToBase64 / base64ToBuffer', () => {
    it('should round-trip conversion', () => {
      const original = new Uint8Array([0, 1, 2, 128, 255]);
      const base64 = bufferToBase64(original);
      const result = base64ToBuffer(base64);
      expect(result).toEqual(original);
    });

    it('should handle empty buffer', () => {
      const empty = new Uint8Array(0);
      const base64 = bufferToBase64(empty);
      const result = base64ToBuffer(base64);
      expect(result).toEqual(empty);
    });
  });

  describe('generateSalt', () => {
    it('should generate 16-byte salt', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.byteLength).toBe(16);
    });

    it('should generate unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(bufferToBase64(salt1)).not.toBe(bufferToBase64(salt2));
    });
  });

  describe('deriveKey', () => {
    it('should derive a CryptoKey from password and salt', async () => {
      const salt = generateSalt();
      const key = await deriveKey('test-password', salt);
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    });

    it('should derive same key for same password and salt', async () => {
      const salt = generateSalt();
      const key1 = await deriveKey('same-password', salt);
      const key2 = await deriveKey('same-password', salt);

      // 같은 키로 암호화한 결과를 서로 복호화할 수 있어야 함
      const encrypted = await encrypt('test', key1);
      const decrypted = await decrypt(encrypted, key2);
      expect(decrypted).toBe('test');
    });

    it('should derive different keys for different passwords', async () => {
      const salt = generateSalt();
      const key1 = await deriveKey('password-a', salt);
      const key2 = await deriveKey('password-b', salt);

      const encrypted = await encrypt('secret-data', key1);
      await expect(decrypt(encrypted, key2)).rejects.toThrow();
    });

    it('should derive different keys for different salts', async () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const key1 = await deriveKey('same-password', salt1);
      const key2 = await deriveKey('same-password', salt2);

      const encrypted = await encrypt('secret-data', key1);
      await expect(decrypt(encrypted, key2)).rejects.toThrow();
    });
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string', async () => {
      const salt = generateSalt();
      const key = await deriveKey('my-password', salt);

      const plaintext = 'Hello, World!';
      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', async () => {
      const salt = generateSalt();
      const key = await deriveKey('my-password', salt);

      const plaintext = 'same-input';
      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      expect(encrypted1).not.toBe(encrypted2);

      // 둘 다 정상 복호화 가능
      expect(await decrypt(encrypted1, key)).toBe(plaintext);
      expect(await decrypt(encrypted2, key)).toBe(plaintext);
    });

    it('should handle unicode text', async () => {
      const salt = generateSalt();
      const key = await deriveKey('password', salt);

      const plaintext = '한글 테스트 🔑 émojis';
      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', async () => {
      const salt = generateSalt();
      const key = await deriveKey('password', salt);

      const encrypted = await encrypt('', key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe('');
    });

    it('should fail decryption with wrong key', async () => {
      const salt = generateSalt();
      const correctKey = await deriveKey('correct', salt);
      const wrongKey = await deriveKey('wrong', salt);

      const encrypted = await encrypt('secret', correctKey);
      await expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
    });

    it('should fail decryption with tampered data', async () => {
      const salt = generateSalt();
      const key = await deriveKey('password', salt);

      const encrypted = await encrypt('data', key);
      // 암호문의 일부를 변조
      const tampered = encrypted.slice(0, -2) + 'XX';
      await expect(decrypt(tampered, key)).rejects.toThrow();
    });
  });

  describe('createPasswordHash / verifyPassword', () => {
    it('should verify correct password', async () => {
      const salt = generateSalt();
      const key = await deriveKey('correct-password', salt);

      const hash = await createPasswordHash(key);
      const isValid = await verifyPassword(hash, key);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const salt = generateSalt();
      const correctKey = await deriveKey('correct-password', salt);
      const wrongKey = await deriveKey('wrong-password', salt);

      const hash = await createPasswordHash(correctKey);
      const isValid = await verifyPassword(hash, wrongKey);

      expect(isValid).toBe(false);
    });
  });

  describe('initializePassword', () => {
    it('should return salt, passwordHash, and key', async () => {
      const result = await initializePassword('new-password');

      expect(result.salt).toBeDefined();
      expect(result.salt.length).toBeGreaterThan(0);
      expect(result.passwordHash).toBeDefined();
      expect(result.passwordHash.length).toBeGreaterThan(0);
      expect(result.key).toBeDefined();
      expect(result.key.type).toBe('secret');
    });

    it('should produce verifiable passwordHash', async () => {
      const result = await initializePassword('test-password');
      const isValid = await verifyPassword(result.passwordHash, result.key);
      expect(isValid).toBe(true);
    });
  });

  describe('unlockWithPassword', () => {
    it('should return key for correct password', async () => {
      const { salt, passwordHash } = await initializePassword('my-secret');

      const key = await unlockWithPassword('my-secret', salt, passwordHash);
      expect(key).not.toBeNull();

      // 반환된 키로 암호화/복호화 가능한지 확인
      const encrypted = await encrypt('test-data', key!);
      const decrypted = await decrypt(encrypted, key!);
      expect(decrypted).toBe('test-data');
    });

    it('should return null for incorrect password', async () => {
      const { salt, passwordHash } = await initializePassword('correct');

      const key = await unlockWithPassword('incorrect', salt, passwordHash);
      expect(key).toBeNull();
    });

    it('should work with the key from initializePassword', async () => {
      const {
        salt,
        passwordHash,
        key: initKey,
      } = await initializePassword('shared-password');

      // initializePassword의 키로 암호화
      const encrypted = await encrypt('important', initKey);

      // unlockWithPassword의 키로 복호화
      const unlockKey = await unlockWithPassword(
        'shared-password',
        salt,
        passwordHash,
      );
      expect(unlockKey).not.toBeNull();

      const decrypted = await decrypt(encrypted, unlockKey!);
      expect(decrypted).toBe('important');
    });
  });
});
