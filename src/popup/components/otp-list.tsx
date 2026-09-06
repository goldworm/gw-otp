import { useState } from 'react';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { OTPCard } from './otp-card';
import { cn } from '@/popup/lib/utils';
import { useI18n } from '@/popup/i18n/use-i18n';
import type { Algorithm, Digits, OTPType } from '@/types';

export interface OTPListItem {
  id: string;
  type?: OTPType;
  issuer: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: Digits;
  period: number;
  counter?: number;
  pinned?: boolean;
}

interface OTPListProps {
  items: OTPListItem[];
  hideCode: boolean;
  onReorder: (newOrder: string[]) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onGenerateNext: (id: string) => void;
}

export function OTPList({
  items,
  hideCode,
  onReorder,
  onEdit,
  onDelete,
  onTogglePin,
  onGenerateNext,
}: OTPListProps) {
  const { t } = useI18n();
  // Index of the item being dragged
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Index of the drop target (the item the drag is hovering over)
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function moveUp(index: number) {
    if (index <= 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [
      newItems[index],
      newItems[index - 1],
    ];
    onReorder(newItems.map((item) => item.id));
  }

  function moveDown(index: number) {
    if (index >= items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [
      newItems[index + 1],
      newItems[index],
    ];
    onReorder(newItems.map((item) => item.id));
  }

  // ─── HTML5 Drag & Drop ─────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data in dataTransfer for the drag to start
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault(); // Required to allow dropping
    e.dataTransfer.dropEffect = 'move';
    if (index !== overIndex) {
      setOverIndex(index);
    }
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      resetDragState();
      return;
    }

    const newItems = [...items];
    const [moved] = newItems.splice(dragIndex, 1);
    newItems.splice(index, 0, moved);
    onReorder(newItems.map((item) => item.id));
    resetDragState();
  }

  function resetDragState() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            'relative flex items-center gap-1 rounded-lg transition-colors',
            dragIndex === index && 'opacity-50',
            overIndex === index && dragIndex !== index && 'ring-2 ring-primary'
          )}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
        >
          {/* Reorder controls: arrows + drag handle */}
          <div className="flex flex-shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={() => moveUp(index)}
              disabled={index === 0}
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label={t('otpCard.moveUp')}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>

            {/* Drag handle (HTML5 draggable) */}
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={resetDragState}
              className="cursor-grab p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label={t('otpCard.dragHandle')}
              title={t('otpCard.dragHandle')}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>

            <button
              type="button"
              onClick={() => moveDown(index)}
              disabled={index === items.length - 1}
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label={t('otpCard.moveDown')}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* OTP card */}
          <div className="min-w-0 flex-1">
            <OTPCard
              id={item.id}
              type={item.type}
              issuer={item.issuer}
              label={item.label}
              secret={item.secret}
              algorithm={item.algorithm}
              digits={item.digits}
              period={item.period}
              counter={item.counter}
              pinned={item.pinned}
              hideCode={hideCode}
              onEdit={onEdit}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
              onGenerateNext={onGenerateNext}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
