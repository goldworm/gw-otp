/**
 * Storage layer (chrome.storage.local)
 *
 * - OTP entry CRUD (Create, Read, Update, Delete)
 * - Tag management
 * - Order management (order array)
 * - Settings persistence
 * - Chunk splitting (kept from the previous sync-based design; harmless on
 *   local storage, which has a much larger quota)
 *
 * This module is pure TypeScript and has no UI dependencies.
 * All data is stored in chrome.storage.local so that sensitive OTP secrets
 * never leave the device via cloud sync.
 */

import type { OTPEntry, Tag, Settings, StorageSchema } from '@/types';
import { encrypt, decrypt } from '@/core/crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum bytes per stored chunk (with headroom).
 *
 * chrome.storage.local has a generous quota (~5 MB by default), so chunking is
 * no longer strictly required. It is kept to bound the size of individual
 * stored values and to preserve backward-compatible data layout.
 */
const CHUNK_MAX_BYTES = 7000;

/** Storage key prefixes */
const KEYS = {
  SETTINGS: 'settings',
  TAGS: 'tags',
  ORDER: 'order',
  ENTRIES_PREFIX: 'entries_',
} as const;

// ─── Chunk Utilities ─────────────────────────────────────────────────────────

/**
 * Split the OTP entry array into chunks that stay under CHUNK_MAX_BYTES.
 */
export function splitEntriesIntoChunks(entries: OTPEntry[]): OTPEntry[][] {
  const chunks: OTPEntry[][] = [];
  let currentChunk: OTPEntry[] = [];
  let currentSize = 0;

  for (const entry of entries) {
    const entrySize = JSON.stringify(entry).length * 2; // UTF-16 estimate
    if (currentSize + entrySize > CHUNK_MAX_BYTES && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(entry);
    currentSize += entrySize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * Persist settings.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.SETTINGS]: settings });
}

/**
 * Load settings.
 */
export async function loadSettings(): Promise<Settings | null> {
  const result = await chrome.storage.local.get(KEYS.SETTINGS);
  return (result[KEYS.SETTINGS] as Settings) ?? null;
}

// ─── Tags ────────────────────────────────────────────────────────────────────

/**
 * Persist the tag list.
 */
export async function saveTags(tags: Tag[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.TAGS]: tags });
}

/**
 * Load the tag list.
 */
export async function loadTags(): Promise<Tag[]> {
  const result = await chrome.storage.local.get(KEYS.TAGS);
  return (result[KEYS.TAGS] as Tag[]) ?? [];
}

/**
 * Add a tag.
 */
export async function addTag(tag: Tag): Promise<void> {
  const tags = await loadTags();
  tags.push(tag);
  await saveTags(tags);
}

/**
 * Delete a tag. Also removes the tag reference from associated OTP entries.
 */
export async function deleteTag(tagId: string): Promise<void> {
  const tags = await loadTags();
  const filtered = tags.filter((t) => t.id !== tagId);
  await saveTags(filtered);

  // Remove the tag from associated entries
  const entries = await loadEntries();
  let modified = false;
  for (const entry of entries) {
    const idx = entry.tags.indexOf(tagId);
    if (idx !== -1) {
      entry.tags.splice(idx, 1);
      modified = true;
    }
  }
  if (modified) {
    await saveEntries(entries);
  }
}

// ─── Order ───────────────────────────────────────────────────────────────────

/**
 * Persist the order array.
 */
export async function saveOrder(order: string[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.ORDER]: order });
}

/**
 * Load the order array.
 */
export async function loadOrder(): Promise<string[]> {
  const result = await chrome.storage.local.get(KEYS.ORDER);
  return (result[KEYS.ORDER] as string[]) ?? [];
}

// ─── Entries (Chunked) ───────────────────────────────────────────────────────

/**
 * Look up all entry chunk keys.
 */
async function getEntryChunkKeys(): Promise<string[]> {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((key) => key.startsWith(KEYS.ENTRIES_PREFIX));
}

/**
 * Persist the OTP entry list (chunked).
 */
export async function saveEntries(entries: OTPEntry[]): Promise<void> {
  // Remove existing chunks
  const existingKeys = await getEntryChunkKeys();
  if (existingKeys.length > 0) {
    await chrome.storage.local.remove(existingKeys);
  }

  // Store new chunks
  const chunks = splitEntriesIntoChunks(entries);
  const storageObj: Record<string, OTPEntry[]> = {};
  for (let i = 0; i < chunks.length; i++) {
    storageObj[`${KEYS.ENTRIES_PREFIX}${i}`] = chunks[i];
  }

  if (Object.keys(storageObj).length > 0) {
    await chrome.storage.local.set(storageObj);
  }
}

/**
 * Load all OTP entries (merging chunks).
 */
