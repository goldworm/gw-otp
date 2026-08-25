import '@testing-library/jest-dom/vitest';

// Mock chrome APIs
const storageMock: Record<string, unknown> = {};

const chromeStorageSyncMock = {
  get: vi.fn((keys: string | string[] | null) => {
    if (keys === null) return Promise.resolve({ ...storageMock });
    if (typeof keys === 'string') {
      return Promise.resolve({ [keys]: storageMock[keys] });
    }
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in storageMock) result[key] = storageMock[key];
    }
    return Promise.resolve(result);
  }),
  set: vi.fn((items: Record<string, unknown>) => {
    Object.assign(storageMock, items);
    return Promise.resolve();
  }),
  remove: vi.fn((keys: string | string[]) => {
    const keysArr = typeof keys === 'string' ? [keys] : keys;
    for (const key of keysArr) {
      delete storageMock[key];
    }
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(storageMock)) {
      delete storageMock[key];
    }
    return Promise.resolve();
  }),
  getBytesInUse: vi.fn(() => Promise.resolve(0)),
};

const chromeRuntimeMock = {
  sendMessage: vi.fn(),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const chromeTabsMock = {
  captureVisibleTab: vi.fn(),
};

const chromeAlarmsMock = {
  create: vi.fn(),
  clear: vi.fn(() => Promise.resolve(true)),
  onAlarm: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const chromeStorageSessionMock = {
  get: vi.fn((_keys: string | string[]) => Promise.resolve({})),
  set: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
};

Object.defineProperty(globalThis, 'chrome', {
  value: {
    storage: {
      sync: chromeStorageSyncMock,
      session: chromeStorageSessionMock,
    },
    runtime: chromeRuntimeMock,
    tabs: chromeTabsMock,
    alarms: chromeAlarmsMock,
  },
  writable: true,
});
