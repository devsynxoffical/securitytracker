import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, Notification } from 'electron';
import { join } from 'path';
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
    title: 'Company OS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Started at logon with --hidden (09 §1): stay in the tray until the user opens the window.
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

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Company OS');
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

  shifts.onChange((snap) => send('shift:update', snap));
  shifts.onLongIdle((p) => {
    mainWindow?.show();
    send('tracker:longIdle', p);
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
  electronApp.setAppUserModelId('com.devsynx.companyos');
  if (!is.dev) app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); // 09 §1: auto start at logon, tray
  registerIpc();
  createWindow();
  createTray();
  if (api.hasSession()) void shifts.start();

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('before-quit', () => {
  quitting = true;
  tracker.dispose();
});

app.on('window-all-closed', () => {
  // Stay alive in the tray while a shift is open; otherwise quit on non-mac.
  if (process.platform !== 'darwin' && shifts.snapshot().state === 'OFF_SHIFT') app.quit();
});
