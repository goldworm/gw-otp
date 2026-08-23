import { useState, useEffect } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/popup/components/ui/button'
import { Input } from '@/popup/components/ui/input'
import { Label } from '@/popup/components/ui/label'
import { getEntry, updateEntry } from '@/core/storage'
import { encrypt, decrypt } from '@/core/crypto'
import { normalizeSecret } from '@/core/otp'
import type { Algorithm, Digits } from '@/types'

interface EditOTPPageProps {
  entryId: string
  sessionKey: CryptoKey
  onBack: () => void
  onSaved: () => void
}

export function EditOTPPage({
  entryId,
  sessionKey,
  onBack,
  onSaved,
}: EditOTPPageProps) {
  const [issuer, setIssuer] = useState('')
  const [label, setLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [algorithm, setAlgorithm] = useState<Algorithm>('SHA1')
  const [digits, setDigits] = useState<Digits>(6)
  const [period, setPeriod] = useState(30)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const entry = await getEntry(entryId)
      if (!entry) {
        setError('항목을 찾을 수 없습니다.')
        setLoading(false)
        return
      }

      setIssuer(entry.issuer)
      setLabel(entry.label)
      setAlgorithm(entry.algorithm)
      setDigits(entry.digits)
      setPeriod(entry.period)

      try {
        const decrypted = await decrypt(entry.encryptedSecret, sessionKey)
        setSecret(decrypted)
      } catch {
        setError('Secret 복호화에 실패했습니다.')
      }

      setLoading(false)
    }
    load()
  }, [entryId, sessionKey])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!issuer.trim()) {
      setError('서비스명(Issuer)을 입력하세요.')
      return
    }
    if (!label.trim()) {
      setError('계정(Label)을 입력하세요.')
      return
    }
    if (!secret.trim()) {
      setError('Secret을 입력하세요.')
      return
    }

    setSaving(true)
    try {
      const encryptedSecret = await encrypt(normalizeSecret(secret), sessionKey)
      await updateEntry(entryId, {
        issuer: issuer.trim(),
        label: label.trim(),
        encryptedSecret,
        algorithm,
        digits,
        period,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="min-h-[500px] w-[380px] bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="뒤로">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">OTP 편집</h1>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="edit-issuer">서비스명 (Issuer)</Label>
          <Input
            id="edit-issuer"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="Google, GitHub, ..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-label">계정 (Label)</Label>
          <Input
            id="edit-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-secret">Secret (Base32)</Label>
          <Input
            id="edit-secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="JBSWY3DPEHPK3PXP"
            className="font-mono text-xs"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="edit-algorithm">알고리즘</Label>
            <select
              id="edit-algorithm"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            >
              <option value="SHA1">SHA1</option>
              <option value="SHA256">SHA256</option>
              <option value="SHA512">SHA512</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-digits">자릿수</Label>
            <select
              id="edit-digits"
              value={digits}
              onChange={(e) => setDigits(Number(e.target.value) as Digits)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            >
              <option value={6}>6</option>
              <option value={8}>8</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-period">주기 (초)</Label>
            <Input
              id="edit-period"
              type="number"
              min={10}
              max={120}
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={saving}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? '저장 중...' : '저장'}
        </Button>
      </form>
    </div>
  )
}
