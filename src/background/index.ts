/**
 * GW-OTP Background Service Worker
 *
 * 세션 관리: 마스터 비밀번호로 유도된 암호화 키를 메모리에 보관.
 * Service Worker가 종료되면 키가 자동 소멸되어 잠금 상태가 된다.
 *
 * 이 모듈은 UI 관련 의존성이 없다.
 */

import type { MessageRequest, MessageResponse } from '@/types'
import {
  deriveKey,
  verifyPassword,
  createPasswordHash,
  bufferToBase64,
  base64ToBuffer,
  generateSalt,
} from '@/core/crypto'
import { saveSettings, loadSettings } from '@/core/storage'

/** 메모리에만 존재하는 세션 키 (디스크에 저장하지 않음) */
let sessionKey: CryptoKey | null = null

/** 현재 잠금 해제 상태 */
let isUnlocked = false

/**
 * 잠금 해제: 비밀번호 검증 후 세션 키를 메모리에 보관한다.
 */
async function handleUnlock(
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await loadSettings()

    if (!settings) {
      // 초기화되지 않음 → 최초 비밀번호 설정
      const saltBytes = generateSalt()
      const salt = bufferToBase64(saltBytes)
      const key = await deriveKey(password, saltBytes)
      const passwordHash = await createPasswordHash(key)

      await saveSettings({
        hideCodesUntilHover: false,
        theme: 'system',
        passwordHash,
        salt,
      })

      sessionKey = key
      isUnlocked = true
      return { success: true }
    }

    // 기존 비밀번호 검증
    const saltBytes = base64ToBuffer(settings.salt)
    const key = await deriveKey(password, saltBytes)
    const valid = await verifyPassword(settings.passwordHash, key)

    if (!valid) {
      return { success: false, error: '비밀번호가 올바르지 않습니다.' }
    }

    sessionKey = key
    isUnlocked = true
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * 잠금: 세션 키를 메모리에서 제거한다.
 */
function handleLock(): { success: boolean } {
  sessionKey = null
  isUnlocked = false
  return { success: true }
}

/**
 * 상태 조회: 현재 잠금 상태와 초기화 여부를 반환한다.
 */
async function handleGetStatus(): Promise<{
  isUnlocked: boolean
  isInitialized: boolean
}> {
  const settings = await loadSettings()
  return {
    isUnlocked,
    isInitialized: settings !== null,
  }
}

/**
 * 키 조회: 현재 세션 키의 존재 여부를 반환한다.
 * 실제 키는 전달하지 않고, 키가 있으면 'active' 문자열을 반환한다.
 */
function handleGetKey(): { key: string | null } {
  return { key: sessionKey ? 'active' : null }
}

/**
 * 메시지 핸들러: Popup으로부터의 메시지를 처리한다.
 */
export function handleMessage(
  request: MessageRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
): boolean {
  switch (request.type) {
    case 'unlock': {
      handleUnlock(request.password).then((result) => {
        sendResponse({ type: 'unlock', ...result })
      })
      break
    }
    case 'lock': {
      const result = handleLock()
      sendResponse({ type: 'lock', ...result })
      break
    }
    case 'getStatus': {
      handleGetStatus().then((result) => {
        sendResponse({ type: 'getStatus', ...result })
      })
      break
    }
    case 'getKey': {
      const result = handleGetKey()
      sendResponse({ type: 'getKey', ...result })
      break
    }
  }
  // true를 반환하여 비동기 sendResponse 허용
  return true
}

chrome.runtime.onMessage.addListener(handleMessage)

/**
 * 세션 키를 가져온다 (core 모듈에서 암호화/복호화 시 사용).
 * Background 내부에서만 호출한다.
 */
export function getSessionKey(): CryptoKey | null {
  return sessionKey
}
