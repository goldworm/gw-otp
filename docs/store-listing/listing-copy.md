# Chrome Web Store — Listing Copy & Assets

Ready-to-paste text and asset requirements for the store listing. This is a
submission aid and is not shipped in the extension package.

---

## Basic info

- **Name:** GW-OTP
- **Short description (≤ 132 chars):**
  > Manage TOTP/HOTP authentication codes locally, encrypted with your master password. Nothing is synced to the cloud.
- **Category:** Productivity
- **Default language:** English
- **Additional language:** Korean (the UI supports en/ko)

---

## Detailed description (paste into the store)

```
GW-OTP is a private, local-first authenticator for your two-factor (2FA) codes.

Your OTP secrets never leave your device. Everything is encrypted with a master
password and stored locally — there is no cloud sync, no account, and no server.

FEATURES
• Time-based (TOTP) and counter-based (HOTP) codes
• Add codes by manual entry, otpauth:// URI, QR image upload, or on-screen capture
• Import multiple accounts from a Google Authenticator export (otpauth-migration)
• Organize with tags, search, drag-and-drop ordering, and pin-to-top
• One-click copy and a live countdown for each code
• Optional privacy mode: reveal codes only on hover
• Encrypted export/import (.gw-otp) for your own backups
• Light / dark / system themes
• English and Korean

SECURITY & PRIVACY
• AES-256-GCM encryption with a key derived via PBKDF2 (600,000 iterations)
• The decryption key lives only in memory and is discarded on lock
• Auto-lock after inactivity, plus manual and on-close locking
• No tracking, no analytics, no data transmission

Open source under the MIT License.
```

---

## Screenshots (to be captured manually)

Chrome Web Store requires at least one screenshot; 3–5 are recommended.

- **Dimensions:** 1280×800 (preferred) or 640×400. PNG or JPEG.
- **How to capture:** run `pnpm build`, load `dist` as an unpacked extension
  (`chrome://extensions` → Developer mode → Load unpacked), open the popup, and
  capture each screen. The popup is 380px wide, so place it on an 1280×800
  canvas (e.g. a clean browser window or a solid background) rather than
  cropping tightly.
- **Suggested shots:**
  1. Main list with several OTP entries (countdown visible)
  2. Add OTP page (tabs: Manual / URI / QR / Capture)
  3. Unlock screen
  4. Settings (theme, auto-lock, tags, password change)
  5. Search + tag filtering in action

Save captured images under `docs/store-listing/screenshots/` (this folder is a
submission aid and is not part of the built extension).

---

## Promotional images (optional but recommended)

- **Small promo tile:** 440×280 PNG/JPEG
- **Marquee promo tile:** 1400×560 PNG/JPEG
- Use the new icon's gold-worm-on-navy theme for visual consistency.

---

## Store icon

- The 128×128 store icon is generated from `public/icons/icon.svg`
  (`pnpm icons`) and is already included in the package as
  `public/icons/icon-128.png`.
