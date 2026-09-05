import { useState, useEffect, useCallback } from 'react';
import { UnlockPage } from '@/popup/pages/unlock-page';
import { MainPage } from '@/popup/pages/main-page';
import { EditOTPPage } from '@/popup/pages/edit-otp-page';
import { AddOTPPage } from '@/popup/pages/add-otp-page';
import { SettingsPage } from '@/popup/pages/settings-page';
import type { Page, MessageResponse, Theme } from '@/types';
import { deriveKey, base64ToBuffer, importKeyFromBase64 } from '@/core/crypto';
import { loadSettings } from '@/core/storage';

export function App() {
  const [page, setPage] = useState<Page>('unlock');
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 테마 적용
  const applyTheme = useCallback((theme: Theme) => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // system
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, []);

  // 세션 상태 확인 + 테마 로드
  const checkStatus = useCallback(async () => {
    try {
      const response: MessageResponse = await chrome.runtime.sendMessage({
        type: 'getStatus',
      });
      if (response.type === 'getStatus') {
        setIsInitialized(response.isInitialized);
        if (response.isUnlocked) {
          // background에서 세션 키를 받아 복원 (팝업 재실행 시 재입력 방지)
          const keyResponse: MessageResponse = await chrome.runtime.sendMessage({
            type: 'getKey',
          });
          if (keyResponse.type === 'getKey' && keyResponse.key) {
            const key = await importKeyFromBase64(keyResponse.key);
            setSessionKey(key);
            setPage('main');
            // 팝업 열릴 때 자동 잠금 타이머 리셋
            chrome.runtime.sendMessage({ type: 'resetTimer' });
          } else {
            // 키 복원 실패 시 잠금 화면
            setPage('unlock');
          }
        } else {
          setPage('unlock');
        }
      }

      // 테마 로드 및 적용
      const settings = await loadSettings();
      if (settings) {
        applyTheme(settings.theme);
      }
    } catch {
      setPage('unlock');
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 팝업 연결 port 유지 (닫히면 background가 감지하여 즉시 잠금 처리)
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'gw-otp-popup' });
    return () => {
      port.disconnect();
    };
  }, []);

  // 시스템 테마 변경 감지
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      loadSettings().then((settings) => {
        if (settings?.theme === 'system') {
          applyTheme('system');
        }
      });
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [applyTheme]);

  // 잠금 해제 핸들러
  async function handleUnlock(
    password: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response: MessageResponse = await chrome.runtime.sendMessage({
        type: 'unlock',
        password,
      });
      if (response.type === 'unlock') {
        if (response.success) {
          setIsInitialized(true);
          // 로컬에서 키 유도 (popup에서 직접 암/복호화를 위해)
          const settings = await loadSettings();
          if (settings) {
            const salt = base64ToBuffer(settings.salt);
            const key = await deriveKey(password, salt);
            setSessionKey(key);
            applyTheme(settings.theme);
          }
          setPage('main');
        }
        return { success: response.success, error: response.error };
      }
      return { success: false, error: 'Unexpected response' };
    } catch {
      return { success: false, error: '확장 프로그램 연결 오류' };
    }
  }

  // 잠금 핸들러
  async function handleLock() {
    await chrome.runtime.sendMessage({ type: 'lock' });
    setSessionKey(null);
    setPage('unlock');
  }

  // 페이지 네비게이션
  function handleNavigate(target: 'add' | 'edit' | 'settings') {
    setPage(target);
  }

  // 편집 진입
  function handleEditEntry(id: string) {
    setEditEntryId(id);
    setPage('edit');
  }

  // 테마 변경 핸들러
  function handleThemeChange(theme: Theme) {
    applyTheme(theme);
  }

  // 비밀번호 변경 후 Popup sessionKey 갱신 핸들러
  function handlePasswordChanged(newKey: CryptoKey) {
    setSessionKey(newKey);
  }

  // 로딩 중
  if (loading) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  // 페이지 라우팅
  switch (page) {
    case 'unlock':
      return (
        <UnlockPage isInitialized={isInitialized} onUnlock={handleUnlock} />
      );

    case 'main':
      if (!sessionKey) {
        setPage('unlock');
        return null;
      }
      return (
        <MainPage
          sessionKey={sessionKey}
          onLock={handleLock}
          onNavigate={handleNavigate}
          onEditEntry={handleEditEntry}
        />
      );

    case 'add':
      if (!sessionKey) {
        setPage('main');
        return null;
      }
      return (
        <AddOTPPage
          sessionKey={sessionKey}
          onBack={() => setPage('main')}
          onAdded={() => setPage('main')}
        />
      );

    case 'edit':
      if (!sessionKey || !editEntryId) {
        setPage('main');
        return null;
      }
      return (
        <EditOTPPage
          entryId={editEntryId}
          sessionKey={sessionKey}
          onBack={() => setPage('main')}
          onSaved={() => setPage('main')}
        />
      );

    case 'settings':
      if (!sessionKey) {
        setPage('main');
        return null;
      }
      return (
        <SettingsPage
          sessionKey={sessionKey}
          onBack={() => setPage('main')}
          onThemeChange={handleThemeChange}
          onPasswordChanged={handlePasswordChanged}
        />
      );
  }
}
