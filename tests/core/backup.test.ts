import { describe, it, expect, beforeEach } from 'vitest';
import { parseBackupFile, decryptBackup, importBackup } from '@/core/backup';
import {
  deriveKey,
  generateSalt,
  encrypt,
  decrypt,
  bufferToBase64,
} from '@/core/crypto';
import {
  addEntry,
  loadEntries,
  loadOrder,
  loadTags,
  saveTags,
  clearAll,
} from '@/core/storage';
import type { BackupFile, OTPEntry, Tag } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createSessionKey(password = 'test-pass') {
  const salt = generateSalt();
  return deriveKey(password, salt);
}

function createMockEntry(overrides: Partial<OTPEntry> = {}): OTPEntry {
  return {
    id: crypto.randomUUID(),
    issuer: 'TestService',
    label: 'user@test.com',
    encryptedSecret: 'plaintext-secret', // used as plaintext in tests
    tags: [],
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Perform the same logic as createBackup for testing (without storage dependencies)
 */
async function createTestBackup(
  entries: OTPEntry[],
  tags: Tag[],
  order: string[],
  backupPassword: string,
): Promise<BackupFile> {
  const exportData = JSON.stringify({ entries, tags, order });
  const saltBytes = generateSalt();
  const key = await deriveKey(backupPassword, saltBytes);
  const encryptedData = await encrypt(exportData, key);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    salt: bufferToBase64(saltBytes),
    encryptedData,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('backup module', () => {
  beforeEach(async () => {
    await clearAll();
  });

  describe('parseBackupFile', () => {
    it('should parse valid backup JSON', async () => {
      const backup = await createTestBackup([], [], [], 'pass');
      const json = JSON.stringify(backup);
      const parsed = parseBackupFile(json);
      expect(parsed.version).toBe(1);
      expect(parsed.salt).toBeDefined();
      expect(parsed.encryptedData).toBeDefined();
    });

    it('should throw for invalid JSON', () => {
      expect(() => parseBackupFile('not json')).toThrow('Invalid backup file');
    });

    it('should throw for wrong version', () => {
      const invalid = JSON.stringify({
        version: 99,
        salt: 'x',
        encryptedData: 'y',
      });
      expect(() => parseBackupFile(invalid)).toThrow('Unsupported backup version');
    });

    it('should throw for missing fields', () => {
      const invalid = JSON.stringify({ version: 1 });
      expect(() => parseBackupFile(invalid)).toThrow('missing required data');
    });
  });

  describe('decryptBackup', () => {
    it('should decrypt with correct password', async () => {
      const entries = [createMockEntry({ id: 'e1' })];
      const tags: Tag[] = [{ id: 't1', name: 'Work', color: '#ff0000' }];
      const order = ['e1'];

      const backup = await createTestBackup(
        entries,
        tags,
        order,
        'my-password',
      );
      const data = await decryptBackup(backup, 'my-password');

      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].id).toBe('e1');
      expect(data.tags).toHaveLength(1);
      expect(data.tags[0].name).toBe('Work');
      expect(data.order).toEqual(['e1']);
    });

    it('should throw with wrong password', async () => {
      const backup = await createTestBackup([], [], [], 'correct');
      await expect(decryptBackup(backup, 'wrong')).rejects.toThrow(
        'The password is incorrect',
      );
    });
  });

  describe('importBackup - replace mode', () => {
    it('should replace all data', async () => {
      const sessionKey = await createSessionKey();

      // Existing data
      const existingEntry = createMockEntry({ id: 'existing' });
      existingEntry.encryptedSecret = await encrypt('OLD_SECRET', sessionKey);
      await addEntry(existingEntry);

      // Data to import (encryptedSecret is plaintext)
      const importEntry = createMockEntry({
        id: 'imported',
        encryptedSecret: 'NEW_SECRET',
      });
      const data = {
        entries: [importEntry],
        tags: [{ id: 'tag1', name: 'Imported', color: '#00ff00' }],
        order: ['imported'],
      };

      const result = await importBackup(data, sessionKey, 'replace');
      expect(result.imported).toBe(1);

      const entries = await loadEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('imported');

      // Verify re-encryption
      const decryptedSecret = await decrypt(
        entries[0].encryptedSecret,
        sessionKey,
      );
      expect(decryptedSecret).toBe('NEW_SECRET');

      const tags = await loadTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('Imported');
    });
  });

  describe('importBackup - merge mode', () => {
    it('should add new entries and skip duplicates', async () => {
      const sessionKey = await createSessionKey();

      // Existing data
      const existingEntry = createMockEntry({
        id: 'existing',
        issuer: 'Existing',
      });
      existingEntry.encryptedSecret = await encrypt('EXIST_SECRET', sessionKey);
      await addEntry(existingEntry);

      // Data to import (same ID + new ID)
      const duplicateEntry = createMockEntry({
        id: 'existing',
        encryptedSecret: 'DUP',
      });
      const newEntry = createMockEntry({
        id: 'new-one',
        encryptedSecret: 'NEW_SECRET',
      });
      const data = {
        entries: [duplicateEntry, newEntry],
        tags: [],
        order: ['existing', 'new-one'],
      };

      const result = await importBackup(data, sessionKey, 'merge');
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);

      const entries = await loadEntries();
      expect(entries).toHaveLength(2);

      const order = await loadOrder();
      expect(order).toContain('existing');
      expect(order).toContain('new-one');
    });

    it('should merge tags without duplicates', async () => {
      const sessionKey = await createSessionKey();

      await saveTags([{ id: 'tag-a', name: 'A', color: '#111' }]);

      const data = {
        entries: [],
        tags: [
          { id: 'tag-a', name: 'A-dup', color: '#222' }, // duplicate
          { id: 'tag-b', name: 'B', color: '#333' }, // new
        ],
        order: [],
      };

      await importBackup(data, sessionKey, 'merge');

      const tags = await loadTags();
      expect(tags).toHaveLength(2);
      expect(tags.find((t) => t.id === 'tag-a')!.name).toBe('A'); // existing kept
      expect(tags.find((t) => t.id === 'tag-b')!.name).toBe('B');
    });
  });

  describe('full round-trip', () => {
    it('should export and import data correctly', async () => {
      const sessionKey = await createSessionKey();
      const backupPassword = 'backup-pass';

      // Prepare source data
      const entry1 = createMockEntry({
        id: 'rt-1',
        issuer: 'Google',
        encryptedSecret: 'SECRET_A',
      });
      const entry2 = createMockEntry({
        id: 'rt-2',
        issuer: 'GitHub',
        encryptedSecret: 'SECRET_B',
      });

      // Create a backup with createTestBackup (entries' encryptedSecret is plaintext)
      const backup = await createTestBackup(
        [entry1, entry2],
        [{ id: 'tag-x', name: 'X', color: '#abc' }],
        ['rt-1', 'rt-2'],
        backupPassword,
      );

      // Serialize → parse the backup
      const json = JSON.stringify(backup);
      const parsed = parseBackupFile(json);

      // Decrypt
      const data = await decryptBackup(parsed, backupPassword);
      expect(data.entries).toHaveLength(2);

      // Import
      const result = await importBackup(data, sessionKey, 'replace');
      expect(result.imported).toBe(2);

      // Verify the result
      const entries = await loadEntries();
      expect(entries).toHaveLength(2);

      const secret1 = await decrypt(
        entries.find((e) => e.id === 'rt-1')!.encryptedSecret,
        sessionKey,
      );
      expect(secret1).toBe('SECRET_A');

      const secret2 = await decrypt(
        entries.find((e) => e.id === 'rt-2')!.encryptedSecret,
        sessionKey,
      );
      expect(secret2).toBe('SECRET_B');
    });
  });
});
