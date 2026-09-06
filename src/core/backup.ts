/**
 * Export/import module
 *
 * - Export OTP data to an encrypted .gw-otp file
 * - Decrypt and import data from a .gw-otp file
 *
 * This module is pure TypeScript and has no UI dependencies.
 */

import type { BackupFile, OTPEntry, Tag } from '@/types';
import {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  bufferToBase64,
  base64ToBuffer,
} from '@/core/crypto';
import {
  loadEntries,
  loadTags,
  loadOrder,
  saveEntries,
  saveTags,
  saveOrder,
} from '@/core/storage';

/** Backup file format version */
const BACKUP_VERSION = 1;

// ─── Export Types ────────────────────────────────────────────────────────────

interface ExportData {
  entries: OTPEntry[];
  tags: Tag[];
  order: string[];
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Encrypt all currently stored OTP data and build a BackupFile.
 *
 * @param password - the export password
 * @param sessionKey - the current session's CryptoKey (to decrypt entry secrets)
 * @returns a BackupFile object (JSON-serializable)
 */
export async function createBackup(
  password: string,
  sessionKey: CryptoKey,
): Promise<BackupFile> {
  // 1. Load current data
  const [entries, tags, order] = await Promise.all([
    loadEntries(),
    loadTags(),
    loadOrder(),
  ]);

  // 2. Decrypt each entry's encryptedSecret into plaintext
  const decryptedEntries: OTPEntry[] = await Promise.all(
    entries.map(async (entry) => {
      const plainSecret = await decrypt(entry.encryptedSecret, sessionKey);
      return { ...entry, encryptedSecret: plainSecret }; // temporarily hold plaintext
    }),
  );

  // 3. Serialize the whole dataset to JSON
  const exportData: ExportData = {
    entries: decryptedEntries,
    tags,
    order,
  };
  const jsonData = JSON.stringify(exportData);

  // 4. Encrypt with the export password
  const saltBytes = generateSalt();
  const key = await deriveKey(password, saltBytes);
  const encryptedData = await encrypt(jsonData, key);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    salt: bufferToBase64(saltBytes),
    encryptedData,
  };
}

/**
 * Serialize a BackupFile to JSON and create a downloadable Blob URL.
 *
 * @param backup - the BackupFile object
 * @returns { url, filename } - the download URL and file name
 */
export function createDownloadURL(backup: BackupFile): {
  url: string;
  filename: string;
} {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `gw-otp-backup-${date}.gw-otp`;
  return { url, filename };
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Parse a .gw-otp file.
 *
 * @param fileContent - the file content (JSON string)
 * @returns a BackupFile object
 * @throws if the format is invalid
 */
export function parseBackupFile(fileContent: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    throw new Error('Invalid backup file format.');
  }

  const backup = parsed as BackupFile;
  if (!backup || backup.version !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version: ${(backup as { version?: unknown })?.version}`,
    );
  }
  if (!backup.salt || !backup.encryptedData) {
    throw new Error('The backup file is missing required data.');
  }

  return backup;
}

/**
 * Decrypt and return the data from a BackupFile.
 *
 * @param backup - the BackupFile object
 * @param password - the password used when exporting
 * @returns the decrypted ExportData
 * @throws if the password is incorrect
 */
export async function decryptBackup(
  backup: BackupFile,
  password: string,
): Promise<ExportData> {
  const saltBytes = base64ToBuffer(backup.salt);
  const key = await deriveKey(password, saltBytes);

  let jsonData: string;
  try {
    jsonData = await decrypt(backup.encryptedData, key);
  } catch {
    throw new Error('The password is incorrect.');
  }

  const data = JSON.parse(jsonData) as ExportData;
  if (
    !Array.isArray(data.entries) ||
    !Array.isArray(data.tags) ||
    !Array.isArray(data.order)
  ) {
    throw new Error('The backup data structure is invalid.');
  }

  return data;
}

/**
 * Merge decrypted backup data into the current storage.
 * Re-encrypts each entry's plaintext secret with the current sessionKey.
 *
 * @param data - the decrypted ExportData (entries' encryptedSecret is actual plaintext)
 * @param sessionKey - the current session's CryptoKey
 * @param mode - 'merge' (keep existing + add) or 'replace' (replace everything)
 */
export async function importBackup(
  data: ExportData,
  sessionKey: CryptoKey,
  mode: 'merge' | 'replace' = 'merge',
): Promise<{ imported: number; skipped: number }> {
  // Re-encrypt each entry's plaintext secret with the current key
  const reEncryptedEntries: OTPEntry[] = await Promise.all(
    data.entries.map(async (entry) => {
      const encryptedSecret = await encrypt(entry.encryptedSecret, sessionKey);
      return { ...entry, encryptedSecret };
    }),
  );

  if (mode === 'replace') {
    await saveEntries(reEncryptedEntries);
    await saveTags(data.tags);
    await saveOrder(data.order);
    return { imported: reEncryptedEntries.length, skipped: 0 };
  }

  // merge mode: combine existing data with new data
  const [existingEntries, existingTags, existingOrder] = await Promise.all([
    loadEntries(),
    loadTags(),
    loadOrder(),
  ]);

  const existingIds = new Set(existingEntries.map((e) => e.id));
  const newEntries = reEncryptedEntries.filter((e) => !existingIds.has(e.id));
  const skipped = reEncryptedEntries.length - newEntries.length;

  // Merge entries
  const mergedEntries = [...existingEntries, ...newEntries];
  await saveEntries(mergedEntries);

  // Merge tags (dedupe by ID)
  const existingTagIds = new Set(existingTags.map((t) => t.id));
  const newTags = data.tags.filter((t) => !existingTagIds.has(t.id));
  await saveTags([...existingTags, ...newTags]);

  // Merge order (append new items at the end)
  const newOrderIds = newEntries.map((e) => e.id);
  await saveOrder([...existingOrder, ...newOrderIds]);

  return { imported: newEntries.length, skipped };
}
