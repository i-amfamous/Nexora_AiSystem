/*
 * Nexora desktop shell (Electron).
 *
 * This wrapper deliberately contains no business logic and no database. It loads
 * the single, backend-served web frontend from PUBLIC_URL so Windows, macOS and
 * browser clients all use the same central workspace.
 */
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');

const DEFAULT_PUBLIC_URL = 'http://localhost:4000';
const PUBLIC_URL_ARG = '--public-url=';
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function resolvePublicUrl() {
  const arg = process.argv.find((value) => value.startsWith(PUBLIC_URL_ARG));
  const candidate = (arg && arg.slice(PUBLIC_URL_ARG.length)) || process.env.PUBLIC_URL || DEFAULT_PUBLIC_URL;
  try {
    const url = new URL(candidate);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) throw new Error('unsupported protocol');
    return url.toString();
  } catch {
    console.warn(`[Nexora] Ignoring invalid PUBLIC_URL "${candidate}"; using ${DEFAULT_PUBLIC_URL}`);
    return DEFAULT_PUBLIC_URL;
  }
}

const publicUrl = resolvePublicUrl();
const publicOrigin = new URL(publicUrl).origin;

/** Only absolute http(s) URLs are allowed to leave the app via the OS browser. */
function isAllowedExternal(value) {
  try {
    const url = new URL(String(value));
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function isSameOrigin(value) {
  try {
    return new URL(String(value)).origin === publicOrigin;
  } catch {
    return false;
  }
}

function openExternally(value) {
  if (!isAllowedExternal(value)) {
    console.warn(`[Nexora] Blocked external URL: ${String(value).slice(0, 200)}`);
    return false;
  }
  shell.openExternal(String(value)).catch((error) => console.error('[Nexora] openExternal failed', error));
  return true;
}

function senderIsApp(event) {
  try {
    return new URL(String(event.senderFrame?.url || '')).origin === publicOrigin;
  } catch {
    return false;
  }
}

let mainWindow = null;

function updateMenu() {
  const webContents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
  const isDev = process.argv.includes('--dev');
  const modifier = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';

  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reload backend UI', role: 'reload', accelerator: `${modifier}+R` },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Back', role: 'back', accelerator: process.platform === 'darwin' ? 'Cmd+[' : 'Alt+Left', enabled: Boolean(webContents && webContents.canGoBack()) },
        { label: 'Forward', role: 'forward', accelerator: process.platform === 'darwin' ? 'Cmd+]' : 'Alt+Right', enabled: Boolean(webContents && webContents.canGoForward()) },
        { type: 'separator' },
        { label: 'Reload', role: 'reload' },
        { label: 'Force Reload', role: 'forceReload', accelerator: `${modifier}+Shift+R` },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : [])
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Nexora API documentation', click: () => openExternally(new URL('/openapi.json', publicUrl).toString()) }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Nexora',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#f7f8f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    updateMenu();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isSameOrigin(url)) {
      event.preventDefault();
      openExternally(url);
    }
  });
  for (const eventName of ['did-navigate', 'did-navigate-in-page', 'did-finish-load']) {
    mainWindow.webContents.on(eventName, updateMenu);
  }

  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.loadURL(publicUrl).catch((error) => {
    console.error('[Nexora] Could not load the central backend UI', error);
    dialog.showErrorBox(
      'Nexora backend unavailable',
      `The shared Nexora frontend could not be loaded from ${publicUrl}.\nStart the backend (npm start) or set PUBLIC_URL to your Nexora server, then reload.`
    );
  });
  updateMenu();
}

/* IPC is a narrow, origin-checked bridge; preload.js documents the allowlist. */
ipcMain.handle('nexora:config', (event) => (senderIsApp(event) ? { publicUrl, platform: process.platform } : null));
ipcMain.handle('nexora:open-external', (event, url) => (senderIsApp(event) ? openExternally(url) : false));
ipcMain.handle('nexora:notify', (event, options) => {
  if (!senderIsApp(event) || !Notification.isSupported()) return false;
  const title = String(options && options.title ? options.title : 'Nexora').slice(0, 120);
  const body = String(options && options.body ? options.body : '').slice(0, 300);
  new Notification({ title, body }).show();
  return true;
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('web-contents-created', (_event, webContents) => {
    webContents.setWindowOpenHandler(({ url }) => {
      openExternally(url);
      return { action: 'deny' };
    });
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
