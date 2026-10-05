import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

const api = {
  ping: () => ipcRenderer.invoke('ping'),
  getHardwareProfile: () => ipcRenderer.invoke('telemetry:get-hardware'),
  getLiveTelemetry: () => ipcRenderer.invoke('telemetry:get-state'),
  startShift: (shiftId: string) => ipcRenderer.invoke('telemetry:start-shift', shiftId),
  pauseShift: (reason?: string) => ipcRenderer.invoke('telemetry:pause-shift', reason),
  resumeShift: () => ipcRenderer.invoke('telemetry:resume-shift'),
  endShift: () => ipcRenderer.invoke('telemetry:end-shift'),
  registerKeyTap: (count?: number) => ipcRenderer.invoke('telemetry:register-key', count),
  registerMouseClick: (count?: number) => ipcRenderer.invoke('telemetry:register-click', count),
  getQueuedSegments: () => ipcRenderer.invoke('telemetry:get-segments'),
  acknowledgeSegments: (acceptedIds: string[]) =>
    ipcRenderer.invoke('telemetry:ack-segments', acceptedIds),
  onTelemetryUpdate: (callback: (data: any) => void) => {
    const subscription = (_: any, value: any) => callback(value);
    ipcRenderer.on('telemetry:update', subscription);
    return () => {
      ipcRenderer.removeListener('telemetry:update', subscription);
    };
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.api = api;
}

