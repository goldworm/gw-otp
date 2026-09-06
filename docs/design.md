# GW-OTP Chrome Extension - Design Document

## 1. Project Overview

GW-OTP is a Chrome extension for managing OTP (TOTP and HOTP) codes. From the
popup, users can add, edit, delete, group, search, and view OTP codes. Data is
encrypted with a master password and stored in `chrome.storage.local`, so
sensitive secrets never leave the device.

## 2. Requirements Summary

| #   | Requirement     | Description                                                          |
| --- | --------------- | ------------------------------------------------------------------- |
| 1   | Add OTP         | Manual entry, QR image upload, screen capture, `otpauth://` URI paste, `otpauth-migration://` import |
| 2   | Manage OTP      | Edit an entry (issuer, label, secret, tags, etc.), delete (after confirmation) |
| 3   | Display OTP     | List view + search/filter + tag-based grouping                      |
| 4   | OTP card        | Show issuer and label(id), drag-and-drop reordering, pin-to-top     |
| 5   | Security        | Master-password encryption, session-based lock + auto-lock + manual lock |
| 6   | Convenience     | Clipboard copy, countdown display, export/import                    |
| 7   | Privacy         | Show OTP codes only on hover (settings toggle)                      |
| 8   | Theme           | Light / dark / system theme switching                               |
| 9   | Code convention | All file names in kebab-case                                        |
| 10  | i18n            | English / Korean                                                    |
| 11  | Tests           | Vitest                                                              |

## 3. Tech Stack

| Area                    | Technology                       |
| ----------------------- | -------------------------------- |
| UI framework            | React 19, TypeScript             |
| Styling                 | Tailwind CSS v4                  |
| UI components           | shadcn/ui                        |
| Build tool              | Vite                             |
| Chrome extension build  | @crxjs/vite-plugin               |
| OTP generation          | otplib                           |
| QR decoding/encoding    | jsQR / qrcode                    |
| Encryption              | Web Crypto API (AES-GCM, PBKDF2) |
| Tests                   | Vitest                           |
| Manifest version        | Chrome Extension Manifest V3     |

## 4. Architecture

### 4.1 Layer Separation Principle

The Core layer and the UI layer are strictly isolated. This allows the business
logic to be reused even if the UI framework is replaced.

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (React + Tailwind + shadcn/ui)                    │
│  - Pure presentation logic, user interaction handling        │
│  - Depends on Core, but Core does not depend on UI           │
├─────────────────────────────────────────────────────────────┤
│  Core Layer (pure TypeScript, UI-agnostic)                  │
│  - crypto, storage, otp, qr, migration, backup             │
│  - No React, DOM, Tailwind, or shadcn/ui imports            │
│  - Depends only on browser APIs (chrome.*)                  │
├─────────────────────────────────────────────────────────────┤
│  Background Layer (Service Worker)                          │
│  - Uses Core for session/key management                      │
│  - Exposes a message-based interface                         │
└─────────────────────────────────────────────────────────────┘
```

**Rules:**

- Files in `src/core/` do not import `react`, `react-dom`, CSS, Tailwind, or shadcn/ui.
- `src/core/` contains only pure TypeScript functions/classes; external dependencies are injected as arguments where practical.
- The UI layer (`src/popup/`) calls Core functions to process data and is responsible only for rendering the result.
- The Background layer (`src/background/`) uses Core directly and communicates with the popup only via messages.

**Dependency direction:**

```
UI (popup) ──► Core ◄── Background
     │                       │
     └───── Messages ────────┘
