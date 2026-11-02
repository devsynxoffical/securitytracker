/**
 * Main process entry: window, tray, IPC surface for the renderer (AGENTS.md rule 7) and the OS
 * hooks the shift policy needs (power events, shutdown).
 *
 * Dev-only IPC `dev:simulate` (registered only when COMPANYOS_DEV_SIM === '1'): lets a QA script or
 * Playwright drive the ShiftManager's schedule/policy/closure/reminder state without a server that
 * implements the schedule contract. Payload: { profile?, closure?, state?, reminder? } (see
 * ShiftManager.devSimulate). `revoke: 'suspended' | 'revoked'` runs the FR-SEC-25 wipe; `offline`
 * flips the renderer's network state. Never registered in production builds.
 *
 * Lock-down (docs/08 section 9, FR-SEC-22): downloads cancelled, navigation pinned to the app's own
 * document, no child windows, DevTools off when packaged, context menu limited to Copy/Paste inside
 * inputs. FR-SEC-25: `revokeSession` stops tracking, wipes everything but the device identity and
 * the server address, and sends the renderer back to sign-in.
 */
import { app, shell, session, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, Notification, powerMonitor } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { Store } from './store';
import { DeviceIdentity } from './device';
import { AnchoredClock } from './clock';
import { ApiClient } from './api';
import { AgentClient } from './agent-client';
import { DevTelemetrySource } from './dev-telemetry';
import { ShiftManager } from './shift-manager';
import { RealtimeClient } from './realtime';
import { filterRequestHeaders, isDevToolsShortcut, revokeReasonFromSocket, shouldAllowNavigation, wipeOnRevoke, type RevokeReason } from './lockdown';
import type { TrackerSource } from './tracker-source';

const store = new Store();
const device = new DeviceIdentity(store);
const clock = new AnchoredClock();
const api = new ApiClient(store, device, clock);

/** Production: the C# agent over the named pipe (09). Dev fallback when no pipe exists on this OS. */
function createTracker(): TrackerSource {
  if (process.platform === 'win32' && !process.env.COMPANYOS_DEV_TRACKER) return new AgentClient();
  return new DevTelemetrySource();
}
const tracker = createTracker();
const shifts = new ShiftManager(api, store, clock, tracker);
const realtime = new RealtimeClient(api);

const CHAT_CACHE_PREFIX = 'chat.cache.';
const CHAT_CACHE_LIMIT = 200; // FR-CHAT-14

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#F5F6F3',
    title: 'WorkPulse',
    icon: appIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged, // FR-SEC-22
    },
  });
  lockDown(mainWindow);

  // Started at logon with --hidden (09 §1): stay in the tray until the user opens the window.
  registerWindowSessionEnd(mainWindow);
  mainWindow.on('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow?.show();
  });
  // Links open in the system browser; the app itself never opens a second window (FR-SEC-22).
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:/.test(details.url)) void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // 02 §3 rule 4: closing minimises to tray while a shift is open.
  mainWindow.on('close', (e) => {
    if (quitting) return;
    if (shifts.snapshot().state !== 'OFF_SHIFT') {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/** The document the renderer is allowed to show: the dev server in development, the packaged index.html otherwise. */
function appDocumentUrl(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) return process.env['ELECTRON_RENDERER_URL'];
  return pathToFileURL(join(__dirname, '../renderer/index.html')).href;
}

/** FR-SEC-22 on the window: navigation pinned to the app document, DevTools shortcuts ignored when packaged, context menu Copy/Paste in inputs only. */
function lockDown(win: BrowserWindow): void {
  const wc = win.webContents;
  const own = appDocumentUrl();
  wc.on('will-navigate', (e, url) => {
    if (!shouldAllowNavigation(url, own)) e.preventDefault();
  });
  wc.on('will-redirect', (e) => e.preventDefault());
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => {
    if (app.isPackaged && isDevToolsShortcut(input)) e.preventDefault();
  });
  wc.on('devtools-opened', () => {
    if (app.isPackaged) wc.closeDevTools();
  });
  wc.on('context-menu', (_e, params) => {
    if (!params.isEditable) return; // nothing to copy or save outside inputs; selection copy still works with Ctrl+C
    Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
    ]).popup({ window: win });
  });
}

/** FR-SEC-25: stop tracking, upload nothing further, wipe tokens and every cached list, back to sign-in. */
let revoking = false;
async function revokeSession(reason: RevokeReason): Promise<void> {
  if (revoking) return;
  revoking = true;
  try {
    realtime.disconnect();
    await shifts.halt();
    api.clearTokens();
    store.deleteMany(wipeOnRevoke(store.keys()));
    send('auth:expired', { reason });
    mainWindow?.show();
  } finally {
    revoking = false;
  }
}

