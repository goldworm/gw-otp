/**
 * GW-OTP Background Service Worker
 *
 * Session management: keeps the encryption key derived from the master
 * password in memory. When the Service Worker terminates, the key is
 * automatically discarded and the app returns to the locked state.
 *
 * This module has no UI dependencies.
 */

import type { MessageRequest, MessageResponse } from '@/types';
import {
  deriveKey,
  verifyPassword,
  createPasswordHash,
  bufferToBase64,
  base64ToBuffer,
  generateSalt,
  initializePassword,
} from '@/core/crypto';
import {
  saveSettings,
  loadSettings,
  reencryptAllEntries,
} from '@/core/storage';

/** Auto-lock alarm name */
const AUTO_LOCK_ALARM = 'gw-otp-auto-lock';

/** session storage key (used to restore on SW restart) */
const SESSION_KEY_STORAGE = 'gw-otp-session-key';

/** Session key that lives only in memory (never persisted to disk) */
let sessionKey: CryptoKey | null = null;

/** Whether the app is currently unlocked */
let isUnlocked = false;

/**
 * Persist the session key to chrome.storage.session (to restore on SW restart).
 * Only persists when autoLockMinutes is not 0.
 */
async function persistSessionKey(key: CryptoKey) {
  try {
    // If autoLockMinutes === 0 (lock immediately on popup close), do not persist.
    // On SW restart there is no key to restore, so the locked state is kept.
    const settings = await loadSettings();
    if (settings?.autoLockMinutes === 0) {
      return;
    }

    const exported = await crypto.subtle.exportKey('raw', key);
    const bytes = new Uint8Array(exported);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    await chrome.storage.session.set({ [SESSION_KEY_STORAGE]: base64 });
  } catch {
    // Ignore on environments without session storage support
  }
}

/**
 * Restore the session key from chrome.storage.session.
 */
async function restoreSessionKey(): Promise<CryptoKey | null> {
  try {
    const result = await chrome.storage.session.get(SESSION_KEY_STORAGE);
    const base64 = result[SESSION_KEY_STORAGE] as string | undefined;
    if (!base64) return null;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

/**
 * Remove the session key from session storage.
 */
async function clearPersistedSessionKey() {
  try {
    await chrome.storage.session.remove(SESSION_KEY_STORAGE);
  } catch {
    // Ignore
  }
}

// Restore the session when the SW starts
restoreSessionKey().then((key) => {
  if (key) {
    sessionKey = key;
    isUnlocked = true;
  }
});

// Detect popup connection: when the popup closes (port disconnect),
// lock immediately if autoLockMinutes === 0.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'gw-otp-popup') return;

  port.onDisconnect.addListener(async () => {
    const settings = await loadSettings();
    if (settings?.autoLockMinutes === 0) {
      handleLock();
    }
  });
});

/**
 * Unlock: verify the password and keep the session key in memory.
 */
async function handleUnlock(
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await loadSettings();

    if (!settings) {
      // Not initialized → set the password for the first time
      const saltBytes = generateSalt();
      const salt = bufferToBase64(saltBytes);
      const key = await deriveKey(password, saltBytes);
      const passwordHash = await createPasswordHash(key);

      await saveSettings({
        hideCodesUntilHover: false,
        theme: 'system',
        autoLockMinutes: 5,
        language: 'en',
        passwordHash,
        salt,
      });

      sessionKey = key;
      isUnlocked = true;
      await persistSessionKey(key);
      await resetAutoLockAlarm();
      return { success: true };
    }

    // Verify the existing password
    const saltBytes = base64ToBuffer(settings.salt);
    const key = await deriveKey(password, saltBytes);
    const valid = await verifyPassword(settings.passwordHash, key);

    if (!valid) {
      return { success: false, error: 'The password is incorrect.' };
    }

    sessionKey = key;
    isUnlocked = true;
    await persistSessionKey(key);
    await resetAutoLockAlarm();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Lock: remove the session key from memory.
 */
function handleLock(): { success: boolean } {
  sessionKey = null;
  isUnlocked = false;
  clearAutoLockAlarm();
  clearPersistedSessionKey();
  return { success: true };
}

/**
 * Set/reset the auto-lock alarm.
 * Called whenever the popup opens to reset the timer.
 */
async function resetAutoLockAlarm() {
  const settings = await loadSettings();
  const minutes = settings?.autoLockMinutes ?? 5;

  // Remove any existing alarm
  await chrome.alarms.clear(AUTO_LOCK_ALARM);

  if (minutes === 'never' || minutes === 0) {
    // 'never' means no alarm (manual lock only); 0 means immediate lock (on SW termination)
    return;
  }

  // Create the alarm
  chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: minutes });
}