```

### 4.2 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (MV3)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────┐     Messages      ┌──────────────┐  │
│  │     Popup (React)     │ ◄───────────────► │  Background  │  │
│  │                       │                    │  Service     │  │
│  │  ┌─────────────────┐  │  unlock/lock/     │  Worker      │  │
│  │  │  Unlock Page    │  │  getStatus        │              │  │
│  │  ├─────────────────┤  │                    │  - Session   │  │
│  │  │  Main Page      │  │                    │    mgmt      │  │
│  │  │  (OTP List)     │  │                    │  - Key held  │  │
│  │  ├─────────────────┤  │                    │    in memory │  │
│  │  │  Add OTP Page   │  │                    └──────────────┘  │
│  │  ├─────────────────┤  │                    ┌──────────────┐  │
│  │  │  Edit OTP Page  │  │                    │   Storage    │  │
│  │  ├─────────────────┤  │                    │              │  │
│  │  │  Settings Page  │  │ ──────────────────►│  chrome.     │  │
│  │  └─────────────────┘  │   encrypt/decrypt  │  storage.    │  │
│  └───────────────────────┘                    │  local       │  │
│                                               └──────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Core Modules                           │  │
│  │  crypto | storage | otp | qr | migration | backup        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Popup opens** → sends `getStatus` to Background → checks lock state
2. **Unlock** → enter password → sends `unlock` → derive key via PBKDF2 → hold key in memory
3. **Load OTP** → read encrypted data from Storage → decrypt with the session key → render in UI
4. **Save OTP** → encrypt data → save to Storage
5. **Lock** → sends `lock` → remove key from memory

## 5. Directory Structure

All file names use **kebab-case**.

```
gw-otp/
├─ docs/
│  ├─ design.md
│  └─ privacy-policy.md
├─ public/
│  └─ icons/                    # Extension icons (16, 48, 128px)
├─ src/
│  ├─ background/
│  │  └─ index.ts               # Service Worker entry point
│  ├─ popup/
│  │  ├─ index.html             # Popup HTML entry point
│  │  ├─ main.tsx               # React mount
│  │  ├─ app.tsx                # App component (routing)
│  │  ├─ i18n/                  # Internationalization (en/ko)
│  │  ├─ pages/
│  │  │  ├─ unlock-page.tsx     # Master password entry/setup
│  │  │  ├─ main-page.tsx       # OTP list (main screen)
│  │  │  ├─ add-otp-page.tsx    # Add OTP (manual/QR/URI/capture)
│  │  │  ├─ edit-otp-page.tsx   # Edit OTP
│  │  │  └─ settings-page.tsx   # Settings (privacy, backup, tags, password)
│  │  └─ components/
│  │     ├─ otp-card.tsx        # Individual OTP card
│  │     ├─ otp-list.tsx        # Reorderable OTP list
│  │     ├─ tag-filter.tsx      # Tag filter bar
│  │     ├─ search-bar.tsx      # Search input
│  │     └─ countdown-bar.tsx   # TOTP countdown progress
│  ├─ core/
│  │  ├─ crypto.ts              # Encryption/decryption utilities
│  │  ├─ storage.ts             # Storage CRUD layer
│  │  ├─ otp.ts                 # TOTP/HOTP generation, verification, URI parsing
│  │  ├─ qr.ts                  # QR code encoding/decoding
│  │  ├─ migration.ts           # Google Authenticator migration URI parsing
│  │  └─ backup.ts              # Export/import
│  └─ types/
│     └─ index.ts               # Shared type definitions
├─ tests/
│  ├─ core/
│  │  ├─ crypto.test.ts
│  │  ├─ storage.test.ts
│  │  ├─ otp.test.ts
│  │  ├─ migration.test.ts
│  │  └─ backup.test.ts
│  └─ background/
│     └─ session.test.ts
├─ manifest.json                # Chrome Extension Manifest V3
├─ vite.config.ts
├─ vitest.config.ts
├─ tsconfig.json
└─ package.json
```

## 6. Data Model

### 6.1 OTPEntry

```typescript
interface OTPEntry {
  /** Unique identifier (UUID v4) */
  id: string;
  /** OTP type (optional, default 'totp') */
  type?: 'totp' | 'hotp';
  /** Service provider name (e.g. Google, GitHub) */
  issuer: string;
  /** Account identifier (e.g. hello@gmail.com) */
  label: string;
  /** Encrypted secret key (Base64-encoded) */
  encryptedSecret: string;
  /** List of assigned tag IDs */
  tags: string[];
  /** HMAC algorithm */
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  /** Number of OTP digits */
  digits: 6 | 8;
  /** Refresh period (seconds, TOTP only) */
  period: number;
  /** HOTP counter (HOTP only, default 0) */
  counter?: number;
  /** Whether pinned to the top (optional, default false) */
  pinned?: boolean;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Update timestamp (ISO 8601) */
  updatedAt: string;
}
```

### 6.2 Tag

```typescript
interface Tag {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Tag display name */
  name: string;
  /** Tag color (hex) */
  color: string;
}
```

### 6.3 Settings

```typescript
interface Settings {
  /** Show OTP codes only on hover */
  hideCodesUntilHover: boolean;
  /** Theme setting */
  theme: 'light' | 'dark' | 'system';
  /** Auto-lock delay (minutes). 0 = immediately on popup close, 'never' = manual only */
  autoLockMinutes: 0 | 1 | 5 | 10 | 15 | 30 | 'never';
  /** UI language */
  language: 'en' | 'ko';
  /** Ciphertext used to verify the master password (Base64) */
  passwordHash: string;
  /** PBKDF2 salt (Base64) */
  salt: string;
}
```

### 6.4 Storage Schema

```typescript
interface StorageSchema {
  /** Settings */
  settings: Settings;
  /** List of OTP entries */
  entries: OTPEntry[];
  /** List of tags */
  tags: Tag[];
  /** OTP display order (array of entry IDs) */
  order: string[];
}
```

## 7. Component Tree and Page Structure

```
App
├─ UnlockPage              (when locked)
│  ├─ Password entry form
│  └─ First-time setup form (create + confirm password)
│
└─ (after unlock)
   ├─ MainPage             (default screen)
   │  ├─ Header
   │  │  ├─ Add button
   │  │  ├─ Settings button
   │  │  └─ Lock button
   │  ├─ SearchBar
   │  ├─ TagFilter         (tag filter bar)
   │  └─ OTPList           (reorderable)
   │     └─ OTPCard[]
   │        ├─ issuer display
   │        ├─ label/id display
   │        ├─ OTP code (optional hover masking)
   │        ├─ CountdownBar (TOTP) / counter icon (HOTP)
   │        ├─ reorder controls + drag handle
   │        └─ pin / QR / edit / delete actions
   │
   ├─ AddOTPPage           (add OTP)
   │  ├─ Tabs: Manual | URI paste | QR upload | Screen capture
   │  ├─ Input form (issuer, label, secret, algorithm, digits, period)
   │  └─ Tag selection
   │
   ├─ EditOTPPage          (edit OTP)
   │  ├─ Edit form prefilled with existing values
   │  └─ Save/Cancel buttons
   │
   └─ SettingsPage         (settings)
      ├─ Theme: light / dark / system
      ├─ Language: en / ko
      ├─ Auto-lock delay
      ├─ Privacy: hover-masking toggle
      ├─ Tag management (add/delete)
      ├─ Change password
      └─ Export / Import
