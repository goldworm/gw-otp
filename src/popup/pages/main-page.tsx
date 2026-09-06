import { useState, useEffect, useCallback, useMemo } from 'react';
import { Lock, Settings, Plus } from 'lucide-react';
import { Button } from '@/popup/components/ui/button';
import { OTPList } from '@/popup/components/otp-list';
import { SearchBar } from '@/popup/components/search-bar';
import { TagFilter } from '@/popup/components/tag-filter';
import {
  loadEntries,
  loadOrder,
  loadSettings,
  loadTags,
  deleteEntry,
  reorder,
  togglePin,
  incrementCounter,
} from '@/core/storage';
import { decrypt } from '@/core/crypto';
import { useI18n } from '@/popup/i18n/use-i18n';
import type { OTPEntry, Tag, Settings as AppSettings } from '@/types';

interface MainPageProps {
  sessionKey: CryptoKey;
  onLock: () => void;
  onNavigate: (page: 'add' | 'edit' | 'settings') => void;
  onEditEntry: (id: string) => void;
}

/** Decrypted OTP entry (for display) */
interface DecryptedEntry extends Omit<OTPEntry, 'encryptedSecret'> {
  secret: string;
}

export function MainPage({
  sessionKey,
  onLock,
  onNavigate,
  onEditEntry,
}: MainPageProps) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<DecryptedEntry[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [rawEntries, order, tags, settings] = await Promise.all([
        loadEntries(),
        loadOrder(),
        loadTags(),
        loadSettings(),
      ]);

      // Sort by order
      const sorted = sortByOrder(rawEntries, order);

      // Decrypt secrets
      const decrypted: DecryptedEntry[] = await Promise.all(
        sorted.map(async (entry) => {
          let secret = '';
          try {
            secret = await decrypt(entry.encryptedSecret, sessionKey);
          } catch {
            secret = '';
          }
          return {
            ...entry,
            secret,
          };
        }),
      );

      setEntries(decrypted);
      setTags(tags);
      setSettings(settings);
    } catch {
      setLoadError(t('main.loadError'));
    } finally {
      setLoading(false);
    }
  }, [sessionKey, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Tag filter
    if (selectedTagId) {
      result = result.filter((e) => e.tags.includes(selectedTagId));
    }

    // Search filter (match issuer, label, tag name)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const tagNameById = new Map(
        tags.map((tag) => [tag.id, tag.name.toLowerCase()]),
      );
      result = result.filter((e) => {
        if (e.issuer.toLowerCase().includes(query)) return true;
        if (e.label.toLowerCase().includes(query)) return true;
        // Match names of tags assigned to the entry
        return e.tags.some((tagId) =>
          tagNameById.get(tagId)?.includes(query),
        );
      });
    }

    // Always place pinned items at the top (other ordering follows entries order)
    return [...result].sort((a, b) => {
      const pinnedA = a.pinned ? 0 : 1;
      const pinnedB = b.pinned ? 0 : 1;
      return pinnedA - pinnedB;
    });
  }, [entries, selectedTagId, searchQuery, tags]);

  // Reorder handler
  async function handleReorder(newOrder: string[]) {
    // While filtering, reorder only affects the matched items
    if (selectedTagId || searchQuery.trim()) {
      // Reordering is not supported while filtering (only in the full view)
      return;
    }

    // Update the UI first (optimistic)
    const reordered = newOrder
      .map((id) => entries.find((e) => e.id === id))
      .filter((e): e is DecryptedEntry => e !== undefined);
    setEntries(reordered);

    // Persist to storage
    await reorder(newOrder);
  }

  // Delete handler
  async function handleDelete(id: string) {
    const confirmed = window.confirm(t('main.deleteConfirm'));
    if (!confirmed) return;

    await deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // Pin toggle handler
  async function handleTogglePin(id: string) {
    const newPinned = await togglePin(id);
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, pinned: newPinned } : e)),
    );
  }

  // HOTP generate-next-code handler (increments the counter)
  async function handleGenerateNext(id: string) {
    const newCounter = await incrementCounter(id);
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, counter: newCounter } : e)),
    );
  }

  const hideCode = settings?.hideCodesUntilHover ?? false;
  const isFiltering = !!selectedTagId || !!searchQuery.trim();

  if (loading) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[500px] w-[380px] flex-col items-center justify-center gap-3 bg-background p-4">
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoadError('');
            setLoading(true);
            loadData();
          }}
        >
          {t('main.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[500px] w-[380px] flex-col bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">GW-OTP</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate('add')}
            aria-label={t('main.add')}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate('settings')}
            aria-label={t('main.settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLock}
            aria-label={t('main.lock')}
          >
            <Lock className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Search & Filter */}
      {entries.length > 0 && (
        <div className="shrink-0 space-y-2 border-b px-3 py-2">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <TagFilter
            tags={tags}
            selectedTagId={selectedTagId}
            onSelect={setSelectedTagId}
          />
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{t('main.empty')}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => onNavigate('add')}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('main.addOtp')}
            </Button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t('main.noResults')}
            </p>
          </div>
        ) : (
          <OTPList
            items={filteredEntries}
            hideCode={hideCode}
            onReorder={isFiltering ? () => {} : handleReorder}
            onEdit={onEditEntry}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onGenerateNext={handleGenerateNext}
          />
        )}
      </main>
    </div>
  );
}

/**
 * Sort entries.
 * Primary: pinned items first
 * Secondary: order-array order
 */
function sortByOrder(entries: OTPEntry[], order: string[]): OTPEntry[] {
  const orderMap = new Map(order.map((id, idx) => [id, idx]));
  return [...entries].sort((a, b) => {
    // Pinned first
    const pinnedA = a.pinned ? 0 : 1;
    const pinnedB = b.pinned ? 0 : 1;
    if (pinnedA !== pinnedB) return pinnedA - pinnedB;

    // Order-array order
    const idxA = orderMap.get(a.id) ?? Infinity;
    const idxB = orderMap.get(b.id) ?? Infinity;
    return idxA - idxB;
  });
}