/**
 * Remove the auto-lock alarm.
 */
function clearAutoLockAlarm() {
  chrome.alarms.clear(AUTO_LOCK_ALARM);
}

// Alarm event listener: run the auto-lock
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) {
    handleLock();
  }
});

/**
 * Status query: return the current lock state and whether it is initialized.
 */
async function handleGetStatus(): Promise<{
  isUnlocked: boolean;
  isInitialized: boolean;
}> {
  const settings = await loadSettings();
  return {
    isUnlocked,
    isInitialized: settings !== null,
  };
}

/**
 * Key query: return the current session key as raw base64.
 * Used to restore the key when the popup is reopened while unlocked.
 */
async function handleGetKey(): Promise<{ key: string | null }> {
  if (!sessionKey) return { key: null };
  try {
    const exported = await crypto.subtle.exportKey('raw', sessionKey);
    const bytes = new Uint8Array(exported);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return { key: btoa(binary) };
  } catch {
    return { key: null };
  }
}

/**
 * Change password: verify the current password, then reset to the new one.
 * Re-encrypts all stored OTP secrets with the new key and refreshes the session key.
 */
async function handleChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isUnlocked || !sessionKey) {
      return {
        success: false,
        error: 'The password can only be changed while unlocked.',
      };
    }

    const settings = await loadSettings();
    if (!settings) {
      return { success: false, error: 'Could not load settings.' };
    }

    // Verify the current password
    const oldSaltBytes = base64ToBuffer(settings.salt);
    const oldKey = await deriveKey(currentPassword, oldSaltBytes);
    const valid = await verifyPassword(settings.passwordHash, oldKey);
    if (!valid) {
      return { success: false, error: 'The current password is incorrect.' };
    }

    // Generate a new salt + key and re-encrypt everything
    const {
      salt,
      passwordHash,
      key: newKey,
    } = await initializePassword(newPassword);
    await reencryptAllEntries(oldKey, newKey, salt, passwordHash);

    // Refresh the session key
    sessionKey = newKey;
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Message handler: processes messages from the Popup.
 */
export function handleMessage(
  request: MessageRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void,
): boolean {
  switch (request.type) {
    case 'unlock': {
      handleUnlock(request.password).then((result) => {
        sendResponse({ type: 'unlock', ...result });
      });
      break;
    }
    case 'lock': {
      const result = handleLock();
      sendResponse({ type: 'lock', ...result });
      break;
    }
    case 'getStatus': {
      handleGetStatus().then((result) => {
        sendResponse({ type: 'getStatus', ...result });
      });
      break;
    }
    case 'getKey': {
      handleGetKey().then((result) => {
        sendResponse({ type: 'getKey', ...result });
      });
      break;
    }
    case 'resetTimer': {
      resetAutoLockAlarm();
      sendResponse({ type: 'lock', success: true });
      break;
    }
    case 'changePassword': {
      handleChangePassword(request.currentPassword, request.newPassword).then(
        (result) => {
          sendResponse({ type: 'changePassword', ...result });
        },
      );
      break;
    }
  }
  // Return true to allow an asynchronous sendResponse
  return true;
}

chrome.runtime.onMessage.addListener(handleMessage);

/**
 * Get the session key (used by core modules for encryption/decryption).
 * Only called from within the Background.
 */
export function getSessionKey(): CryptoKey | null {
  return sessionKey;
}