```

### Page Navigation

The popup uses simple state-based routing (managed with state, no React Router).

```typescript
type Page = 'unlock' | 'main' | 'add' | 'edit' | 'settings';
```

## 8. Background ↔ Popup Message Protocol

Message-based communication using `chrome.runtime.sendMessage` /
`chrome.runtime.onMessage`.

### Message Type Definitions

```typescript
/** Popup → Background request */
type MessageRequest =
  | { type: 'unlock'; password: string }
  | { type: 'lock' }
  | { type: 'getStatus' }
  | { type: 'getKey' }
  | { type: 'resetTimer' }
  | { type: 'changePassword'; currentPassword: string; newPassword: string };

/** Background → Popup response */
type MessageResponse =
  | { type: 'unlock'; success: boolean; error?: string }
  | { type: 'lock'; success: boolean }
  | { type: 'getStatus'; isUnlocked: boolean; isInitialized: boolean }
  | { type: 'getKey'; key: string | null }
  | { type: 'changePassword'; success: boolean; error?: string; newKey?: CryptoKey };
```

### Message Flow

| Message          | Description                          | Request                                 | Response                        |
| ---------------- | ------------------------------------ | --------------------------------------- | ------------------------------- |
| `unlock`         | Unlock with the master password      | `{ type: 'unlock', password }`          | `{ success, error? }`           |
| `lock`           | Manual lock                          | `{ type: 'lock' }`                      | `{ success }`                   |
| `getStatus`      | Query the current lock state         | `{ type: 'getStatus' }`                 | `{ isUnlocked, isInitialized }` |
| `getKey`         | Request the decryption key           | `{ type: 'getKey' }`                    | `{ key }`                       |
| `resetTimer`     | Reset the auto-lock timer            | `{ type: 'resetTimer' }`                | `{ success }`                   |
| `changePassword` | Change the master password           | `{ type: 'changePassword', ... }`       | `{ success, error?, newKey? }`  |

### State Transitions

```
[Not initialized] ──(set password for the first time)──► [Locked]
[Locked] ──(unlock success)──► [Unlocked]
[Unlocked] ──(lock / auto-lock / SW termination)──► [Locked]
```

## 9. Encryption Flow

### 9.1 Key Derivation (PBKDF2)

```
master password + salt
       │
       ▼
  PBKDF2-SHA256
  (iterations: 600,000)
       │
       ▼
  256-bit AES-GCM Key
```

### 9.2 Encryption (AES-GCM)

```
plaintext (secret) + AES Key + random IV (12 bytes)
       │
       ▼
  AES-256-GCM Encrypt
       │
       ▼
  Base64(IV + ciphertext + authTag)
```

### 9.3 Decryption

```
Base64-encoded data → IV(12) | ciphertext | authTag(16)
       │
       ▼
  AES-256-GCM Decrypt (with Key + IV)
       │
       ▼
  plaintext (secret)
