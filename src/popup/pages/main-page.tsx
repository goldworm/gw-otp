import { useState, useEffect, useCallback, useMemo } from 'react'
import { Lock, Settings, Plus } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { OTPList } from '@/popup/components/otp-list'
import { SearchBar } from '@/popup/components/search-bar'
import { TagFilter } from '@/popup/components/tag-filter'
import { loadEntries, loadOrder, loadSettings, loadTags, deleteEntry, reorder } from '@/core/storage'
import { decrypt } from '@/core/crypto'
import type { OTPEntry, Tag, Settings as AppSettings } from '@/types'

interface MainPageProps {
  sessionKey: CryptoKey
  onLock: () => void
  onNavigate: (page: 'add' | 'edit' | 'settings') => void
  onEditEntry: (id: string) => void
}

/** 복호화된 OTP 항목 (표시용) */
interface DecryptedEntry extends Omit<OTPEntry, 'encryptedSecret'> {
  secret: string
}

export function MainPage({ sessionKey, onLock, onNavigate, onEditEntry }: MainPageProps) {
  const [entries, setEntries] = useState<DecryptedEntry[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [rawEntries, order, tags, settings] = await Promise.all([
        loadEntries(),
        loadOrder(),
        loadTags(),
        loadSettings(),
      ])

      // 순서대로 정렬
      const sorted = sortByOrder(rawEntries, order)

      // secret 복호화
      const decrypted: DecryptedEntry[] = await Promise.all(
        sorted.map(async (entry) => {
          let secret = ''
          try {
            secret = await decrypt(entry.encryptedSecret, sessionKey)
          } catch {
            secret = ''
          }
          return {
            ...entry,
            secret,
          }
        })
      )

      setEntries(decrypted)
      setTags(tags)
      setSettings(settings)
    } catch {
      setLoadError('데이터를 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [sessionKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 필터링된 항목
  const filteredEntries = useMemo(() => {
    let result = entries

    // 태그 필터
    if (selectedTagId) {
      result = result.filter((e) => e.tags.includes(selectedTagId))
    }

    // 검색 필터
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      result = result.filter(
        (e) =>
          e.issuer.toLowerCase().includes(query) ||
          e.label.toLowerCase().includes(query)
      )
    }

    return result
  }, [entries, selectedTagId, searchQuery])

  // 순서 변경 핸들러
  async function handleReorder(newOrder: string[]) {
    // 필터링 중이면 전체 순서에서 해당 항목만 재배치
    if (selectedTagId || searchQuery.trim()) {
      // 필터링 상태에서는 재정렬 미지원 (전체 보기에서만)
      return
    }

    // UI를 먼저 업데이트 (optimistic)
    const reordered = newOrder
      .map((id) => entries.find((e) => e.id === id))
      .filter((e): e is DecryptedEntry => e !== undefined)
    setEntries(reordered)

    // Storage에 저장
    await reorder(newOrder)
  }

  // 삭제 핸들러
  async function handleDelete(id: string) {
    const confirmed = window.confirm('이 OTP 항목을 삭제하시겠습니까?')
    if (!confirmed) return

    await deleteEntry(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const hideCode = settings?.hideCodesUntilHover ?? false
  const isFiltering = !!selectedTagId || !!searchQuery.trim()

  if (loading) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-[500px] w-[380px] flex-col items-center justify-center gap-3 bg-background p-4">
        <p className="text-sm text-destructive" role="alert">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => { setLoadError(''); setLoading(true); loadData() }}>
          다시 시도
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[500px] w-[380px] flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">GW-OTP</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate('add')}
            aria-label="OTP 추가"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate('settings')}
            aria-label="설정"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLock}
            aria-label="잠금"
          >
            <Lock className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Search & Filter */}
      {entries.length > 0 && (
        <div className="space-y-2 border-b px-3 py-2">
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
            <p className="text-sm text-muted-foreground">
              등록된 OTP가 없습니다.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => onNavigate('add')}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              OTP 추가
            </Button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </p>
          </div>
        ) : (
          <OTPList
            items={filteredEntries}
            hideCode={hideCode}
            onReorder={isFiltering ? () => {} : handleReorder}
            onEdit={onEditEntry}
            onDelete={handleDelete}
          />
        )}
      </main>
    </div>
  )
}

/** order 배열 순서대로 entries를 정렬한다 */
function sortByOrder(entries: OTPEntry[], order: string[]): OTPEntry[] {
  const orderMap = new Map(order.map((id, idx) => [id, idx]))
  return [...entries].sort((a, b) => {
    const idxA = orderMap.get(a.id) ?? Infinity
    const idxB = orderMap.get(b.id) ?? Infinity
    return idxA - idxB
  })
}
