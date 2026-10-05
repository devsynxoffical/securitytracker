import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { TelemetryEngine } from './telemetry';

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'WorkPulse — Desktop Workstation & Activity Telemetry',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const telemetry = TelemetryEngine.getInstance();
  telemetry.setMainWindow(mainWindow);

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Block external navigation inside window
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.workpulse.desktop');

  const telemetry = TelemetryEngine.getInstance();

  // IPC Handlers
  ipcMain.handle('telemetry:get-hardware', () => {
    return telemetry.getHardwareProfile();
  });

  ipcMain.handle('telemetry:get-state', () => {
    return telemetry.getLiveTelemetryState();
  });

  ipcMain.handle('telemetry:start-shift', (_, shiftId: string) => {
    telemetry.startShift(shiftId);
    return { success: true };
  });

  ipcMain.handle('telemetry:pause-shift', (_, reason?: string) => {
    telemetry.pauseShift(reason);
    return { success: true };
  });

  ipcMain.handle('telemetry:resume-shift', () => {
    telemetry.resumeShift();
    return { success: true };
  });

  ipcMain.handle('telemetry:end-shift', () => {
    telemetry.endShift();
    return { success: true };
  });

  ipcMain.handle('telemetry:register-key', (_, count?: number) => {
    telemetry.registerKeyTap(count || 1);
    return { success: true };
  });

  ipcMain.handle('telemetry:register-click', (_, count?: number) => {
    telemetry.registerMouseClick(count || 1);
    return { success: true };
  });

  ipcMain.handle('telemetry:get-segments', () => {
    return telemetry.getQueuedSegments();
  });

  ipcMain.handle('telemetry:ack-segments', (_, acceptedIds: string[]) => {
    telemetry.acknowledgeSegments(acceptedIds);
    return { success: true };
  });

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

