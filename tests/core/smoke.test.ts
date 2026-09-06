import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have chrome mock available', () => {
    expect(chrome).toBeDefined();
    expect(chrome.storage.local).toBeDefined();
    expect(chrome.runtime.sendMessage).toBeDefined();
  });

  it('should mock chrome.storage.local operations', async () => {
    await chrome.storage.local.set({ test: 'value' });
    const result = await chrome.storage.local.get('test');
    expect(result).toEqual({ test: 'value' });
  });
});
