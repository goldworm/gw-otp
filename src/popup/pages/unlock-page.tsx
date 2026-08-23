import { useState } from 'react'
import { Button } from '@/popup/components/ui/button'
import { Input } from '@/popup/components/ui/input'
import { Label } from '@/popup/components/ui/label'
import { Lock, Eye, EyeOff } from 'lucide-react'

interface UnlockPageProps {
  isInitialized: boolean
  onUnlock: (password: string) => Promise<{ success: boolean; error?: string }>
}

export function UnlockPage({ isInitialized, onUnlock }: UnlockPageProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isSetup = !isInitialized

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (isSetup && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    if (password.length < 4) {
      setError('비밀번호는 최소 4자 이상이어야 합니다.')
      return
    }

    setLoading(true)
    try {
      const result = await onUnlock(password)
      if (!result.success) {
        setError(result.error ?? '잠금 해제에 실패했습니다.')
      }
    } catch {
      setError('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[500px] w-[380px] flex-col items-center justify-center bg-background p-6">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">GW-OTP</h1>
        <p className="text-sm text-muted-foreground">
          {isSetup
            ? '마스터 비밀번호를 설정하세요'
            : '비밀번호를 입력하세요'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-[280px] space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">
            {isSetup ? '새 비밀번호' : '비밀번호'}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              autoFocus
              disabled={loading}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {isSetup && (
          <div className="space-y-2">
            <Label htmlFor="confirm-password">비밀번호 확인</Label>
            <Input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 다시 입력"
              disabled={loading}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? '처리 중...'
            : isSetup
              ? '비밀번호 설정'
              : '잠금 해제'}
        </Button>
      </form>

      {isSetup && (
        <p className="mt-4 max-w-[280px] text-center text-xs text-muted-foreground">
          이 비밀번호는 OTP 데이터를 암호화하는 데 사용됩니다.
          분실 시 복구할 수 없으니 안전하게 보관하세요.
        </p>
      )}
    </div>
  )
}
