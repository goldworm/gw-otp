/**
 * GW-OTP Background Service Worker
 *
 * 세션 관리: 마스터 비밀번호로 유도된 암호화 키를 메모리에 보관.
 * Service Worker가 종료되면 키가 자동 소멸되어 잠금 상태가 된다.
 *
 * 이 모듈은 UI 관련 의존성이 없다.
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

/** 자동 잠금 알람 이름 */
const AUTO_LOCK_ALARM = 'gw-otp-auto-lock';

/** session storage 키 (SW 재시작 시 복원용) */
const SESSION_KEY_STORAGE = 'gw-otp-session-key';

/** 메모리에만 존재하는 세션 키 (디스크에 저장하지 않음) */
let sessionKey: CryptoKey | null = null;

/** 현재 잠금 해제 상태 */
let isUnlocked = false;

/**
 * 세션 키를 chrome.storage.session에 저장한다 (SW 재시작 시 복원용).
 * autoLockMinutes가 0이 아닌 경우에만 저장한다.
 */
async function persistSessionKey(key: CryptoKey) {
  try {
    // autoLockMinutes === 0 (팝업 닫을 때 즉시 잠금)이면 저장하지 않는다.
    // SW 재시작 시 복원할 키가 없어 잠금 상태가 유지된다.
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
    // session storage 미지원 환경에서는 무시
  }
}

/**
 * chrome.storage.session에서 세션 키를 복원한다.
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
 * session storage에서 세션 키를 제거한다.
 */
async function clearPersistedSessionKey() {
  try {
    await chrome.storage.session.remove(SESSION_KEY_STORAGE);
  } catch {
    // 무시
  }
}

// SW 시작 시 세션 복원
restoreSessionKey().then((key) => {
  if (key) {
    sessionKey = key;
    isUnlocked = true;
  }
});

// 팝업 연결 감지: 팝업이 닫히면(port disconnect) autoLockMinutes === 0일 때 즉시 잠금
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
 * 잠금 해제: 비밀번호 검증 후 세션 키를 메모리에 보관한다.
 */
async function handleUnlock(
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await loadSettings();

    if (!settings) {
      // 초기화되지 않음 → 최초 비밀번호 설정
      const saltBytes = generateSalt();
      const salt = bufferToBase64(saltBytes);
      const key = await deriveKey(password, saltBytes);
      const passwordHash = await createPasswordHash(key);

      await saveSettings({
        hideCodesUntilHover: false,
        theme: 'system',
        autoLockMinutes: 5,
        passwordHash,
        salt,
      });

      sessionKey = key;
      isUnlocked = true;
      await persistSessionKey(key);
      await resetAutoLockAlarm();
      return { success: true };
    }

    // 기존 비밀번호 검증
    const saltBytes = base64ToBuffer(settings.salt);
    const key = await deriveKey(password, saltBytes);
    const valid = await verifyPassword(settings.passwordHash, key);

    if (!valid) {
      return { success: false, error: '비밀번호가 올바르지 않습니다.' };
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
 * 잠금: 세션 키를 메모리에서 제거한다.
 */
function handleLock(): { success: boolean } {
  sessionKey = null;
  isUnlocked = false;
  clearAutoLockAlarm();
  clearPersistedSessionKey();
  return { success: true };
}

/**
 * 자동 잠금 알람을 설정/리셋한다.
 * 팝업이 열릴 때마다 호출하여 타이머를 리셋한다.
 */
async function resetAutoLockAlarm() {
  const settings = await loadSettings();
  const minutes = settings?.autoLockMinutes ?? 5;

  // 기존 알람 제거
  await chrome.alarms.clear(AUTO_LOCK_ALARM);

  if (minutes === 'never' || minutes === 0) {
    // 'never'는 알람 없음 (수동 잠금만), 0은 즉시 잠금 (SW 종료 시)
    return;
  }

  // 알람 설정
  chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: minutes });
}

/**
 * 자동 잠금 알람을 제거한다.
 */
function clearAutoLockAlarm() {
  chrome.alarms.clear(AUTO_LOCK_ALARM);
}

// 알람 이벤트 리스너: 자동 잠금 실행
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) {
    handleLock();
  }
});

/**
 * 상태 조회: 현재 잠금 상태와 초기화 여부를 반환한다.
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
 * 키 조회: 현재 세션 키를 raw base64로 반환한다.
 * 잠금 해제 상태에서 팝업이 재실행될 때 키를 복원하기 위해 사용한다.
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
 * 비밀번호 변경: 현재 비밀번호를 검증한 뒤 새 비밀번호로 재설정한다.
 * 저장된 모든 OTP secret을 새 키로 재암호화하고 세션 키를 갱신한다.
 */
async function handleChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isUnlocked || !sessionKey) {
      return {
        success: false,
        error: '잠금 해제 상태에서만 변경할 수 있습니다.',
      };
    }

    const settings = await loadSettings();
    if (!settings) {
      return { success: false, error: '설정을 불러올 수 없습니다.' };
    }

    // 현재 비밀번호 검증
    const oldSaltBytes = base64ToBuffer(settings.salt);
    const oldKey = await deriveKey(currentPassword, oldSaltBytes);
    const valid = await verifyPassword(settings.passwordHash, oldKey);
    if (!valid) {
      return { success: false, error: '현재 비밀번호가 올바르지 않습니다.' };
    }

    // 새 salt + 키 생성 및 전체 재암호화
    const {
      salt,
      passwordHash,
      key: newKey,
    } = await initializePassword(newPassword);
    await reencryptAllEntries(oldKey, newKey, salt, passwordHash);

    // 세션 키 갱신
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
 * 메시지 핸들러: Popup으로부터의 메시지를 처리한다.
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
  // true를 반환하여 비동기 sendResponse 허용
  return true;
}

chrome.runtime.onMessage.addListener(handleMessage);

/**
 * 세션 키를 가져온다 (core 모듈에서 암호화/복호화 시 사용).
 * Background 내부에서만 호출한다.
 */
export function getSessionKey(): CryptoKey | null {
  return sessionKey;
}
