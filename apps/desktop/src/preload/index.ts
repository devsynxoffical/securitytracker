import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only surface the renderer sees (AGENTS.md rule 7). Tokens, keys and the pipe never cross it;
 * the renderer calls the server through `api.request`, which the main process authenticates.
 */
const on = (channel: string) => (callback: (payload: unknown) => void) => {
  const sub = (_: unknown, value: unknown) => callback(value);
  ipcRenderer.on(channel, sub);
  return () => ipcRenderer.removeListener(channel, sub);
};

const bridge = {
  window: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    setApiUrl: (url: string) => ipcRenderer.invoke('app:setApiUrl', url),
    probeApiUrl: (url: string) => ipcRenderer.invoke('app:probeApiUrl', url),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    toast: (title: string, body: string) => ipcRenderer.invoke('notify:toast', title, body),
  },
  auth: {
    session: () => ipcRenderer.invoke('auth:session'),
    login: (identifier: string, password: string) => ipcRenderer.invoke('auth:login', identifier, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    onExpired: on('auth:expired'),
  },
  api: {
    request: (method: string, path: string, body?: unknown) => ipcRenderer.invoke('api:request', method, path, body),
  },
  shift: {
    state: () => ipcRenderer.invoke('shift:state'),
    start: () => ipcRenderer.invoke('shift:start'),
    startBreak: (type: string) => ipcRenderer.invoke('shift:break', type),
    resume: () => ipcRenderer.invoke('shift:resume'),
    end: () => ipcRenderer.invoke('shift:end'),
    sync: () => ipcRenderer.invoke('shift:sync'),
    claimIdle: (claim: 'break' | 'away_work') => ipcRenderer.invoke('shift:claimIdle', claim),
    startContext: () => ipcRenderer.invoke('shift:startContext'),
    dismissClosure: () => ipcRenderer.invoke('shift:dismissClosure'),
    snoozeEndReminder: () => ipcRenderer.invoke('shift:snoozeEndReminder'),
    dismissReminder: (kind: 'start' | 'end' | 'break') => ipcRenderer.invoke('shift:dismissReminder', kind),
    onUpdate: on('shift:update'),
    onLongIdle: on('tracker:longIdle'),
    onNotice: on('shift:notice'),
  },
  net: {
    onStatus: on('net:status'),
  },
  /** QA only: the main process registers 'dev:simulate' solely when COMPANYOS_DEV_SIM=1; otherwise this rejects. */
  dev: {
    simulate: (payload: unknown) => ipcRenderer.invoke('dev:simulate', payload),
  },
};

export type DesktopBridge = typeof bridge;

contextBridge.exposeInMainWorld('companyos', bridge);