```

### 9.4 Password Verification

When setting the password for the first time:

1. Generate a random salt (16 bytes)
2. Derive a key via PBKDF2
3. Encrypt a fixed verification string ("gw-otp-verify") and store it as `passwordHash`
4. Store the salt in Settings

When unlocking:

1. Derive a key from the entered password + stored salt
2. Attempt to decrypt `passwordHash`
3. If the result is "gw-otp-verify", the password is correct → hold the key in Background memory

## 10. Storage Strategy

Data is stored in `chrome.storage.local` under logical keys. `chrome.storage.local`
has a generous quota (~5 MB by default), so a single quota is not a practical
concern for typical usage. Entries are still split into chunks to bound the size
of individual stored values and to preserve a stable data layout.

```
storage keys:
  "settings"    → Settings object
  "tags"        → Tag[] array
  "order"       → string[] (ID order array)
  "entries_0"   → OTPEntry[] (chunk 0, up to ~7KB)
  "entries_1"   → OTPEntry[] (chunk 1)
  ...
  "entries_N"   → OTPEntry[] (chunk N)
```

### Chunk-splitting logic

```typescript
const CHUNK_MAX_BYTES = 7000; // bytes

function splitEntriesIntoChunks(entries: OTPEntry[]): OTPEntry[][] {
  const chunks: OTPEntry[][] = [];
  let currentChunk: OTPEntry[] = [];
  let currentSize = 0;

  for (const entry of entries) {
    const entrySize = JSON.stringify(entry).length * 2; // UTF-16 estimate
    if (currentSize + entrySize > CHUNK_MAX_BYTES && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(entry);
    currentSize += entrySize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

## 11. Security Model

### 11.1 Session Lifecycle

| State           | Condition                               | Key location         |
| --------------- | --------------------------------------- | -------------------- |
| Not initialized | First run, no password set              | None                 |
| Locked          | Password set, not authenticated         | None                 |
| Unlocked        | Password verified                       | Background SW memory |

The session key may also be temporarily persisted in `chrome.storage.session`
(cleared when the browser closes) to survive Service Worker restarts, unless
`autoLockMinutes` is 0.

### 11.2 Auto-lock

- **Service Worker termination**: when Chrome terminates an idle Service Worker, the in-memory key is discarded → locked.
- **Browser shutdown**: the key is discarded the same way.
- **Timed auto-lock**: a `chrome.alarms` alarm locks the session after the configured delay.

### 11.3 Manual Lock

- Click the lock button in the popup header → `lock` message → Background removes the key.
- Immediately switches to the Unlock screen.

### 11.4 Security Considerations

- Secrets are **always stored encrypted** in storage.
- The decryption key exists **only in memory** (never persisted to disk in plaintext).
- PBKDF2 with 600,000 iterations for brute-force resistance.
- A new random IV is used for each encryption (same plaintext yields different ciphertext).
- Integrity is verified via the `authTag` (tamper detection).
- All data is stored locally and is never synced or transmitted off-device.

## 12. OTP Card UI

### Card Layout

```
┌─────────────────────────────────────────────────┐
│ ⠿  │  Google                        ✏️  🗑️  │
│    │  hello@gmail.com                         │
│    │                                          │
│    │  1 2 3  4 5 6        (or ••••••)         │
│    │  ◐ 15                                    │
└─────────────────────────────────────────────────┘
  │       │         │              │
  │       │         │              └─ countdown + remaining seconds
  │       │         └─ OTP code (click to copy)
  │       └─ issuer + label
  └─ drag handle
```

### Interactions

| Action                          | Behavior                          |
| ------------------------------- | --------------------------------- |
| Click OTP code                  | Copy to clipboard + "copied" state |
| Grab drag handle and drag       | Reorder                           |
| Click edit icon (✏️)            | Navigate to EditOTPPage           |
| Click delete icon (🗑️)          | Confirmation dialog → delete      |
| Mouse hover (privacy ON)        | `••••••` → show the real code     |
| HOTP: next-code button          | Increment the counter and refresh |

### OTP Code Refresh

- TOTP: computes remaining time each second: `period - (currentTime % period)`; a new code is generated when it reaches 0.
- HOTP: refreshed only when the counter changes.
- CountdownBar shows the remaining ratio as an SVG circular progress indicator.

## 13. Theme System

### Theme Options

| Option   | Behavior                                          |
| -------- | ------------------------------------------------- |
| `light`  | Always light mode                                 |
| `dark`   | Always dark mode                                  |
| `system` | Follow the OS setting (`prefers-color-scheme`)    |

### Implementation

Uses Tailwind CSS's class-based dark mode strategy. The App loads the saved
theme, applies the `dark` class on the `<html>` element as needed, and listens
for `prefers-color-scheme` changes when the theme is `system`. shadcn/ui's
CSS-variable-based theming is defined in `globals.css`. The selection is applied
immediately and saved to `chrome.storage.local`.

## 14. QR Recognition Flow

### 14.1 Image Upload

```
User selects a file (input[type=file])
       │
       ▼
  FileReader → DataURL
       │
       ▼
  Image → Canvas (drawImage)
       │
       ▼
  canvas.getImageData()
       │
       ▼
  jsQR(imageData.data, width, height)
       │
       ▼
  QR data (otpauth:// or otpauth-migration:// URI)
       │
       ▼
  parseOTPAuthURI() / parseMigrationURI() → fill entry fields
```

### 14.2 Screen Capture

```
User clicks the "Screen capture" button
       │
       ▼
  chrome.tabs.captureVisibleTab() → DataURL
       │
       ▼
  Image → Canvas → getImageData()
       │
       ▼
  jsQR() → search for a QR code
       │
       ├─ QR found → parse URI → fill the form
       └─ QR not found → error message "No QR code could be found."
```

### Required Permissions

- `activeTab`: required to capture the current tab.
- The permission is only active at the moment the user clicks the button in the popup.

## 15. Export/Import Format

### File Extension

`.gw-otp`

### File Structure

```typescript
interface BackupFile {
  /** File format version */
  version: 1;
  /** Creation timestamp (ISO 8601) */
  exportedAt: string;
  /** PBKDF2 salt (Base64, backup-specific) */
  salt: string;
  /** Encrypted data (Base64) */
  encryptedData: string;
}
```

### Export Flow

```
1. Prompt the user for an export password
2. Decrypt the secret of every OTP entry
3. Serialize the full data as JSON in plaintext
   { entries: OTPEntry[], tags: Tag[], order: string[] }
4. Derive a new salt + PBKDF2 key from the export password
5. Encrypt with AES-GCM
6. Build a BackupFile JSON structure
7. Blob → URL.createObjectURL → download
```

### Import Flow

```
1. Upload a file (input[type=file], accept=".gw-otp")
2. Parse JSON → check the version
3. Prompt for the password used at export time
4. Derive the key from the salt + password
5. Decrypt encryptedData
6. Merge or replace the decrypted entries/tags/order into current storage
   - merge: skip entries with a duplicate ID, append new ones
   - replace: overwrite everything
7. Re-encrypt with the current master password and save
```

## 16. Testing Strategy

### Test Framework

- **Vitest**: unit and integration tests
- **Environment**: `jsdom` (when DOM APIs are needed)
- **Web Crypto**: provided by the runtime; `chrome.*` APIs are mocked in `tests/setup.ts`

### Test Coverage

| Module    | Test file                          | Key test cases                                          |
| --------- | ---------------------------------- | ------------------------------------------------------- |
| crypto    | `tests/core/crypto.test.ts`        | encrypt/decrypt round-trip, wrong-password failure, salt uniqueness |
| storage   | `tests/core/storage.test.ts`       | CRUD, order management, chunk splitting, delete consistency |
| otp       | `tests/core/otp.test.ts`           | TOTP/HOTP generation & verification, URI parsing, remaining time |
| migration | `tests/core/migration.test.ts`     | Google Authenticator migration URI parsing              |
| backup    | `tests/core/backup.test.ts`        | export→import round-trip, version validation            |
| session   | `tests/background/session.test.ts` | lock/unlock transitions, key hold/removal               |

### Mock Strategy

- `chrome.storage.local`: mocked with an in-memory object
- `chrome.runtime.sendMessage`: mocked by calling the handler directly
- `chrome.tabs.captureVisibleTab`: mocked to return a DataURL

### Running

```bash
# All tests
pnpm test

# A specific file
pnpm test tests/core/crypto.test.ts

# Watch mode (during development)
pnpm test:watch
```

## 17. Manifest Configuration

```json
{
  "manifest_version": 3,
  "name": "GW-OTP",
  "version": "1.0.0",
  "description": "Manage TOTP/HOTP authentication codes locally, encrypted with your master password.",
  "permissions": ["storage", "activeTab", "alarms"],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

> Notes:
> - Icons live in `public/icons/` in the source tree; because Vite copies the
>   `public/` directory to the build root, they are referenced at runtime as
>   `icons/icon-*.png`.
> - `clipboardWrite` is not required because copying uses the async
>   `navigator.clipboard` API from the popup context.
