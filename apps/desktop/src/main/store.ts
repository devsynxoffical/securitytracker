import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';

/**
 * Small JSON file store in userData (02 §3 rule 1: tokens live in the main process only).
 * Secrets go through `setSecret`/`getSecret`, encrypted at rest with safeStorage (DPAPI on Windows,
 * Keychain on macOS). Plain values are for non-sensitive state (API URL, device id, queues).
 */
export class Store {
  private data: Record<string, unknown> = {};
  private readonly file: string;

  constructor(name = 'state.json') {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.file = join(dir, name);
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      } catch {
        this.data = {};
      }
    }
  }

  get<T>(key: string, fallback: T): T {
    return (this.data[key] as T | undefined) ?? fallback;
  }

  set(key: string, value: unknown): void {
    if (value === undefined) delete this.data[key];
    else this.data[key] = value;
    this.flush();
  }

  /** Every stored key, secrets included (prefixed `secret:`). Used by the revocation wipe. */
  keys(): string[] {
    return Object.keys(this.data);
  }

  /** Removes the given keys in one write (FR-SEC-25 wipe). */
  deleteMany(keys: string[]): void {
    if (keys.length === 0) return;
    for (const k of keys) delete this.data[k];
    this.flush();
  }

  getSecret(key: string): string | null {
    const raw = this.data[`secret:${key}`] as string | undefined;
    if (!raw) return null;
    try {
      if (raw.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'));
      }
      if (raw.startsWith('plain:')) return raw.slice(6);
      return null;
    } catch {
      return null;
    }
  }

  setSecret(key: string, value: string | null): void {
    if (value === null) {
      this.set(`secret:${key}`, undefined);
      return;
    }
    const encoded = safeStorage.isEncryptionAvailable()
      ? `enc:${safeStorage.encryptString(value).toString('base64')}`
      : `plain:${value}`; // dev machines without a keyring; never the case on a managed Windows PC
    this.set(`secret:${key}`, encoded);
  }

  private flush(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
    renameSync(tmp, this.file);
  }
}
