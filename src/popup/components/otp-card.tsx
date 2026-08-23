import { useState, useEffect, useCallback } from 'react'
import { Copy, Check, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/popup/lib/utils'
import { CountdownBar } from './countdown-bar'
import { generateTOTP } from '@/core/otp'
import type { Algorithm, Digits } from '@/types'

interface OTPCardProps {
  id: string
  issuer: string
  label: string
  secret: string
  algorithm: Algorithm
  digits: Digits
  period: number
  hideCode: boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function OTPCard({
  id,
  issuer,
  label,
  secret,
  algorithm,
  digits,
  period,
  hideCode,
  onEdit,
  onDelete,
}: OTPCardProps) {
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)

  const refreshCode = useCallback(async () => {
    try {
      const token = await generateTOTP(secret, algorithm, digits, period)
      setCode(token)
    } catch {
      setCode('------')
    }
  }, [secret, algorithm, digits, period])

  // 초기 코드 생성 + 주기적 갱신
  useEffect(() => {
    refreshCode()
    const interval = setInterval(() => {
      refreshCode()
    }, 1000)
    return () => clearInterval(interval)
  }, [refreshCode])

  // 클립보드 복사
  async function handleCopy() {
    if (!code || code === '------') return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 코드 포맷 (3자리씩 분리)
  function formatCode(raw: string): string {
    if (raw.length === 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`
    if (raw.length === 8) return `${raw.slice(0, 4)} ${raw.slice(4)}`
    return raw
  }

  const showCode = !hideCode || hovered
  const displayCode = showCode ? formatCode(code) : '••• •••'

  return (
    <div
      className="group relative flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/50"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Circular countdown */}
      <CountdownBar period={period} size={32} />

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Issuer + Label */}
        <p className="truncate text-sm font-medium text-foreground">
          {issuer}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {label}
        </p>

        {/* OTP Code */}
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'mt-0.5 inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-base font-bold tracking-wider transition-colors',
            'hover:bg-secondary',
            showCode ? 'text-foreground' : 'text-muted-foreground'
          )}
          aria-label={`OTP 코드 ${showCode ? code : '숨김'} 복사`}
          title="클릭하여 복사"
        >
          <span aria-live="off">{displayCode}</span>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {copied && (
          <span className="sr-only" aria-live="polite">
            코드가 복사되었습니다
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(id)}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="편집"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(id)}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
