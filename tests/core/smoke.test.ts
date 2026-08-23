import { describe, it, expect } from 'vitest'

describe('smoke test', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('should have chrome mock available', () => {
    expect(chrome).toBeDefined()
    expect(chrome.storage.sync).toBeDefined()
    expect(chrome.runtime.sendMessage).toBeDefined()
  })

  it('should mock chrome.storage.sync operations', async () => {
    await chrome.storage.sync.set({ test: 'value' })
    const result = await chrome.storage.sync.get('test')
    expect(result).toEqual({ test: 'value' })
  })
})