export async function loadEntries(): Promise<OTPEntry[]> {
  const chunkKeys = await getEntryChunkKeys();
  if (chunkKeys.length === 0) return [];

  // Sort keys in numeric order
  chunkKeys.sort((a, b) => {
    const numA = parseInt(a.replace(KEYS.ENTRIES_PREFIX, ''), 10);
    const numB = parseInt(b.replace(KEYS.ENTRIES_PREFIX, ''), 10);
    return numA - numB;
  });

  const result = await chrome.storage.local.get(chunkKeys);
  const entries: OTPEntry[] = [];
  for (const key of chunkKeys) {
    const chunk = result[key] as OTPEntry[] | undefined;
    if (chunk) {
      entries.push(...chunk);
    }
  }

  return entries;
}

// ─── Entry CRUD ──────────────────────────────────────────────────────────────

/**
 * Add an OTP entry. Appends the ID to the end of the order array.
 */
export async function addEntry(entry: OTPEntry): Promise<void> {
  const entries = await loadEntries();
  entries.push(entry);
  await saveEntries(entries);

  const order = await loadOrder();
  order.push(entry.id);
  await saveOrder(order);
}

/**
 * Update an OTP entry.
 */
export async function updateEntry(
  id: string,
  updates: Partial<Omit<OTPEntry, 'id'>>,
): Promise<void> {
  const entries = await loadEntries();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`Entry not found: ${id}`);
  }

  entries[index] = {
    ...entries[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await saveEntries(entries);
}

/**
 * Delete an OTP entry. Also removes it from the order array.
 */
export async function deleteEntry(id: string): Promise<void> {
  const entries = await loadEntries();
  const filtered = entries.filter((e) => e.id !== id);
  await saveEntries(filtered);

  const order = await loadOrder();
  const newOrder = order.filter((oid) => oid !== id);
  await saveOrder(newOrder);
}

/**
 * Look up a single OTP entry by ID.
 */
export async function getEntry(id: string): Promise<OTPEntry | null> {
  const entries = await loadEntries();
  return entries.find((e) => e.id === id) ?? null;
}

// ─── Order Management ────────────────────────────────────────────────────────

/**
 * Reorder the OTP entries.
 *
 * @param newOrder - the new array of IDs in the desired order
 */
export async function reorder(newOrder: string[]): Promise<void> {
  await saveOrder(newOrder);
}

// ─── HOTP Counter ────────────────────────────────────────────────────────────

/**
 * Increment the counter of an HOTP entry by 1.
 *
 * @param id - the target entry ID
 * @returns the counter value after incrementing
 * @throws if the entry cannot be found
 */
export async function incrementCounter(id: string): Promise<number> {
  const entries = await loadEntries();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`Entry not found: ${id}`);
  }

  const newCounter = (entries[index].counter ?? 0) + 1;
  entries[index] = {
    ...entries[index],
    counter: newCounter,
    updatedAt: new Date().toISOString(),
  };
  await saveEntries(entries);
  return newCounter;
}

// ─── Pin ─────────────────────────────────────────────────────────────────────

/**
 * Toggle the pinned (pin-to-top) state of an OTP entry.
 *
 * @param id - the target entry ID
 * @returns the pinned state after toggling
 * @throws if the entry cannot be found
 */
export async function togglePin(id: string): Promise<boolean> {
  const entries = await loadEntries();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`Entry not found: ${id}`);
  }

  const newPinned = !entries[index].pinned;
  entries[index] = {
    ...entries[index],
    pinned: newPinned,
    updatedAt: new Date().toISOString(),
  };
  await saveEntries(entries);
  return newPinned;
}

// ─── Full Data Load ──────────────────────────────────────────────────────────

/**
 * Load the entire storage dataset.
 */
export async function loadAll(): Promise<Partial<StorageSchema>> {
  const [settings, entries, tags, order] = await Promise.all([
    loadSettings(),
    loadEntries(),
    loadTags(),
    loadOrder(),
  ]);

  return {
    settings: settings ?? undefined,
    entries,
    tags,
    order,
  };
}

/**
 * Clear the entire storage (caution: deletes all data).
 */
export async function clearAll(): Promise<void> {
  await chrome.storage.local.clear();
}

// ─── Password Change ─────────────────────────────────────────────────────────

/**
 * Decrypt every OTP entry's encryptedSecret with the old key, re-encrypt it
 * with the new key, and atomically update the salt and passwordHash in settings.
 *
 * @param oldKey - the current master key
 * @param newKey - the new master key
 * @param newSalt - the new salt (Base64)
 * @param newPasswordHash - the new password verification ciphertext (Base64)
 */
export async function reencryptAllEntries(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  newSalt: string,
  newPasswordHash: string,
): Promise<void> {
  const entries = await loadEntries();

  const reencrypted = await Promise.all(
    entries.map(async (entry) => {
      const plainSecret = await decrypt(entry.encryptedSecret, oldKey);
      const encryptedSecret = await encrypt(plainSecret, newKey);
      return { ...entry, encryptedSecret, updatedAt: new Date().toISOString() };
    }),
  );

  await saveEntries(reencrypted);

  const settings = await loadSettings();
  if (settings) {
    await saveSettings({
      ...settings,
      salt: newSalt,
      passwordHash: newPasswordHash,
    });
  }
}
