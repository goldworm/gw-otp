import { cn } from '@/popup/lib/utils'
import type { Tag } from '@/types'

interface TagFilterProps {
  tags: Tag[]
  selectedTagId: string | null
  onSelect: (tagId: string | null) => void
  className?: string
}

export function TagFilter({
  tags,
  selectedTagId,
  onSelect,
  className,
}: TagFilterProps) {
  if (tags.length === 0) return null

  return (
    <div className={cn('flex items-center gap-1.5 overflow-x-auto', className)}>
      {/* 전체 보기 버튼 */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
          selectedTagId === null
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
        )}
      >
        전체
      </button>

      {/* 태그 버튼들 */}
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onSelect(selectedTagId === tag.id ? null : tag.id)}
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            selectedTagId === tag.id
              ? 'text-white'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          )}
          style={
            selectedTagId === tag.id
              ? { backgroundColor: tag.color }
              : undefined
          }
        >
          <span
            className="mr-1 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          {tag.name}
        </button>
      ))}
    </div>
  )
}
