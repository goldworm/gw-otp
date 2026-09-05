import { useState } from 'react';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { OTPCard } from './otp-card';
import { cn } from '@/popup/lib/utils';
import { useI18n } from '@/popup/i18n/use-i18n';
import type { Algorithm, Digits } from '@/types';

export interface OTPListItem {
  id: string;
  issuer: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: Digits;
  period: number;
}

interface OTPListProps {
  items: OTPListItem[];
  hideCode: boolean;
  onReorder: (newOrder: string[]) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function OTPList({
  items,
  hideCode,
  onReorder,
  onEdit,
  onDelete,
}: OTPListProps) {
  const { t } = useI18n();
  // 드래그 중인 항목의 인덱스
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // 드롭 대상(드래그가 위에 있는) 인덱스
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
    // Firefox는 dataTransfer에 데이터가 있어야 드래그가 시작됨
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault(); // drop을 허용하기 위해 필수
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
          {/* 순서 변경 컨트롤: 화살표 + 드래그 핸들 */}
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

            {/* 드래그 핸들 (HTML5 draggable) */}
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
      ))}
    </div>
  );
}