function chatCacheGet(channelId: string): unknown[] {
  return store.get<unknown[]>(`${CHAT_CACHE_PREFIX}${channelId}`, []);
}
function chatCachePut(channelId: string, messages: unknown): void {
  if (!Array.isArray(messages)) return;
  store.set(`${CHAT_CACHE_PREFIX}${channelId}`, messages.slice(0, CHAT_CACHE_LIMIT));
}

/** Tray icons ship as extraResources (electron-builder.json); in dev they are read from ./resources. */
function trayIcon() {
  const dir = app.isPackaged ? join(process.resourcesPath, 'tray') : join(app.getAppPath(), 'resources', 'tray');
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : process.platform === 'win32' ? 'tray-color.png' : 'tray-win.png';
  const path = join(dir, file);
  if (!existsSync(path)) return nativeImage.createEmpty();
  const img = nativeImage.createFromPath(path);
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

function appIcon() {
  const path = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon.png');
  return existsSync(path) ? nativeImage.createFromPath(path) : undefined;
}

function createTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('WorkPulse');
  const refresh = () => {
    const s = shifts.snapshot();
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: s.state === 'OFF_SHIFT' ? 'Off shift' : s.state === 'WORKING' ? 'Working' : 'On break', enabled: false },
        { type: 'separator' },
        { label: 'Open', click: () => mainWindow?.show() },
        { label: 'Quit', click: () => void requestQuit() },
      ]),
    );
  };
  shifts.onChange(refresh);
  refresh();
  tray.on('click', () => mainWindow?.show());
}

/** Quit while on shift asks: End shift, or keep running in the tray (02 §3 rule 4). */
async function requestQuit(): Promise<void> {
  if (shifts.snapshot().state !== 'OFF_SHIFT') {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['End shift and quit', 'Keep running in tray', 'Cancel'],
      defaultId: 1,
      cancelId: 2,
      message: 'Your shift is still open.',
      detail: 'End the shift now, or keep the app running in the tray so tracking continues.',
    });
    if (response === 0) await shifts.endShift();
    else if (response === 1) {
      mainWindow?.hide();
      return;
    } else return;
  }
  quitting = true;
  app.quit();
}

