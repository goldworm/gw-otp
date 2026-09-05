import { useState } from 'react';
import { Button } from '@/popup/components/ui/button';
import { Input } from '@/popup/components/ui/input';
import { Label } from '@/popup/components/ui/label';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/popup/i18n/use-i18n';

interface UnlockPageProps {
  isInitialized: boolean;
  onUnlock: (password: string) => Promise<{ success: boolean; error?: string }>;
}

export function UnlockPage({ isInitialized, onUnlock }: UnlockPageProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSetup = !isInitialized;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (isSetup && password !== confirmPassword) {
      setError(t('unlock.mismatch'));
      return;
    }

    if (password.length < 4) {
      setError(t('unlock.tooShort'));
      return;
    }

    setLoading(true);
    try {
      const result = await onUnlock(password);
      if (!result.success) {
        setError(result.error ?? t('unlock.unlockFailed'));
      }
    } catch {
      setError(t('unlock.genericError'));
    } finally {
      setLoading(false);
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
          {isSetup ? t('unlock.setupSubtitle') : t('unlock.unlockSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-[280px] space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">
            {isSetup ? t('unlock.newPassword') : t('unlock.password')}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('unlock.passwordPlaceholder')}
              autoFocus
              disabled={loading}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              aria-label={
                showPassword ? t('unlock.hidePassword') : t('unlock.showPassword')
              }
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
            <Label htmlFor="confirm-password">
              {t('unlock.confirmPassword')}
            </Label>
            <Input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('unlock.confirmPasswordPlaceholder')}
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
            ? t('common.processing')
            : isSetup
              ? t('unlock.setupButton')
              : t('unlock.unlockButton')}
        </Button>
      </form>

      {isSetup && (
        <p className="mt-4 max-w-[280px] text-center text-xs text-muted-foreground">
          {t('unlock.setupHint')}
        </p>
      )}
    </div>
  );
}
