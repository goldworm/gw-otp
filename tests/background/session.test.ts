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
    // Reset storage + reset to locked state
    await chrome.storage.local.clear();
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

      // initialized stays true even after lock
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

    it('should store settings in chrome.storage.local', async () => {
      await sendMessage({ type: 'unlock', password: 'test-pass' });

      const result = await chrome.storage.local.get('settings');
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
      // Initialize (set the password)
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

    it('should return the raw session key (base64) when unlocked', async () => {
      await sendMessage({ type: 'unlock', password: 'password' });

      const response = await sendMessage({ type: 'getKey' });
      expect(response.type).toBe('getKey');
      // The actual key is returned as a base64 string
      const key = (response as { key: string | null }).key;
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
      // AES-256 raw key = 32 bytes → 44 base64 chars (including padding)
      expect((key as string).length).toBeGreaterThan(0);
    });
  });

  describe('session lifecycle', () => {
    it('should handle full lifecycle: init → lock → unlock → lock', async () => {
      // 1. Initial state
      let status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: false, isInitialized: false });

      // 2. Initialize (set the password for the first time)
      const unlockResult = await sendMessage({
        type: 'unlock',
        password: 'lifecycle-pass',
      });
      expect(unlockResult).toMatchObject({ success: true });

      status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: true, isInitialized: true });

      // 3. Manual lock
      await sendMessage({ type: 'lock' });
      status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: false, isInitialized: true });

      // 4. Unlock again
      const reUnlock = await sendMessage({
        type: 'unlock',
        password: 'lifecycle-pass',
      });
      expect(reUnlock).toMatchObject({ success: true });

      status = await sendMessage({ type: 'getStatus' });
      expect(status).toMatchObject({ isUnlocked: true, isInitialized: true });

      // 5. Final lock
      await sendMessage({ type: 'lock' });
      expect(getSessionKey()).toBeNull();
    });
  });
});
