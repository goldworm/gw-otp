# Privacy Policy for GW-OTP

_Last updated: September 6, 2026_

GW-OTP ("the extension") is a browser extension for managing OTP (TOTP/HOTP)
authentication codes. This policy explains what data the extension handles and
how it is protected.

## Summary

- The extension stores all of your data **locally on your device only**.
- **No data is ever transmitted** to the developer, to any server, or to any third party.
- OTP secrets are stored **encrypted** and can only be decrypted with your master password.

## Data We Handle

The extension stores the following data locally, using the browser's
`chrome.storage.local` API:

- **OTP secrets**: the shared secret keys used to generate authentication codes. These are always stored **encrypted** (AES-256-GCM).
- **Account metadata**: issuer names, account labels, tags, and display order that you enter to organize your entries.
- **Settings**: your preferences such as theme, language, auto-lock delay, and hover-masking, along with a password-verification value and a cryptographic salt.

We do **not** collect, store, or process any of the following:

- Personal identity information (name, email, address, phone number)
- Browsing history or website content
- Analytics, telemetry, usage tracking, or advertising identifiers

## How Your Data Is Used

All data is used solely to provide the extension's core functionality on your
own device: generating OTP codes, organizing entries, and locking/unlocking the
vault. The data is never used for any other purpose.

## Data Storage and Security

- **Local-only storage**: Data is stored in `chrome.storage.local`, which resides on your device. It is not synced to the cloud and is not sent to any external service.
- **Encryption**: OTP secrets are encrypted using AES-256-GCM. The encryption key is derived from your master password using PBKDF2 (600,000 iterations, SHA-256).
- **Key handling**: The decryption key exists only in memory while the vault is unlocked and is discarded when the extension locks (manually, on auto-lock, or when the browser closes).
- **No transmission**: The extension makes no network requests with your data.

## Permissions

The extension requests the minimum permissions needed for its features:

- **storage**: to save your encrypted OTP entries, tags, and settings locally on your device.
- **activeTab**: to capture the visible tab **only when you explicitly click the "Screen capture" button**, so a QR code on screen can be scanned. No page content is read otherwise.
- **alarms**: to schedule the auto-lock timer that re-locks the vault after a period of inactivity.

## Data Sharing

We do not sell, share, or disclose your data to anyone. Because your data never
leaves your device, there is no data for us to access or transfer.

## Export and Import

You can export your data to an encrypted `.gw-otp` file protected by a password
you choose. Anyone who has this file and its password can decrypt its contents,
so keep exported files secure. Import and export happen entirely on your device.

## Disclaimer of Warranty and Limitation of Liability

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.

To the maximum extent permitted by applicable law, the developer shall **not be
liable for any problems, loss, or damage of any kind** arising out of or in
connection with the use of, or inability to use, the extension. This includes,
without limitation, loss or corruption of data, loss of OTP secrets, inability
to access your accounts, missed or incorrect authentication codes, and any
direct, indirect, incidental, special, consequential, or punitive damages.

You are solely responsible for maintaining your own backups and for keeping your
master password and any exported files secure. Use of the extension is entirely
at your own risk.

This disclaimer is consistent with the terms of the
[MIT License](https://github.com/goldworm/gw-otp/blob/main/LICENSE) under which
the software is distributed.

## Changes to This Policy

This policy may be updated from time to time. Material changes will be reflected
by updating the "Last updated" date above and publishing the revised policy.

## Contact

For questions about this policy, please open an issue on the project's public
repository.
