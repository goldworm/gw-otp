import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Upload, Camera } from 'lucide-react';
import { Button } from '@/popup/components/ui/button';
import { Input } from '@/popup/components/ui/input';
import { Label } from '@/popup/components/ui/label';
import { addEntry, loadTags } from '@/core/storage';
import { encrypt } from '@/core/crypto';
import { parseOTPAuthURI, normalizeSecret } from '@/core/otp';
import { decodeQRFromFile, decodeQRFromDataURL } from '@/core/qr';
import { isMigrationURI, parseMigrationURI } from '@/core/migration';
import { useI18n } from '@/popup/i18n/use-i18n';
import type {
  Algorithm,
  Digits,
  OTPEntry,
  OTPType,
  ParsedOTPAuthURI,
  Tag,
} from '@/types';

interface AddOTPPageProps {
  sessionKey: CryptoKey;
  onBack: () => void;
  onAdded: () => void;
}

type TabMode = 'manual' | 'uri' | 'qr' | 'capture';

export function AddOTPPage({ sessionKey, onBack, onAdded }: AddOTPPageProps) {
  const { t } = useI18n();
  const [tabMode, setTabMode] = useState<TabMode>('manual');
  const [otpType, setOtpType] = useState<OTPType>('totp');
  const [issuer, setIssuer] = useState('');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState<Algorithm>('SHA1');
  const [digits, setDigits] = useState<Digits>(6);
  const [period, setPeriod] = useState(30);
  const [counter, setCounter] = useState(0);
  const [uriInput, setUriInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [migrationItems, setMigrationItems] = useState<ParsedOTPAuthURI[]>([]);
  const [migrationImporting, setMigrationImporting] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTags().then(setTags);
  }, []);

  // Handle QR image file
  async function handleQRFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    setMigrationItems([]);
    setMigrationMessage('');
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await decodeQRFromFile(file);
      handleQRData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.errQrDecode'));
    }

    // Reset the input (so the same file can be selected again)
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Handle screen capture
  async function handleCapture() {
    setError('');
    setMigrationItems([]);
    setMigrationMessage('');
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        setError(t('add.errNoTab'));
        return;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
      });

      const data = await decodeQRFromDataURL(dataUrl);
      handleQRData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.errCapture'));
    }
  }

  // Handle data decoded from a QR/capture (otpauth:// or otpauth-migration://)
  function handleQRData(data: string) {
    if (isMigrationURI(data)) {
      const items = parseMigrationURI(data);
      if (items.length === 0) {
        setError(t('add.errNoMigration'));
        return;
      }
      setMigrationItems(items);
      setTabMode('qr'); // Show the migration list on the QR tab
    } else {
      const parsed = parseOTPAuthURI(data);
      setOtpType(parsed.type);
      setIssuer(parsed.issuer);
      setLabel(parsed.label);
      setSecret(parsed.secret);
      setAlgorithm(parsed.algorithm);
      setDigits(parsed.digits);
      setPeriod(parsed.period);
      setCounter(parsed.counter ?? 0);
      setTabMode('manual');
    }
  }

  // Parse URI
  function handleParseURI() {
    setError('');
    setMigrationItems([]);
    setMigrationMessage('');

    const input = uriInput.trim();

    try {
      if (isMigrationURI(input)) {
        // Google Authenticator migration URI
        const items = parseMigrationURI(input);
        if (items.length === 0) {
          setError(t('add.errNoMigration'));
          return;
        }
        setMigrationItems(items);
      } else {
        // Regular otpauth:// URI
        const parsed = parseOTPAuthURI(input);
        setOtpType(parsed.type);
        setIssuer(parsed.issuer);
        setLabel(parsed.label);
        setSecret(parsed.secret);
        setAlgorithm(parsed.algorithm);
        setDigits(parsed.digits);
        setPeriod(parsed.period);
        setCounter(parsed.counter ?? 0);
        setTabMode('manual');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.errUriParse'));
    }
  }

  // Bulk import from migration
  async function handleImportMigration() {
    setError('');
    setMigrationImporting(true);

    try {
      let imported = 0;
      for (const item of migrationItems) {
        const encryptedSecret = await encrypt(
          normalizeSecret(item.secret),
          sessionKey,
        );
        const now = new Date().toISOString();
        const entry: OTPEntry = {
          id: crypto.randomUUID(),
          type: item.type,
          issuer: item.issuer,
          label: item.label,
          encryptedSecret,
          tags: selectedTags,
          algorithm: item.algorithm,
          digits: item.digits,
          period: item.period,
          counter: item.type === 'hotp' ? (item.counter ?? 0) : undefined,
          createdAt: now,
          updatedAt: now,
        };
        await addEntry(entry);
        imported++;
      }
      setMigrationMessage(t('add.imported', { count: imported }));
      setMigrationItems([]);
      setUriInput('');
      // Go back to main after a short delay
      setTimeout(() => onAdded(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.errImport'));
    } finally {
      setMigrationImporting(false);
    }
  }

  // Save
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!issuer.trim()) {
      setError(t('add.errIssuer'));
      return;
    }
    if (!secret.trim()) {
      setError(t('add.errSecret'));
      return;
    }

    setSaving(true);
    try {
      const encryptedSecret = await encrypt(
        normalizeSecret(secret),
        sessionKey,
      );
      const now = new Date().toISOString();

      const entry: OTPEntry = {
        id: crypto.randomUUID(),
        type: otpType,
        issuer: issuer.trim(),
        label: label.trim(),
        encryptedSecret,
        tags: selectedTags,
        algorithm,
        digits,
        period,
        counter: otpType === 'hotp' ? counter : undefined,
        createdAt: now,
        updatedAt: now,
      };

      await addEntry(entry);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.errSave'));
    } finally {
      setSaving(false);
    }
  }

  // Toggle tag
  function toggleTag(tagId: string) {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
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
        <h1 className="text-base font-semibold">{t('add.title')}</h1>
      </header>

      {/* Tab Selector */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setTabMode('manual')}
          className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
            tabMode === 'manual'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('add.tabManual')}
        </button>
        <button
          type="button"
          onClick={() => setTabMode('uri')}
          className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
            tabMode === 'uri'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('add.tabUri')}
        </button>
        <button
          type="button"
          onClick={() => setTabMode('qr')}
          className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
            tabMode === 'qr'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('add.tabQr')}
        </button>
        <button
          type="button"
          onClick={() => setTabMode('capture')}
          className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
            tabMode === 'capture'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('add.tabCapture')}
        </button>
      </div>

      <div className="p-4">
        {/* URI input tab */}
        {tabMode === 'uri' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="uri-input">{t('add.uriLabel')}</Label>
              <textarea
                id="uri-input"
                value={uriInput}
                onChange={(e) => setUriInput(e.target.value)}
                placeholder={
                  'otpauth://totp/Issuer:user@example.com?secret=...\nor\notpauth-migration://offline?data=...'
                }
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <Button
              type="button"
              onClick={handleParseURI}
              className="w-full"
              disabled={!uriInput.trim()}
            >
              {t('add.parseUri')}
            </Button>

            {/* Migration item list */}
            {migrationItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('add.itemsFound', { count: migrationItems.length })}
                </p>
                <div className="max-h-[200px] space-y-1 overflow-y-auto rounded border p-2">
                  {migrationItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="font-medium">
                        {item.issuer || t('common.none')}
                      </span>
                      <span className="text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  onClick={handleImportMigration}
                  className="w-full"
                  disabled={migrationImporting}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {migrationImporting
                    ? t('add.importing')
                    : t('add.importAll', { count: migrationItems.length })}
                </Button>
              </div>
            )}

            {migrationMessage && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {migrationMessage}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {/* QR image upload tab */}
        {tabMode === 'qr' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('add.qrUploadLabel')}</Label>
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input px-4 py-8 transition-colors hover:border-primary hover:bg-accent/50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('add.qrClickToSelect')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('add.qrFormats')}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleQRFile}
                className="hidden"
              />
            </div>

            {/* Migration item list (when a migration URI is detected in the QR) */}
            {migrationItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('add.itemsFound', { count: migrationItems.length })}
                </p>
                <div className="max-h-[200px] space-y-1 overflow-y-auto rounded border p-2">
                  {migrationItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="font-medium">
                        {item.issuer || t('common.none')}
                      </span>
                      <span className="text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  onClick={handleImportMigration}
                  className="w-full"
                  disabled={migrationImporting}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {migrationImporting
                    ? t('add.importing')
                    : t('add.importAll', { count: migrationItems.length })}
                </Button>
              </div>
            )}

            {migrationMessage && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {migrationMessage}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {/* Screen capture tab */}
        {tabMode === 'capture' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('add.captureLabel')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('add.captureHint')}
              </p>
            </div>
            <Button type="button" onClick={handleCapture} className="w-full">
              <Camera className="mr-1 h-4 w-4" />
              {t('add.captureButton')}
            </Button>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {/* Manual input form */}
        {tabMode === 'manual' && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="add-issuer">{t('add.issuerLabel')}</Label>
              <Input
                id="add-issuer"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder={t('add.issuerPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-label">{t('add.accountLabel')}</Label>
              <Input
                id="add-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('add.accountPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-secret">{t('add.secretLabel')}</Label>
              <Input
                id="add-secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-type">{t('add.typeLabel')}</Label>
              <select
                id="add-type"
                value={otpType}
                onChange={(e) => setOtpType(e.target.value as OTPType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              >
                <option value="totp">{t('add.typeTotp')}</option>
                <option value="hotp">{t('add.typeHotp')}</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="add-algorithm">{t('add.algorithmLabel')}</Label>
                <select
                  id="add-algorithm"
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
                <Label htmlFor="add-digits">{t('add.digitsLabel')}</Label>
                <select
                  id="add-digits"
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
                  <Label htmlFor="add-period">{t('add.periodLabel')}</Label>
                  <Input
                    id="add-period"
                    type="number"
                    min={10}
                    max={120}
                    value={period}
                    onChange={(e) => setPeriod(Number(e.target.value))}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="add-counter">{t('add.counterLabel')}</Label>
                  <Input
                    id="add-counter"
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
                <Label>{t('add.tagsLabel')}</Label>
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
              <Plus className="mr-1 h-4 w-4" />
              {saving ? t('common.saving') : t('add.addButton')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
