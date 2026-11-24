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

Code signing and notarisation are **not** configured: building unsigned installers without the organisation's certificates is expected, and auto-update is not wired yet. Desktop notifications use the OS notification centre where available.
