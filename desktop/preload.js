/*
 * Nexora preload bridge - permissions and allowlist.
 *
 * The renderer is untrusted web content served by the central backend. It runs
 * with contextIsolation, sandbox and webSecurity enabled and nodeIntegration
 * disabled, so it can only call the three APIs below:
 *
 *   1. getConfig()          - returns PUBLIC_URL/platform metadata.
 *   2. openExternal(url)    - only absolute http: or https: URLs are forwarded
 *                            to the OS browser; file:, javascript:, data:,
 *                            custom schemes and relative paths are rejected.
 *   3. notify({title,body}) - asks the main process for an OS notification.
 *
 * There is NO renderer access to Node.js, the filesystem, IPC channels other
 * than the three above, environment secrets, a local database, or shell
 * commands. The main process independently re-checks the sender origin
 * (PUBLIC_URL) and the URL allowlist before performing any action.
 */
const { contextBridge, ipcRenderer } = require('electron');

const desktopApi = Object.freeze({
  getConfig: () => ipcRenderer.invoke('nexora:config'),
  openExternal: (url) => ipcRenderer.invoke('nexora:open-external', url),
  notify: (options) => ipcRenderer.invoke('nexora:notify', {
    title: String((options && options.title) || 'Nexora'),
    body: String((options && options.body) || '')
  })
});

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('nexoraDesktop', desktopApi);
} else {
  // Legacy fallback only; current Electron releases use context isolation.
  window.nexoraDesktop = desktopApi;
}
