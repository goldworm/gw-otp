# Chrome Web Store — Data Usage Disclosure (Submission Notes)

This document contains the answers to fill into the Chrome Web Store Developer
Dashboard under **Privacy practices**. It is a submission aid and is not shipped
in the extension package.

---

## Single purpose

> A single, narrowly-scoped purpose statement is required.

**Single purpose:** GW-OTP generates and manages time-based (TOTP) and
counter-based (HOTP) one-time passwords locally on the user's device, so users
can view and copy their two-factor authentication codes.

---

## Permission justifications

Fill each field with the matching justification.

- **`storage`**
  > Used to save the user's OTP entries, tags, and settings on the user's own device via `chrome.storage.local`. Required for the extension to remember the user's accounts between sessions. No data is transmitted off the device.

- **`activeTab`**
  > Used only when the user explicitly clicks the "Screen capture" button, to capture the currently visible tab so an on-screen QR code can be scanned and imported. No page content is accessed at any other time.

- **`alarms`**
  > Used to schedule the auto-lock timer that re-locks the encrypted vault after a user-configured period of inactivity, protecting the user's secrets.

- **Host permissions:** None requested.
- **Remote code:** No. The extension does not load or execute any remote code; all code is bundled in the package.

---

## Data collection disclosure

For each Chrome Web Store data category, declare whether it is collected.
GW-OTP does **not** collect or transmit any user data. Mark every category as
**not collected**:

| Data category                          | Collected? |
| -------------------------------------- | ---------- |
| Personally identifiable information    | No         |
| Health information                     | No         |
| Financial and payment information      | No         |
| Authentication information             | No (stored locally, encrypted, never transmitted) |
| Personal communications                | No         |
| Location                               | No         |
| Web history                            | No         |
| User activity                          | No         |
| Website content                        | No         |

> Note on "Authentication information": OTP secrets are authentication-related
> data, but they are stored **only on the user's device**, encrypted with the
> user's master password, and are **never sent to the developer or any third
> party**. Under the Chrome Web Store definition, data that never leaves the
> user's device is not "collected."

---

## Required certifications (check all)

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Privacy policy URL

A public privacy policy URL is required. Host `docs/privacy-policy.md` and enter
its public URL here. See `docs/store-listing/submission-checklist.md` for
hosting instructions.

Example (update to the real published URL):
`https://goldworm.github.io/gw-otp/privacy-policy`
