import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { OTPCard } from './otp-card'
import type { Algorithm, Digits } from '@/types'

export interface OTPListItem {
  id: string
  issuer: string
  label: string
  secret: string
  algorithm: Algorithm
  digits: Digits
  period: number
}

interface OTPListProps {
  items: OTPListItem[]
  hideCode: boolean
  onReorder: (newOrder: string[]) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function OTPList({
  items,
  hideCode,
  onReorder,
  onEdit,
  onDelete,
}: OTPListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(items, oldIndex, newIndex)
    onReorder(reordered.map((item) => item.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {items.map((item) => (
            <SortableOTPCard
              key={item.id}
              item={item}
              hideCode={hideCode}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

interface SortableOTPCardProps {
  item: OTPListItem
  hideCode: boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

function SortableOTPCard({
  item,
  hideCode,
  onEdit,
  onDelete,
}: SortableOTPCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative flex items-center gap-1">
      {/* 드래그 핸들 */}
      <button
        type="button"
        className="flex-shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground active:cursor-grabbing"
        aria-label="순서 변경"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* OTP 카드 */}
      <div className="min-w-0 flex-1">
        <OTPCard
          id={item.id}
          issuer={item.issuer}
          label={item.label}
          secret={item.secret}
          algorithm={item.algorithm}
          digits={item.digits}
          period={item.period}
          hideCode={hideCode}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}
