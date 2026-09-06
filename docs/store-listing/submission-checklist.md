# Chrome Web Store — Submission Checklist

Use this checklist to publish GW-OTP. Items marked ✅ are already prepared in
this repository; items marked ⬜ require manual action outside the codebase.

## 1. Build the package

```bash
pnpm install
pnpm icons     # regenerate icons from icons-src/icon.svg (only if the SVG changed)
pnpm build     # produces dist/
pnpm package   # produces gw-otp-<version>.zip at the project root
```

- ✅ Production build runs clean (`dist/` contains manifest at root, `icons/`, `assets/`, `src/popup/index.html`).
- ✅ No source maps, no `.svg`, no duplicate icon folders in `dist/`.
- ✅ `gw-otp-1.0.0.zip` has the manifest at the archive root (required by the store).

## 2. Extension package facts

- ✅ Manifest V3, name **GW-OTP**, version **1.0.0** (matches `package.json`).
- ✅ Permissions minimized to `storage`, `activeTab`, `alarms` (no host permissions, no remote code).
- ✅ Short description within 132 characters.
- ✅ Icons 16/48/128 present and referenced as `icons/icon-*.png`.

## 3. Smoke test before uploading

Load the unpacked build and verify core flows:

- ⬜ `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`.
- ⬜ New icon appears in the toolbar and on the extensions page (all sizes crisp).
- ⬜ First run: set a master password; unlock works.
- ⬜ Add an OTP (manual + `otpauth://` URI); code generates and counts down.
- ⬜ Copy code (clipboard works without the `clipboardWrite` permission).
- ⬜ Screen capture button scans an on-screen QR (activeTab).
- ⬜ Auto-lock fires after the configured delay (alarms); manual lock works.
- ⬜ Export/import round-trips a `.gw-otp` file.
- ⬜ Data persists across popup reopen and is **not** synced to other devices (local-only).

## 4. Privacy policy hosting (required)

The store requires a public privacy policy URL.

- ✅ Policy written at `docs/privacy-policy.md` (includes the warranty/liability disclaimer).
- ⬜ Publish it publicly. Simplest option with this repo:
  1. Push the repository to GitHub (public).
  2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
  3. Branch: `main`, folder: `/docs`. Save.
  4. The policy will be available at
     `https://<user>.github.io/<repo>/privacy-policy` (GitHub Pages renders the Markdown).
- ⬜ Update the placeholder repository URL (`github.com/goldworm/gw-otp`) in
  `docs/privacy-policy.md` and `docs/store-listing/data-usage-disclosure.md` to
  the real repository once known.

## 5. Store listing content

- ✅ Listing copy prepared in `docs/store-listing/listing-copy.md` (name, short + detailed description, category, languages).
- ⬜ Capture 3–5 screenshots at 1280×800 (see `listing-copy.md` for a shot list) and save under `docs/store-listing/screenshots/`.
- ⬜ (Optional) Create promo tiles (440×280, 1400×560).

## 6. Privacy practices form (dashboard)

- ✅ Answers prepared in `docs/store-listing/data-usage-disclosure.md`.
- ⬜ In the dashboard, enter the single-purpose statement, per-permission justifications, and mark all data categories as **not collected**.
- ⬜ Check the three required data-use certifications.
- ⬜ Paste the published privacy policy URL.

## 7. Account & upload

- ⬜ Have a Chrome Web Store developer account (one-time registration fee applies).
- ⬜ Upload `gw-otp-1.0.0.zip`.
- ⬜ Fill in the listing (copy + screenshots + icon) and privacy practices.
- ⬜ Submit for review.

## 8. Repository publication (open source)

- ✅ MIT `LICENSE` present; `package.json` has `license`/`author`.
- ✅ No secrets or credentials tracked in the repo.
- ⬜ Push to a public GitHub repository.
