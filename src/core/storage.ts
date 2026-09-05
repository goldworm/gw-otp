/**
 * Storage 레이어 (chrome.storage.sync)
 *
 * - OTP 항목 CRUD (Create, Read, Update, Delete)
 * - 태그 관리
 * - 순서 관리 (order 배열)
 * - 설정 저장
 * - 청크 분할 (sync 용량 제한 대응: 항목당 8,192 bytes)
 *
 * 이 모듈은 순수 TypeScript이며 UI 관련 의존성이 없다.
 */

import type { OTPEntry, Tag, Settings, StorageSchema } from '@/types';
import { encrypt, decrypt } from '@/core/crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

/** chrome.storage.sync 항목당 최대 바이트 (여유분 확보) */
const CHUNK_MAX_BYTES = 7000;

/** Storage 키 접두사 */
const KEYS = {
  SETTINGS: 'settings',
  TAGS: 'tags',
  ORDER: 'order',
  ENTRIES_PREFIX: 'entries_',
} as const;

// ─── Chunk Utilities ─────────────────────────────────────────────────────────

/**
 * OTP 항목 배열을 chrome.storage.sync 크기 제한에 맞게 청크로 분할한다.
 */
export function splitEntriesIntoChunks(entries: OTPEntry[]): OTPEntry[][] {
  const chunks: OTPEntry[][] = [];
  let currentChunk: OTPEntry[] = [];
  let currentSize = 0;

  for (const entry of entries) {
    const entrySize = JSON.stringify(entry).length * 2; // UTF-16 추정
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
 * 설정을 저장한다.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [KEYS.SETTINGS]: settings });
}

/**
 * 설정을 불러온다.
 */
export async function loadSettings(): Promise<Settings | null> {
  const result = await chrome.storage.sync.get(KEYS.SETTINGS);
  return (result[KEYS.SETTINGS] as Settings) ?? null;
}

// ─── Tags ────────────────────────────────────────────────────────────────────

/**
 * 태그 목록을 저장한다.
 */
export async function saveTags(tags: Tag[]): Promise<void> {
  await chrome.storage.sync.set({ [KEYS.TAGS]: tags });
}

/**
 * 태그 목록을 불러온다.
 */
export async function loadTags(): Promise<Tag[]> {
  const result = await chrome.storage.sync.get(KEYS.TAGS);
  return (result[KEYS.TAGS] as Tag[]) ?? [];
}

/**
 * 태그를 추가한다.
 */
export async function addTag(tag: Tag): Promise<void> {
  const tags = await loadTags();
  tags.push(tag);
  await saveTags(tags);
}

/**
 * 태그를 삭제한다. 연관된 OTP 항목의 태그 참조도 제거한다.
 */
export async function deleteTag(tagId: string): Promise<void> {
  const tags = await loadTags();
  const filtered = tags.filter((t) => t.id !== tagId);
  await saveTags(filtered);

  // 연관된 entries에서 태그 제거
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
 * 순서 배열을 저장한다.
 */
export async function saveOrder(order: string[]): Promise<void> {
  await chrome.storage.sync.set({ [KEYS.ORDER]: order });
}

/**
 * 순서 배열을 불러온다.
 */
export async function loadOrder(): Promise<string[]> {
  const result = await chrome.storage.sync.get(KEYS.ORDER);
  return (result[KEYS.ORDER] as string[]) ?? [];
}

// ─── Entries (Chunked) ───────────────────────────────────────────────────────

/**
 * 모든 entries 청크 키를 조회한다.
 */
async function getEntryChunkKeys(): Promise<string[]> {
  const all = await chrome.storage.sync.get(null);
  return Object.keys(all).filter((key) => key.startsWith(KEYS.ENTRIES_PREFIX));
}

/**
 * OTP 항목 목록을 저장한다 (청크 분할).
 */
export async function saveEntries(entries: OTPEntry[]): Promise<void> {
  // 기존 청크 삭제
  const existingKeys = await getEntryChunkKeys();
  if (existingKeys.length > 0) {
    await chrome.storage.sync.remove(existingKeys);
  }

  // 새 청크 저장
  const chunks = splitEntriesIntoChunks(entries);
  const storageObj: Record<string, OTPEntry[]> = {};
  for (let i = 0; i < chunks.length; i++) {
    storageObj[`${KEYS.ENTRIES_PREFIX}${i}`] = chunks[i];
  }

  if (Object.keys(storageObj).length > 0) {
    await chrome.storage.sync.set(storageObj);
  }
}

/**
 * 모든 OTP 항목을 불러온다 (청크 병합).
 */
export async function loadEntries(): Promise<OTPEntry[]> {
  const chunkKeys = await getEntryChunkKeys();
  if (chunkKeys.length === 0) return [];

  // 키를 숫자 순으로 정렬
  chunkKeys.sort((a, b) => {
    const numA = parseInt(a.replace(KEYS.ENTRIES_PREFIX, ''), 10);
    const numB = parseInt(b.replace(KEYS.ENTRIES_PREFIX, ''), 10);
    return numA - numB;
  });

  const result = await chrome.storage.sync.get(chunkKeys);
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
 * OTP 항목을 추가한다. order 배열 끝에 ID를 추가한다.
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
 * OTP 항목을 업데이트한다.
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
 * OTP 항목을 삭제한다. order 배열에서도 제거한다.
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
 * ID로 단일 OTP 항목을 조회한다.
 */
export async function getEntry(id: string): Promise<OTPEntry | null> {
  const entries = await loadEntries();
  return entries.find((e) => e.id === id) ?? null;
}

// ─── Order Management ────────────────────────────────────────────────────────

/**
 * OTP 항목의 순서를 재정렬한다.
 *
 * @param newOrder - 새로운 ID 순서 배열
 */
export async function reorder(newOrder: string[]): Promise<void> {
  await saveOrder(newOrder);
}

// ─── Pin ─────────────────────────────────────────────────────────────────────

/**
 * OTP 항목의 상단 고정(pinned) 상태를 토글한다.
 *
 * @param id - 대상 entry ID
 * @returns 변경 후 pinned 상태
 * @throws 항목을 찾을 수 없는 경우
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
 * 전체 storage 데이터를 불러온다.
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
 * 전체 storage를 초기화한다 (주의: 모든 데이터 삭제).
 */
export async function clearAll(): Promise<void> {
  await chrome.storage.sync.clear();
}

// ─── Password Change ─────────────────────────────────────────────────────────

/**
 * 모든 OTP 항목의 encryptedSecret을 기존 키로 복호화한 뒤 새 키로 재암호화하고,
 * settings의 salt와 passwordHash를 원자적으로 업데이트한다.
 *
 * @param oldKey - 현재 마스터 키
 * @param newKey - 새 마스터 키
 * @param newSalt - 새 salt (Base64)
 * @param newPasswordHash - 새 비밀번호 검증 암호문 (Base64)
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
