---
name: no-ip-ddns-maintainer
description: Maintain, debug, and evolve the No-IP DDNS confirmation automation project that logs into No-IP, handles Gmail-based 2FA, navigates hostnames, and confirms DDNS renewals. Use when Codex needs to work on Playwright automation for this project, diagnose login or 2FA failures, inspect `artifacts/`, adjust selectors after No-IP or Gmail UI changes, review `.playwright-profile` behavior, or update project memory/documentation around this workflow.
---

# No-IP DDNS Maintainer

## Overview

Use this skill to work effectively on the `no-ip` project that automates No-IP DDNS renewal with Playwright and Gmail. Favor fast diagnosis from local evidence before changing selectors or flow assumptions.

## Workflow

1. Read `memory.md`, `README.md`, and `index.js` in the project root to recover the current automation strategy.
2. Inspect the newest files in `artifacts/` before guessing why a run failed.
3. Distinguish which stage is broken:
   - No-IP login
   - No-IP 2FA screen detection
   - Gmail session or inbox search
   - return from Gmail to No-IP
   - navigation to hostnames
   - confirmation result detection
4. Prefer fixing the narrowest broken stage instead of rewriting the whole flow.
5. Re-run the project with the visible browser when debugging UI changes.
6. Update `memory.md` when the workflow, assumptions, or known risks materially change.

## Debugging Priorities

- Treat `artifacts/*.png` and `artifacts/*.html` as the primary source of truth for the last run.
- Check the actual URL after each major step; this project has already seen false positives caused by relying on generic page text.
- Be careful with footer text and marketing copy on No-IP pages; they can contain misleading phrases like `Dynamic DNS`.
- After No-IP login, explicitly recognize `https://www.noip.com/2fa/verify` as a valid intermediate success state.
- When Gmail is involved, prefer the persisted browser profile in `.playwright-profile/` over trying to re-authenticate programmatically.
- When a No-IP route returns `404`, do not assume the session is dead; first try navigating from links inside the authenticated UI.

## Working Rules

- Keep `.env` and `.playwright-profile/` out of version control.
- Never copy real secrets into `.env.example`, `README.md`, `memory.md`, or skill files.
- If you notice previously committed secrets in tracked files, call that out and recommend rotation.
- Preserve the project style: Node.js, CommonJS, Playwright, concise console logging, evidence saved to `artifacts/`.
- Use `apply_patch` for manual file edits.

## Typical Tasks

- Fix selectors after No-IP or Gmail UI changes.
- Improve the 2FA detection logic.
- Adjust Gmail mail-search behavior.
- Harden hostname-page navigation after redirects or `404`s.
- Review why a run ended in `not-needed` versus a true failure.
- Update docs and project memory after a successful fix.

## References

- Read `references/project-checklist.md` when you need a compact stage-by-stage troubleshooting checklist for this automation.
