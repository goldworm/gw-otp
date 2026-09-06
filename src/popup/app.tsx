import { useState, useEffect, useCallback } from 'react';
import { UnlockPage } from '@/popup/pages/unlock-page';
import { MainPage } from '@/popup/pages/main-page';
import { EditOTPPage } from '@/popup/pages/edit-otp-page';
import { AddOTPPage } from '@/popup/pages/add-otp-page';
import { SettingsPage } from '@/popup/pages/settings-page';
import type { Page, MessageResponse, Theme, Language } from '@/types';
import { deriveKey, base64ToBuffer, importKeyFromBase64 } from '@/core/crypto';
import { loadSettings, saveSettings } from '@/core/storage';
import { I18nProvider } from '@/popup/i18n/use-i18n';

export function App() {
  const [page, setPage] = useState<Page>('unlock');
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [loading, setLoading] = useState(true);

  // Apply theme
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

  // Check session status + load theme
  const checkStatus = useCallback(async () => {
    try {
      const response: MessageResponse = await chrome.runtime.sendMessage({
        type: 'getStatus',
      });
      if (response.type === 'getStatus') {
        setIsInitialized(response.isInitialized);
        if (response.isUnlocked) {
          // Receive and restore the session key from the background (avoid re-entry when the popup reopens)
          const keyResponse: MessageResponse = await chrome.runtime.sendMessage({
            type: 'getKey',
          });
          if (keyResponse.type === 'getKey' && keyResponse.key) {
            const key = await importKeyFromBase64(keyResponse.key);
            setSessionKey(key);
            setPage('main');
            // Reset the auto-lock timer when the popup opens
            chrome.runtime.sendMessage({ type: 'resetTimer' });
          } else {
            // Show the lock screen if key restoration fails
            setPage('unlock');
          }
        } else {
          setPage('unlock');
        }
      }

      // Load and apply theme and language
      const settings = await loadSettings();
      if (settings) {
        applyTheme(settings.theme);
        if (settings.language) {
          setLanguage(settings.language);
        }
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

  // Keep the popup connection port open (on close, the background detects it and locks immediately)
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'gw-otp-popup' });
    return () => {
      port.disconnect();
    };
  }, []);

  // Detect system theme changes
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

  // Unlock handler
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
          // Derive the key locally (for encryption/decryption directly in the popup)
          const settings = await loadSettings();
          if (settings) {
            const salt = base64ToBuffer(settings.salt);
            const key = await deriveKey(password, salt);
            setSessionKey(key);
            applyTheme(settings.theme);
            if (settings.language) {
              setLanguage(settings.language);
            }
          }
          setPage('main');
        }
        return { success: response.success, error: response.error };
      }
      return { success: false, error: 'Unexpected response' };
    } catch {
      return { success: false, error: 'Extension connection error' };
    }
  }

  // Lock handler
  async function handleLock() {
    await chrome.runtime.sendMessage({ type: 'lock' });
    setSessionKey(null);
    setPage('unlock');
  }

  // Page navigation
  function handleNavigate(target: 'add' | 'edit' | 'settings') {
    setPage(target);
  }

  // Enter edit mode
  function handleEditEntry(id: string) {
    setEditEntryId(id);
    setPage('edit');
  }

  // Theme change handler
  function handleThemeChange(theme: Theme) {
    applyTheme(theme);
  }

  // Language change handler (I18nProvider → persist to settings)
  const handleLanguageChange = useCallback(async (lang: Language) => {
    setLanguage(lang);
    const settings = await loadSettings();
    if (settings) {
      await saveSettings({ ...settings, language: lang });
    }
  }, []);

  // Handler to refresh the popup sessionKey after a password change
  function handlePasswordChanged(newKey: CryptoKey) {
    setSessionKey(newKey);
  }

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-[500px] w-[380px] items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">...</p>
      </div>
    );
  }

  // Page routing
  function renderPage() {
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

  return (
    <I18nProvider
      initialLanguage={language}
      onLanguageChange={handleLanguageChange}
    >
      {renderPage()}
    </I18nProvider>
  );
}
