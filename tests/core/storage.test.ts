import { describe, it, expect, beforeEach } from 'vitest';
import type { OTPEntry, Tag, Settings } from '@/types';
import {
  splitEntriesIntoChunks,
  saveSettings,
  loadSettings,
  saveTags,
  loadTags,
  addTag,
  deleteTag,
  saveOrder,
  loadOrder,
  saveEntries,
  loadEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  getEntry,
  reorder,
  loadAll,
  clearAll,
} from '@/core/storage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockEntry(overrides: Partial<OTPEntry> = {}): OTPEntry {
  return {
    id: crypto.randomUUID(),
    issuer: 'TestService',
    label: 'user@test.com',
    encryptedSecret: 'encryptedBase64==',
    tags: [],
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: crypto.randomUUID(),
    name: 'Test Tag',
    color: '#3b82f6',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('storage module', () => {
  beforeEach(async () => {
    await chrome.storage.sync.clear();
  });

  describe('splitEntriesIntoChunks', () => {
    it('should return empty array for empty entries', () => {
      const chunks = splitEntriesIntoChunks([]);
      expect(chunks).toEqual([]);
    });

    it('should keep small entries in a single chunk', () => {
      const entries = [createMockEntry(), createMockEntry(), createMockEntry()];
      const chunks = splitEntriesIntoChunks(entries);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(entries);
    });

    it('should split large entries into multiple chunks', () => {
      // 큰 encryptedSecret으로 항목 크기를 늘림
      const largeSecret = 'x'.repeat(2000);
      const entries = Array.from({ length: 10 }, () =>
        createMockEntry({ encryptedSecret: largeSecret }),
      );
      const chunks = splitEntriesIntoChunks(entries);
      expect(chunks.length).toBeGreaterThan(1);

      // 모든 항목이 포함되어야 함
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      expect(total).toBe(10);
    });
  });

  describe('settings', () => {
    it('should return null when no settings saved', async () => {
      const settings = await loadSettings();
      expect(settings).toBeNull();
    });

    it('should save and load settings', async () => {
      const settings: Settings = {
        hideCodesUntilHover: true,
        theme: 'dark',
        passwordHash: 'hash==',
        salt: 'salt==',
      };
      await saveSettings(settings);
      const loaded = await loadSettings();
      expect(loaded).toEqual(settings);
    });

    it('should overwrite existing settings', async () => {
      const settings1: Settings = {
        hideCodesUntilHover: false,
        theme: 'light',
        passwordHash: 'h1',
        salt: 's1',
      };
      const settings2: Settings = {
        hideCodesUntilHover: true,
        theme: 'system',
        passwordHash: 'h2',
        salt: 's2',
      };
      await saveSettings(settings1);
      await saveSettings(settings2);
      const loaded = await loadSettings();
      expect(loaded).toEqual(settings2);
    });
  });

  describe('tags', () => {
    it('should return empty array when no tags', async () => {
      const tags = await loadTags();
      expect(tags).toEqual([]);
    });

    it('should save and load tags', async () => {
      const tags = [
        createMockTag({ name: 'Work' }),
        createMockTag({ name: 'Personal' }),
      ];
      await saveTags(tags);
      const loaded = await loadTags();
      expect(loaded).toEqual(tags);
    });

    it('should add a tag', async () => {
      const tag1 = createMockTag({ name: 'First' });
      const tag2 = createMockTag({ name: 'Second' });
      await addTag(tag1);
      await addTag(tag2);
      const loaded = await loadTags();
      expect(loaded).toHaveLength(2);
      expect(loaded[0]).toEqual(tag1);
      expect(loaded[1]).toEqual(tag2);
    });

    it('should delete a tag and remove references from entries', async () => {
      const tag = createMockTag({ name: 'ToDelete' });
      await addTag(tag);

      const entry = createMockEntry({ tags: [tag.id] });
      await addEntry(entry);

      await deleteTag(tag.id);

      const tags = await loadTags();
      expect(tags).toHaveLength(0);

      const updatedEntry = await getEntry(entry.id);
      expect(updatedEntry!.tags).not.toContain(tag.id);
      expect(updatedEntry!.tags).toEqual([]);
    });
  });

  describe('order', () => {
    it('should return empty array when no order', async () => {
      const order = await loadOrder();
      expect(order).toEqual([]);
    });

    it('should save and load order', async () => {
      const order = ['id-1', 'id-2', 'id-3'];
      await saveOrder(order);
      const loaded = await loadOrder();
      expect(loaded).toEqual(order);
    });

    it('should reorder', async () => {
      await saveOrder(['a', 'b', 'c']);
      await reorder(['c', 'a', 'b']);
      const loaded = await loadOrder();
      expect(loaded).toEqual(['c', 'a', 'b']);
    });
  });

  describe('entries (chunked)', () => {
    it('should return empty array when no entries', async () => {
      const entries = await loadEntries();
      expect(entries).toEqual([]);
    });

    it('should save and load entries', async () => {
      const entries = [createMockEntry(), createMockEntry()];
      await saveEntries(entries);
      const loaded = await loadEntries();
      expect(loaded).toEqual(entries);
    });

    it('should handle many entries with chunking', async () => {
      const largeSecret = 'y'.repeat(1500);
      const entries = Array.from({ length: 15 }, (_, i) =>
        createMockEntry({ id: `entry-${i}`, encryptedSecret: largeSecret }),
      );
      await saveEntries(entries);
      const loaded = await loadEntries();
      expect(loaded).toHaveLength(15);
      expect(loaded.map((e) => e.id)).toEqual(entries.map((e) => e.id));
    });

    it('should overwrite previous entries on save', async () => {
      const entries1 = [createMockEntry({ id: 'old' })];
      const entries2 = [createMockEntry({ id: 'new' })];
      await saveEntries(entries1);
      await saveEntries(entries2);
      const loaded = await loadEntries();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('new');
    });
  });

  describe('entry CRUD', () => {
    it('should add an entry and update order', async () => {
      const entry = createMockEntry();
      await addEntry(entry);

      const entries = await loadEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);

      const order = await loadOrder();
      expect(order).toContain(entry.id);
    });

    it('should add multiple entries preserving order', async () => {
      const entry1 = createMockEntry({ id: 'first' });
      const entry2 = createMockEntry({ id: 'second' });
      const entry3 = createMockEntry({ id: 'third' });

      await addEntry(entry1);
      await addEntry(entry2);
      await addEntry(entry3);

      const order = await loadOrder();
      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('should get a single entry by id', async () => {
      const entry = createMockEntry();
      await addEntry(entry);

      const found = await getEntry(entry.id);
      expect(found).toEqual(entry);
    });

    it('should return null for non-existent entry', async () => {
      const found = await getEntry('non-existent');
      expect(found).toBeNull();
    });

    it('should update an entry', async () => {
      const entry = createMockEntry({
        issuer: 'OldIssuer',
        updatedAt: '2020-01-01T00:00:00.000Z',
      });
      await addEntry(entry);

      await updateEntry(entry.id, {
        issuer: 'NewIssuer',
        label: 'new@email.com',
      });

      const updated = await getEntry(entry.id);
      expect(updated!.issuer).toBe('NewIssuer');
      expect(updated!.label).toBe('new@email.com');
      // updatedAt이 갱신되었는지 확인 (원래 값과 달라야 함)
      expect(updated!.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    });

    it('should throw when updating non-existent entry', async () => {
      await expect(
        updateEntry('non-existent', { issuer: 'X' }),
      ).rejects.toThrow('Entry not found');
    });

    it('should delete an entry and remove from order', async () => {
      const entry1 = createMockEntry({ id: 'keep' });
      const entry2 = createMockEntry({ id: 'remove' });

      await addEntry(entry1);
      await addEntry(entry2);

      await deleteEntry('remove');

      const entries = await loadEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('keep');

      const order = await loadOrder();
      expect(order).toEqual(['keep']);
    });
  });

  describe('loadAll', () => {
    it('should load all data at once', async () => {
      const settings: Settings = {
        hideCodesUntilHover: false,
        theme: 'light',
        passwordHash: 'ph',
        salt: 'sl',
      };
      await saveSettings(settings);

      const tag = createMockTag({ name: 'All' });
      await addTag(tag);

      const entry = createMockEntry({ tags: [tag.id] });
      await addEntry(entry);

      const data = await loadAll();
      expect(data.settings).toEqual(settings);
      expect(data.tags).toHaveLength(1);
      expect(data.entries).toHaveLength(1);
      expect(data.order).toEqual([entry.id]);
    });
  });

  describe('clearAll', () => {
    it('should remove all data', async () => {
      await addEntry(createMockEntry());
      await addTag(createMockTag());
      await saveSettings({
        hideCodesUntilHover: false,
        theme: 'light',
        passwordHash: 'x',
        salt: 'y',
      });

      await clearAll();

      expect(await loadEntries()).toEqual([]);
      expect(await loadTags()).toEqual([]);
      expect(await loadOrder()).toEqual([]);
      expect(await loadSettings()).toBeNull();
    });
  });
});
