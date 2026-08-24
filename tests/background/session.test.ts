import { describe, it, expect, beforeEach } from 'vitest';
import { handleMessage, getSessionKey } from '@/background/index';
import type { MessageRequest, MessageResponse } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendMessage(request: MessageRequest): Promise<MessageResponse> {
  return new Promise((resolve) => {
    const sender = {} as chrome.runtime.MessageSender;
    handleMessage(request, sender, (response: MessageResponse) => {
      resolve(response);
    });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('background session management', () => {
  beforeEach(async () => {
    // storage 초기화 + lock 상태로 리셋
    await chrome.storage.sync.clear();
    await sendMessage({ type: 'lock' });
  });

  describe('getStatus', () => {
    it('should return not initialized and locked when fresh', async () => {
      const response = await sendMessage({ type: 'getStatus' });
      expect(response).toEqual({
        type: 'getStatus',
        isUnlocked: false,
        isInitialized: false,
      });
    });

    it('should return initialized after first unlock', async () => {
      await sendMessage({ type: 'unlock', password: 'my-password' });

      // lock 후에도 initialized는 true
      await sendMessage({ type: 'lock' });

      const response = await sendMessage({ type: 'getStatus' });
      expect(response).toMatchObject({
        isUnlocked: false,
        isInitialized: true,
      });
    });
  });

  describe('unlock - first time (initialization)', () => {
    it('should succeed and set initialized state', async () => {
      const response = await sendMessage({
        type: 'unlock',
        password: 'new-password',
      });

      expect(response).toEqual({ type: 'unlock', success: true });
      expect(getSessionKey()).not.toBeNull();
    });

    it('should store settings in chrome.storage.sync', async () => {
      await sendMessage({ type: 'unlock', password: 'test-pass' });

      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings;
      expect(settings).toBeDefined();
      expect(settings.salt).toBeDefined();
      expect(settings.passwordHash).toBeDefined();
      expect(settings.theme).toBe('system');
      expect(settings.hideCodesUntilHover).toBe(false);
    });
  });

  describe('unlock - subsequent times', () => {
    beforeEach(async () => {
      // 초기화 (비밀번호 설정)
      await sendMessage({ type: 'unlock', password: 'correct-password' });
      await sendMessage({ type: 'lock' });
    });

    it('should succeed with correct password', async () => {
      const response = await sendMessage({
        type: 'unlock',
        password: 'correct-password',
      });

      expect(response).toEqual({ type: 'unlock', success: true });
      expect(getSessionKey()).not.toBeNull();
    });

    it('should fail with incorrect password', async () => {
      const response = await sendMessage({
        type: 'unlock',
        password: 'wrong-password',
      });

      expect(response).toMatchObject({
        type: 'unlock',
        success: false,
      });
      expect((response as { error?: string }).error).toBeDefined();
      expect(getSessionKey()).toBeNull();
    });
  });

  describe('lock', () => {
    it('should clear session key', async () => {
      await sendMessage({ type: 'unlock', password: 'password' });
      expect(getSessionKey()).not.toBeNull();

      const response = await sendMessage({ type: 'lock' });
      expect(response).toEqual({ type: 'lock', success: true });
      expect(getSessionKey()).toBeNull();
    });

    it('should set status to locked', async () => {
      await sendMessage({ type: 'unlock', password: 'password' });
      await sendMessage({ type: 'lock' });

      const status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: false });
    });
  });

  describe('getKey', () => {
    it('should return null when locked', async () => {
      const response = await sendMessage({ type: 'getKey' });
      expect(response).toEqual({ type: 'getKey', key: null });
    });

    it('should return "active" when unlocked', async () => {
      await sendMessage({ type: 'unlock', password: 'password' });

      const response = await sendMessage({ type: 'getKey' });
      expect(response).toEqual({ type: 'getKey', key: 'active' });
    });
  });

  describe('session lifecycle', () => {
    it('should handle full lifecycle: init → lock → unlock → lock', async () => {
      // 1. 초기 상태
      let status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: false, isInitialized: false });

      // 2. 초기화 (최초 비밀번호 설정)
      const unlockResult = await sendMessage({
        type: 'unlock',
        password: 'lifecycle-pass',
      });
      expect(unlockResult).toMatchObject({ success: true });

      status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: true, isInitialized: true });

      // 3. 수동 잠금
      await sendMessage({ type: 'lock' });
      status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: false, isInitialized: true });

      // 4. 재잠금 해제
      const reUnlock = await sendMessage({
        type: 'unlock',
        password: 'lifecycle-pass',
      });
      expect(reUnlock).toMatchObject({ success: true });

      status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: true, isInitialized: true });

      // 5. 최종 잠금
      await sendMessage({ type: 'lock' });
      expect(getSessionKey()).toBeNull();
    });
  });
});
