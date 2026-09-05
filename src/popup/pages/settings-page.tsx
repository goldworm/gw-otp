import { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  ArrowLeft,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/popup/components/ui/button';
import { Input } from '@/popup/components/ui/input';
import { Label } from '@/popup/components/ui/label';
import {
  loadSettings,
  saveSettings,
  loadTags,
  addTag,
  deleteTag,
} from '@/core/storage';
import {
  createBackup,
  createDownloadURL,
  parseBackupFile,
  decryptBackup,
  importBackup,
} from '@/core/backup';
import { deriveKey, base64ToBuffer } from '@/core/crypto';
import { useI18n } from '@/popup/i18n/use-i18n';
import type { MessageResponse, Settings, Tag, Theme, Language } from '@/types';

interface SettingsPageProps {
  sessionKey: CryptoKey;
  onBack: () => void;
  onThemeChange: (theme: Theme) => void;
  onPasswordChanged: (newKey: CryptoKey) => void;
}

export function SettingsPage({
  sessionKey,
  onBack,
  onThemeChange,
  onPasswordChanged,
}: SettingsPageProps) {
  const { t, language, setLanguage } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 비밀번호 변경 전용 상태
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    Promise.all([loadSettings(), loadTags()]).then(([s, t]) => {
      setSettings(s);
      setTags(t);
      setLoading(false);
    });
  }, []);

  async function updateSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings(updated);

    if (key === 'theme') {
      onThemeChange(value as Theme);
    }
  }

  // 태그 추가
  async function handleAddTag() {
    const name = newTagName.trim();
    if (!name) return;
    // 즉시 입력값 초기화 (중복 호출 방지)
    setNewTagName('');
    const tag: Tag = {
      id: crypto.randomUUID(),
      name,
      color: newTagColor,
    };
    await addTag(tag);
    setTags((prev) => [...prev, tag]);
  }

  // 태그 삭제
  async function handleDeleteTag(tagId: string) {
    await deleteTag(tagId);
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  // 내보내기
  async function handleExport() {
    setError('');
    setMessage('');
    if (!exportPassword.trim()) {
      setError(t('settings.errExportPassword'));
      return;
    }

    setExporting(true);
    try {
      const backup = await createBackup(exportPassword, sessionKey);
      const { url, filename } = createDownloadURL(backup);

      // 다운로드 트리거
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage(t('settings.exportSuccess'));
      setExportPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errExport'));
    } finally {
      setExporting(false);
    }
  }

  // 가져오기
  async function handleImport() {
    setError('');
    setMessage('');
    if (!importFile) {
      setError(t('settings.errImportFile'));
      return;
    }
    if (!importPassword.trim()) {
      setError(t('settings.errImportPassword'));
      return;
    }

    setImporting(true);
    try {
      const content = await importFile.text();
      const backup = parseBackupFile(content);
      const data = await decryptBackup(backup, importPassword);
      const result = await importBackup(data, sessionKey, 'merge');

      setMessage(
        t('settings.importSuccess', {
          imported: result.imported,
          skipped: result.skipped,
        }),
      );
      setImportPassword('');
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errImport'));
    } finally {
      setImporting(false);
    }
  }

  // 비밀번호 변경
  async function handleChangePassword() {
    setPwError('');
    setPwMessage('');

    if (!currentPassword) {
      setPwError(t('settings.errCurrentPassword'));
      return;
    }
    if (!newPassword) {
      setPwError(t('settings.errNewPassword'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t('settings.errPasswordMismatch'));
      return;
    }
    if (newPassword.length < 4) {
      setPwError(t('settings.errPasswordShort'));
      return;
    }

    setChangingPassword(true);
    try {
      const response: MessageResponse = await chrome.runtime.sendMessage({
        type: 'changePassword',
        currentPassword,
        newPassword,
      });

      if (response.type === 'changePassword') {
        if (response.success) {
          // Background에서 새 salt로 settings를 갱신했으므로 그 salt로 키 재유도
          const settings = await loadSettings();
          if (settings) {
            const newKey = await deriveKey(
              newPassword,
              base64ToBuffer(settings.salt),
            );
            onPasswordChanged(newKey);
          }
          setPwMessage(t('settings.passwordChanged'));
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        } else {
          setPwError(response.error ?? t('settings.errChangePassword'));
        }
      }
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : t('settings.errChangePassword'),
      );
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[500px] w-[380px] flex-col bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">{t('settings.title')}</h1>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* 테마 설정 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t('settings.themeLabel')}</Label>
          <div className="grid grid-cols-3 gap-2">
            <ThemeButton
              icon={<Sun className="h-4 w-4" />}
              label={t('settings.themeLight')}
              active={settings.theme === 'light'}
              onClick={() => updateSetting('theme', 'light')}
            />
            <ThemeButton
              icon={<Moon className="h-4 w-4" />}
              label={t('settings.themeDark')}
              active={settings.theme === 'dark'}
              onClick={() => updateSetting('theme', 'dark')}
            />
            <ThemeButton
              icon={<Monitor className="h-4 w-4" />}
              label={t('settings.themeSystem')}
              active={settings.theme === 'system'}
              onClick={() => updateSetting('theme', 'system')}
            />
          </div>
        </div>

        {/* 언어 설정 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('settings.languageLabel')}
          </Label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            aria-label={t('settings.languageLabel')}
          >
            <option value="en">{t('settings.langEn')}</option>
            <option value="ko">{t('settings.langKo')}</option>
          </select>
        </div>
        {/* 자동 잠금 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('settings.autoLockLabel')}
          </Label>
          <div className="rounded-lg border p-3">
            <select
              value={String(settings.autoLockMinutes ?? 5)}
              onChange={(e) => {
                const val = e.target.value;
                const parsed = val === 'never' ? 'never' : Number(val);
                updateSetting(
                  'autoLockMinutes',
                  parsed as Settings['autoLockMinutes'],
                );
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              aria-label={t('settings.autoLockLabel')}
            >
              <option value="0">{t('settings.autoLockImmediate')}</option>
              <option value="1">
                {t('settings.autoLockAfterMinutes', { minutes: 1 })}
              </option>
              <option value="5">
                {t('settings.autoLockAfterMinutes', { minutes: 5 })}
              </option>
              <option value="10">
                {t('settings.autoLockAfterMinutes', { minutes: 10 })}
              </option>
              <option value="15">
                {t('settings.autoLockAfterMinutes', { minutes: 15 })}
              </option>
              <option value="30">
                {t('settings.autoLockAfterMinutes', { minutes: 30 })}
              </option>
              <option value="never">{t('settings.autoLockManual')}</option>
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('settings.autoLockHint')}
            </p>
          </div>
        </div>

        {/* 프라이버시 설정 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('settings.privacyLabel')}
          </Label>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">
                {t('settings.hideCodesTitle')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.hideCodesHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.hideCodesUntilHover}
              onClick={() =>
                updateSetting(
                  'hideCodesUntilHover',
                  !settings.hideCodesUntilHover,
                )
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                settings.hideCodesUntilHover ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  settings.hideCodesUntilHover
                    ? 'translate-x-5'
                    : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
        {/* 태그 관리 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('settings.tagManageLabel')}
          </Label>
          <div className="space-y-2 rounded-lg border p-3">
            {/* 기존 태그 목록 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => handleDeleteTag(tag.id)}
                      className="rounded-full p-0.5 hover:bg-white/20"
                      aria-label={t('settings.deleteTag', { name: tag.name })}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {tags.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t('settings.noTags')}
              </p>
            )}

            {/* 새 태그 추가 */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded border-0 p-0"
                aria-label={t('settings.tagColor')}
              />
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder={t('settings.newTagPlaceholder')}
                className="h-7 flex-1 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddTag}
                disabled={!newTagName.trim()}
                className="h-7 px-2"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
        {/* 비밀번호 변경 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('settings.changePasswordLabel')}
          </Label>
          <div className="space-y-2 rounded-lg border p-3">
            <Input
              type="password"
              placeholder={t('settings.currentPassword')}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-8 text-xs"
              autoComplete="current-password"
            />
            <Input
              type="password"
              placeholder={t('settings.newPassword')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-8 text-xs"
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder={t('settings.confirmNewPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-8 text-xs"
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleChangePassword();
                }
              }}
            />
            <Button
              size="sm"
              className="w-full"
              onClick={handleChangePassword}
              disabled={changingPassword}
            >
              <KeyRound className="mr-1 h-3.5 w-3.5" />
              {changingPassword
                ? t('settings.changingPassword')
                : t('settings.changePasswordButton')}
            </Button>
            {pwMessage && (
              <p className="text-xs text-green-600 dark:text-green-400">
                {pwMessage}
              </p>
            )}
            {pwError && (
              <p className="text-xs text-destructive" role="alert">
                {pwError}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('settings.exportLabel')}
          </Label>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {t('settings.exportHint')}
            </p>
            <Input
              type="password"
              placeholder={t('settings.exportPasswordPlaceholder')}
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="w-full"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              {exporting ? t('settings.exporting') : t('settings.exportButton')}
            </Button>
          </div>
        </div>
        {/* 가져오기 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('settings.importLabel')}
          </Label>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {t('settings.importHint')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gw-otp"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground"
            />
            <Input
              type="password"
              placeholder={t('settings.importPasswordPlaceholder')}
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="w-full"
              onClick={handleImport}
              disabled={importing || !importFile}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {importing ? t('settings.importing') : t('settings.importButton')}
            </Button>
          </div>
        </div>
        {/* 메시지 */}
        {message && (
          <p className="text-sm text-green-600 dark:text-green-400">
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ThemeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
