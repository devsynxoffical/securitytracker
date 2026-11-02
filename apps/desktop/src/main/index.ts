/**
 * Main process entry: window, tray, IPC surface for the renderer (AGENTS.md rule 7) and the OS
 * hooks the shift policy needs (power events, shutdown).
 *
 * Dev-only IPC `dev:simulate` (registered only when COMPANYOS_DEV_SIM === '1'): lets a QA script or
 * Playwright drive the ShiftManager's schedule/policy/closure/reminder state without a server that
 * implements the schedule contract. Payload: { profile?, closure?, state?, reminder? } (see
 * ShiftManager.devSimulate). Never registered in production builds.
 */
import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, Notification, powerMonitor } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { Store } from './store';
import { DeviceIdentity } from './device';
import { AnchoredClock } from './clock';
import { ApiClient } from './api';
import { AgentClient } from './agent-client';
import { DevTelemetrySource } from './dev-telemetry';
import { ShiftManager } from './shift-manager';
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
    },
  });

  // Started at logon with --hidden (09 §1): stay in the tray until the user opens the window.
  registerWindowSessionEnd(mainWindow);
  mainWindow.on('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow?.show();
  });
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
    if (res.ok && api.hasSession()) void shifts.start();
    return res;
  });
  ipcMain.handle('auth:logout', async () => {
    if (shifts.snapshot().state !== 'OFF_SHIFT') await shifts.endShift();
    shifts.stop();
    await api.logout();
    return { ok: true };
  });

  // ---- generic authenticated proxy for the renderer (02 §3 rule 1)
  ipcMain.handle('api:request', (_e, method: string, path: string, body?: unknown) => {
    if (typeof path !== 'string' || !path.startsWith('/')) return { ok: false, status: 0, error: { status: 0, code: 'BAD_PATH', message: 'Invalid path' } };
    return api.request(String(method).toUpperCase(), path, body);
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
    ipcMain.handle('dev:simulate', (_e, payload: Parameters<ShiftManager['devSimulate']>[0]) => shifts.devSimulate(payload ?? {}));
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
  api.onUnauthorized(() => {
    shifts.stop();
    send('auth:expired', {});
  });

  ipcMain.handle('notify:toast', (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title: String(title), body: String(body) }).show();
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.devsynx.workpulse'); // must equal appId in electron-builder.json for Windows notifications
  if (!is.dev) app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); // 09 §1: auto start at logon, tray
  registerIpc();
  createWindow();
  createTray();
  registerPowerHooks();
  if (api.hasSession()) void shifts.start();

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
