# GW-OTP

A Chrome extension for managing OTP (TOTP/HOTP) authentication codes. All data
is encrypted with your master password and stored **locally on your device** —
nothing is ever synced to the cloud or sent to any server.

## Features

- **Add OTP**: manual entry, paste an `otpauth://` URI, upload a QR image, or capture the screen
- **Google Authenticator import**: parse `otpauth-migration://` URIs to import multiple accounts at once
- **Manage**: edit, delete, drag-and-drop reordering, pin-to-top
- **Tags & search**: tag-based grouping, filter by issuer/label/tag name
- **Security**: master-password-based AES-256-GCM encryption, session-based lock + auto-lock + manual lock
- **Convenience**: click-to-copy, circular countdown, export/import (`.gw-otp`)
- **Privacy**: option to reveal OTP codes only on hover
- **Theme**: light / dark / system
- **i18n**: English / Korean

## Tech Stack

- React 19, TypeScript, Vite
- @crxjs/vite-plugin (Chrome Extension MV3 build)
- Tailwind CSS v4 + shadcn/ui
- otplib (TOTP/HOTP generation)
- jsQR (QR decoding), qrcode (QR encoding)
- Web Crypto API (PBKDF2 + AES-GCM)
- Vitest (unit tests)

## Getting Started

```bash
# Install dependencies
pnpm install

# Dev server (HMR)
pnpm dev

# Build
pnpm build

# Test
pnpm test

# Test (watch mode)
pnpm test:watch
```

## Load in Chrome

1. Run `pnpm build`
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist` folder

During development, run `pnpm dev` to test the extension with HMR applied.

## Project Structure

```
src/
├─ background/       # Service Worker (session management)
├─ core/             # Business logic (UI-agnostic, pure TypeScript)
│  ├─ crypto.ts      # Encryption/decryption (PBKDF2 + AES-GCM)
│  ├─ storage.ts     # chrome.storage.local CRUD + chunk splitting
│  ├─ otp.ts         # TOTP/HOTP generation, verification, URI parsing
│  ├─ qr.ts          # QR code encoding/decoding
│  ├─ migration.ts   # Google Authenticator migration URI parsing
│  └─ backup.ts      # Export/import
├─ popup/            # React UI
│  ├─ components/    # Shared components
│  ├─ pages/         # Page components
│  ├─ i18n/          # Internationalization (en/ko)
│  └─ lib/           # Utilities
└─ types/            # Shared type definitions
tests/               # Vitest unit tests
docs/                # Design and policy documents
```

## Architecture

The Core layer and the UI layer are kept separate, so the business logic can be
reused even if the UI framework changes.

```
UI (popup) ──► Core ◄── Background
     │                       │
     └───── Messages ────────┘
```

## Data Storage & Privacy

All OTP secrets, tags, settings, and ordering are stored in
`chrome.storage.local`, which never leaves the device. OTP secrets are always
stored encrypted (AES-256-GCM) using a key derived from your master password
(PBKDF2, 600,000 iterations). The decryption key exists only in memory and is
discarded when the session locks. See [docs/privacy-policy.md](docs/privacy-policy.md).

## Contributing

Contributions are welcome. Please open an issue or a pull request. Code comments
and documentation are written in English.

## License

Released under the [MIT License](LICENSE).
