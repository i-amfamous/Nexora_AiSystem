# Nexora desktop wrapper

A thin Electron shell for the **same** Nexora web application served by the central backend. It does not copy `interface/` and does not open a second database: it loads `PUBLIC_URL` (default `http://localhost:4000`), so Windows, macOS and browser clients share one workspace, one set of business records and one permission model.

## Run and build

From the repository root after `npm ci`:

```bash
npm run desktop:dev          # start the backend first, then the Electron window
npm run desktop:build:win    # NSIS installer in desktop/dist/
npm run desktop:build:mac    # .dmg and .zip in desktop/dist/
```

Or work standalone inside `desktop/`:

```bash
npm install                  # installs the pinned Electron toolchain locally
npm run dev
npm run build:win
npm run build:mac
```

Set `PUBLIC_URL` (or pass `--public-url=https://nexora.example.com`) to point at a hosted backend. The window uses the native title bar/menu, remembers the backend session in the Electron profile, supports back/forward/reload from the View menu, and restores/focuses a single instance. Links that leave the app are opened in the OS browser only when they are absolute `http:`/`https:` URLs; in-page navigation to another origin is redirected the same way. `preload.js` documents the complete renderer allowlist (config, openExternal, notify) — no Node.js, filesystem, database or arbitrary shell access is exposed.

Unsigned local builds remain the default: no certificate, password or Apple credential is stored in this repository. Auto-update is not wired yet. Desktop notifications use the OS notification centre where available.

## Production signing

Signing and notarisation are opt-in and supplied only through environment variables (inject them from CI secrets — never commit certificates, passwords or API keys). The `build` config intentionally leaves the Windows `certificateFile`/`certificatePassword` fields empty so electron-builder falls back to its standard environment lookups.

**Windows (`npm run build:win`)**

- `CSC_LINK` — path, `file://` URL, or base64-encoded `.pfx`/`.p12` certificate. `WIN_CSC_LINK` is the Windows-specific equivalent and takes precedence.
- `CSC_KEY_PASSWORD` — certificate password; `WIN_CSC_KEY_PASSWORD` is the Windows-specific equivalent.
- electron-builder maps these to the effective `certificateFile`/`certificatePassword`. With none set, the NSIS installer is simply unsigned.

**macOS (`npm run build:mac`)**

- Hardened runtime is enabled in the build config (`hardenedRuntime: true`).
- If the organisation uses custom entitlements, place `build/entitlements.mac.plist` (and `build/entitlements.mac.inherit.plist` for helpers) in `desktop/`. electron-builder detects those files when present; otherwise it uses its bundled template. No path to a missing file is hardcoded.
- Signing identity comes from `CSC_LINK` and `CSC_KEY_PASSWORD`, or an identity already in the keychain (`CSC_NAME`).
- Notarisation requires `APPLE_ID`, `APPLE_TEAM_ID` and `APPLE_APP_SPECIFIC_PASSWORD`. The recommended alternative is `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`. No Apple credentials appear in `package.json`.
