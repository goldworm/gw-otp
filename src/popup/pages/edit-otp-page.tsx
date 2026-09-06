import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/popup/components/ui/button';
import { Input } from '@/popup/components/ui/input';
import { Label } from '@/popup/components/ui/label';
import { getEntry, updateEntry, loadTags } from '@/core/storage';
import { encrypt, decrypt } from '@/core/crypto';
import { normalizeSecret } from '@/core/otp';
import { useI18n } from '@/popup/i18n/use-i18n';
import type { Algorithm, Digits, OTPType, Tag } from '@/types';

/** Mask everything except the first character. */
function maskSecret(secret: string): string {
  if (secret.length <= 1) return secret;
  return secret[0] + '•'.repeat(secret.length - 1);
}

interface EditOTPPageProps {
  entryId: string;
  sessionKey: CryptoKey;
  onBack: () => void;
  onSaved: () => void;
}

export function EditOTPPage({
  entryId,
  sessionKey,
  onBack,
  onSaved,
}: EditOTPPageProps) {
  const { t } = useI18n();
  const [otpType, setOtpType] = useState<OTPType>('totp');
  const [issuer, setIssuer] = useState('');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState<Algorithm>('SHA1');
  const [digits, setDigits] = useState<Digits>(6);
  const [period, setPeriod] = useState(30);
  const [counter, setCounter] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const [entry, allTags] = await Promise.all([
        getEntry(entryId),
        loadTags(),
      ]);
      setTags(allTags);

      if (!entry) {
        setError(t('edit.notFound'));
        setLoading(false);
        return;
      }

      setOtpType(entry.type ?? 'totp');
      setIssuer(entry.issuer);
      setLabel(entry.label);
      setAlgorithm(entry.algorithm);
      setDigits(entry.digits);
      setPeriod(entry.period);
      setCounter(entry.counter ?? 0);
      setSelectedTags(entry.tags);

      try {
        const decrypted = await decrypt(entry.encryptedSecret, sessionKey);
        setSecret(decrypted);
      } catch {
        setError(t('edit.decryptFailed'));
      }

      setLoading(false);
    }
    load();
  }, [entryId, sessionKey, t]);

  function toggleTag(tagId: string) {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!issuer.trim()) {
      setError(t('edit.errIssuer'));
      return;
    }
    if (!secret.trim()) {
      setError(t('edit.errSecret'));
      return;
    }

    setSaving(true);
    try {
      const encryptedSecret = await encrypt(
        normalizeSecret(secret),
        sessionKey,
      );
      await updateEntry(entryId, {
        type: otpType,
        issuer: issuer.trim(),
        label: label.trim(),
        encryptedSecret,
        algorithm,
        digits,
        period,
        counter: otpType === 'hotp' ? counter : undefined,
        tags: selectedTags,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('edit.errSave'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[500px] w-[380px] bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">{t('edit.title')}</h1>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="edit-issuer">{t('edit.issuerLabel')}</Label>
          <Input
            id="edit-issuer"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder={t('edit.issuerPlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-label">{t('edit.accountLabel')}</Label>
          <Input
            id="edit-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('edit.accountPlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-secret">{t('edit.secretLabel')}</Label>
          <div className="relative">
            <Input
              id="edit-secret"
              value={showSecret ? secret : maskSecret(secret)}
              onChange={(e) => setSecret(e.target.value)}
              readOnly={!showSecret}
              placeholder="JBSWY3DPEHPK3PXP"
              className="pr-9 font-mono text-xs"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowSecret((prev) => !prev)}
              tabIndex={-1}
              aria-label={
                showSecret ? t('edit.hideSecret') : t('edit.showSecret')
              }
            >
              {showSecret ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {!showSecret && (
            <p className="text-xs text-muted-foreground">
              {t('edit.secretHint')}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-type">{t('edit.typeLabel')}</Label>
          <select
            id="edit-type"
            value={otpType}
            onChange={(e) => setOtpType(e.target.value as OTPType)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          >
            <option value="totp">{t('edit.typeTotp')}</option>
            <option value="hotp">{t('edit.typeHotp')}</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="edit-algorithm">{t('edit.algorithmLabel')}</Label>
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
            <Label htmlFor="edit-digits">{t('edit.digitsLabel')}</Label>
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

          {otpType === 'totp' ? (
            <div className="space-y-2">
              <Label htmlFor="edit-period">{t('edit.periodLabel')}</Label>
              <Input
                id="edit-period"
                type="number"
                min={10}
                max={120}
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="edit-counter">{t('edit.counterLabel')}</Label>
              <Input
                id="edit-counter"
                type="number"
                min={0}
                value={counter}
                onChange={(e) => setCounter(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Tag selection */}
        {tags.length > 0 && (
          <div className="space-y-2">
            <Label>{t('edit.tagsLabel')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedTags.includes(tag.id)
                      ? 'text-white'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                  style={
                    selectedTags.includes(tag.id)
                      ? { backgroundColor: tag.color }
                      : undefined
                  }
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={saving}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </div>
  );
}
