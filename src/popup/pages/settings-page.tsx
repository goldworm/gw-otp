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
import type { MessageResponse, Settings, Tag, Theme } from '@/types';

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
    if (!newTagName.trim()) return;
    const tag: Tag = {
      id: crypto.randomUUID(),
      name: newTagName.trim(),
      color: newTagColor,
    };
    await addTag(tag);
    setTags((prev) => [...prev, tag]);
    setNewTagName('');
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
      setError('내보내기 비밀번호를 입력하세요.');
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

      setMessage('백업 파일이 다운로드되었습니다.');
      setExportPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  }

  // 가져오기
  async function handleImport() {
    setError('');
    setMessage('');
    if (!importFile) {
      setError('백업 파일을 선택하세요.');
      return;
    }
    if (!importPassword.trim()) {
      setError('내보내기 시 사용한 비밀번호를 입력하세요.');
      return;
    }

    setImporting(true);
    try {
      const content = await importFile.text();
      const backup = parseBackupFile(content);
      const data = await decryptBackup(backup, importPassword);
      const result = await importBackup(data, sessionKey, 'merge');

      setMessage(
        `가져오기 완료: ${result.imported}개 추가, ${result.skipped}개 중복 건너뜀`,
      );
      setImportPassword('');
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오기에 실패했습니다.');
    } finally {
      setImporting(false);
    }
  }

  // 비밀번호 변경
  async function handleChangePassword() {
    setPwError('');
    setPwMessage('');

    if (!currentPassword) {
      setPwError('현재 비밀번호를 입력하세요.');
      return;
    }
    if (!newPassword) {
      setPwError('새 비밀번호를 입력하세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 4) {
      setPwError('비밀번호는 4자 이상이어야 합니다.');
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
          setPwMessage('비밀번호가 변경되었습니다.');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        } else {
          setPwError(response.error ?? '비밀번호 변경에 실패했습니다.');
        }
      }
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.',
      );
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[500px] w-[380px] bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="뒤로">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">설정</h1>
      </header>

      <div className="space-y-6 overflow-y-auto p-4">
        {/* 테마 설정 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">테마</Label>
          <div className="grid grid-cols-3 gap-2">
            <ThemeButton
              icon={<Sun className="h-4 w-4" />}
              label="라이트"
              active={settings.theme === 'light'}
              onClick={() => updateSetting('theme', 'light')}
            />
            <ThemeButton
              icon={<Moon className="h-4 w-4" />}
              label="다크"
              active={settings.theme === 'dark'}
              onClick={() => updateSetting('theme', 'dark')}
            />
            <ThemeButton
              icon={<Monitor className="h-4 w-4" />}
              label="시스템"
              active={settings.theme === 'system'}
              onClick={() => updateSetting('theme', 'system')}
            />
          </div>
        </div>
        {/* 프라이버시 설정 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">프라이버시</Label>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">OTP 코드 숨기기</p>
              <p className="text-xs text-muted-foreground">
                마우스를 올릴 때만 코드 표시
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
          <Label className="text-sm font-medium">태그 관리</Label>
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
                      aria-label={`${tag.name} 태그 삭제`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {tags.length === 0 && (
              <p className="text-xs text-muted-foreground">
                등록된 태그가 없습니다.
              </p>
            )}

            {/* 새 태그 추가 */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded border-0 p-0"
                aria-label="태그 색상"
              />
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="새 태그 이름"
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
          <Label className="text-sm font-medium">비밀번호 변경</Label>
          <div className="space-y-2 rounded-lg border p-3">
            <Input
              type="password"
              placeholder="현재 비밀번호"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-8 text-xs"
              autoComplete="current-password"
            />
            <Input
              type="password"
              placeholder="새 비밀번호"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-8 text-xs"
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="새 비밀번호 확인"
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
              {changingPassword ? '변경 중...' : '비밀번호 변경'}
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
          <Label className="text-sm font-medium">데이터 내보내기</Label>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              모든 OTP 데이터를 암호화된 파일로 저장합니다.
            </p>
            <Input
              type="password"
              placeholder="내보내기 비밀번호"
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
              {exporting ? '내보내기 중...' : '내보내기'}
            </Button>
          </div>
        </div>
        {/* 가져오기 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">데이터 가져오기</Label>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              .gw-otp 백업 파일에서 데이터를 복원합니다.
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
              placeholder="내보내기 시 사용한 비밀번호"
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
              {importing ? '가져오기 중...' : '가져오기'}
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
