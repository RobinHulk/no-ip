# Project Checklist

## Fast Triage

1. Read `memory.md`.
2. Open the newest `artifacts/*.png`.
3. Open the matching `artifacts/*.html`.
4. Identify the last confirmed good state from:
   - URL
   - visible heading
   - console log line

## Stage Checks

### No-IP Login

- Confirm the login page still contains `#username`, `#password`, and `#clogs-captcha-button`.
- If login fails, inspect visible error text before changing selectors.
- If the script remains on `/login`, verify whether credentials, captcha behavior, or page timing changed.

### No-IP 2FA

- Treat `/2fa/verify` as a successful post-login transition.
- Look for `Verify Your Email` and six one-character code inputs.
- Confirm the script returns focus to the No-IP page before entering the code.

### Gmail

- Prefer visible Gmail in a persistent Playwright profile.
- If Gmail opens on an account chooser or sign-in page, let the user complete it manually once.
- Search for No-IP mail with the configured sender text before changing extraction logic.
- Extract a 6-digit code from the opened mail body, not only from subject lines.

### Hostnames Navigation

- Prefer clicks in the authenticated UI over hardcoded URLs.
- If a fallback URL returns `404`, do not assume the session is gone.
- Validate that the final page actually contains hostname-management signals, not generic marketing text.

### Confirmation

- Distinguish:
  - `confirmed`
  - `not-needed`
  - real failure
- If there is no `Confirm` or `Renew` button for the configured hostname, report `not-needed` unless the UI clearly indicates an error.

## Docs To Update After Fixes

- `memory.md` when assumptions, risks, or workflow stages change.
- `README.md` when setup or operator behavior changes.
- `.env.example` only for non-secret variable names and safe defaults.