function registerIpc(): void {
  // ---- window chrome
  ipcMain.handle('win:minimize', () => mainWindow?.minimize());
  ipcMain.handle('win:maximize', () => (mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()));
  ipcMain.handle('win:close', () => mainWindow?.close());
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, apiUrl: api.baseUrl(), deviceName: device.name(), deviceId: device.deviceId() }));
  ipcMain.handle('app:setApiUrl', (_e, url: string) => api.setBaseUrl(String(url)));
  ipcMain.handle('app:probeApiUrl', (_e, url: string) => api.probe(String(url)));
  ipcMain.handle('app:openExternal', (_e, url: string) => (/^https?:/.test(url) ? shell.openExternal(url) : undefined));

  // ---- auth (tokens never leave the main process)
  ipcMain.handle('auth:session', () => ({ hasSession: api.hasSession(), online: api.isOnline() }));
  ipcMain.handle('auth:login', async (_e, identifier: string, password: string) => {
    const res = await api.login(String(identifier), String(password));
    if (res.ok && api.hasSession()) {
      void shifts.start();
      realtime.connect();
    }
    return res;
  });
  ipcMain.handle('auth:logout', async () => {
    if (shifts.snapshot().state !== 'OFF_SHIFT') await shifts.endShift();
    shifts.stop();
    realtime.disconnect();
    await api.logout();
    return { ok: true };
  });

  // ---- generic authenticated proxy for the renderer (02 §3 rule 1); extra headers are allow-listed (Idempotency-Key)
  ipcMain.handle('api:request', (_e, method: string, path: string, body?: unknown, headers?: unknown) => {
    if (typeof path !== 'string' || !path.startsWith('/')) return { ok: false, status: 0, error: { status: 0, code: 'BAD_PATH', message: 'Invalid path' } };
    return api.request(String(method).toUpperCase(), path, body, filterRequestHeaders(headers));
  });

  // ---- realtime (socket lives here; the renderer only sees forwarded events) and the offline chat cache (FR-CHAT-14)
  ipcMain.handle('realtime:status', () => realtime.status());
  ipcMain.handle('chat:cacheGet', (_e, channelId: string) => (typeof channelId === 'string' ? chatCacheGet(channelId) : []));
  ipcMain.handle('chat:cachePut', (_e, channelId: string, messages: unknown) => {
    if (typeof channelId === 'string' && api.hasSession()) chatCachePut(channelId, messages);
  });

  // ---- shift
  ipcMain.handle('shift:state', () => shifts.snapshot());
  ipcMain.handle('shift:start', () => shifts.startShift());
  ipcMain.handle('shift:break', (_e, type: string) => shifts.startBreak(String(type || 'break')));
  ipcMain.handle('shift:resume', () => shifts.endBreak());
  ipcMain.handle('shift:end', () => shifts.endShift());
  ipcMain.handle('shift:sync', () => shifts.sync());
  ipcMain.handle('shift:claimIdle', (_e, claim: 'break' | 'away_work') => shifts.claimLongIdle(claim));
  ipcMain.handle('shift:startContext', () => shifts.startContext());
  ipcMain.handle('shift:dismissClosure', () => shifts.dismissClosure());
  ipcMain.handle('shift:snoozeEndReminder', () => shifts.snoozeEndReminder());
  ipcMain.handle('shift:dismissReminder', (_e, kind: 'start' | 'end' | 'break') => shifts.dismissReminder(kind === 'end' || kind === 'break' ? kind : 'start'));
  if (process.env.COMPANYOS_DEV_SIM === '1') {
    ipcMain.handle('dev:simulate', async (_e, payload: Parameters<ShiftManager['devSimulate']>[0] & { revoke?: RevokeReason; offline?: boolean }) => {
      const { revoke, offline, ...rest } = payload ?? {};
      if (revoke) await revokeSession(revoke === 'suspended' ? 'suspended' : 'revoked');
      if (offline !== undefined) send('net:status', { online: !offline }); // renderer-side offline state only (FR-CHAT-14 screenshots)
      return shifts.devSimulate(rest);
    });
  }

  shifts.onChange((snap) => send('shift:update', snap));
  shifts.onLongIdle((p) => {
    mainWindow?.show();
    send('tracker:longIdle', p);
  });
  shifts.onNotify((title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });
  shifts.onNotice((notice) => {
    if (notice.kind === 'reminder' && notice.reminder === 'end') mainWindow?.show();
    send('shift:notice', notice);
  });
  api.onNetwork((online) => send('net:status', { online }));
  api.onUnauthorized((reason) => void revokeSession(reason));
  realtime.onStatus((s) => send('realtime:status', s));
  realtime.onEvent((e) => {
    if (e.event === 'session.revoked') {
      void revokeSession(revokeReasonFromSocket(e.payload));
      return;
    }
    send('realtime:event', e);
  });

  ipcMain.handle('notify:toast', (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title: String(title), body: String(body) }).show();
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.devsynx.workpulse'); // must equal appId in electron-builder.json for Windows notifications
  if (!is.dev) app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); // 09 §1: auto start at logon, tray
  session.defaultSession.on('will-download', (e) => e.preventDefault()); // FR-SEC-22: no downloads, ever
  registerIpc();
  createWindow();
  createTray();
  registerPowerHooks();
  if (api.hasSession()) {
    void shifts.start();
    realtime.connect();
  }

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

/**
 * Behaviour 5: auto end on shutdown (policy) and reconcile after sleep. `powerMonitor` 'shutdown'
 * fires on macOS/Linux; on Windows the window gets 'query-session-end' (Electron >= 31). Both end the
 * shift when the company policy says so, wait briefly for the upload, then let the OS continue.
 * With the policy off nothing changes: the shift stays open and the server auto-closes it (F5 rule 4).
 */
function shutdownEndsShift(): boolean {
  const s = shifts.snapshot();
  return s.state !== 'OFF_SHIFT' && Boolean(s.policy?.autoEndShiftOnShutdown);
}
async function endForShutdown(): Promise<void> {
  quitting = true;
  await Promise.race([shifts.onShutdown(), new Promise((r) => setTimeout(r, 4_000))]);
}
function registerPowerHooks(): void {
  // The typings declare no event argument, but Electron passes one on macOS/Linux so the shutdown can be delayed.
  (powerMonitor as unknown as { on: (ev: 'shutdown', fn: (e?: Electron.Event) => void) => void }).on('shutdown', (e) => {
    if (!shutdownEndsShift()) return;
    e?.preventDefault();
    void endForShutdown().finally(() => app.quit());
  });
  powerMonitor.on('resume', () => void shifts.onResume());
  powerMonitor.on('unlock-screen', () => void shifts.onResume());
}
function registerWindowSessionEnd(win: BrowserWindow): void {
  if (process.platform !== 'win32') return;
  win.on('query-session-end', (e) => {
    if (!shutdownEndsShift()) return;
    e.preventDefault();
    void endForShutdown().finally(() => app.quit());
  });
}

app.on('before-quit', () => {
  quitting = true;
  tracker.dispose();
});

app.on('window-all-closed', () => {
  // Stay alive in the tray while a shift is open; otherwise quit on non-mac.
  if (process.platform !== 'darwin' && shifts.snapshot().state === 'OFF_SHIFT') app.quit();
});
