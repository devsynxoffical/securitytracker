import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { hostname, cpus, networkInterfaces, platform, release, arch } from 'os';
import { Store } from './store';

/**
 * Device identity (F2, FR-AUTH-04): an ECDSA P-256 key pair created once per installation.
 * The private key never leaves the main process. Login and refresh requests are signed with it.
 */
export class DeviceIdentity {
  constructor(private store: Store) {}

  publicKeyPem(): string {
    this.ensureKeys();
    return this.store.get<string>('device.publicKey', '');
  }

  deviceId(): string | null {
    return this.store.get<string | null>('device.id', null);
  }

  setDeviceId(id: string | null): void {
    this.store.set('device.id', id ?? undefined);
  }

  name(): string {
    return this.store.get<string>('device.name', hostname());
  }

  os(): string {
    return `${platform()} ${release()} ${arch()}`;
  }

  /** Stable per machine: hostname + first CPU model + sorted MAC addresses. */
  hardwareHash(): string {
    const macs = Object.values(networkInterfaces())
      .flat()
      .filter((n): n is NonNullable<typeof n> => Boolean(n) && !n!.internal && n!.mac !== '00:00:00:00:00:00')
      .map((n) => n.mac)
      .sort();
    const cpu = cpus()[0]?.model ?? 'cpu';
    return createHash('sha256').update(`${hostname()}|${cpu}|${macs.join(',')}`).digest('hex');
  }

  /**
   * 08 §2: signature = sign(deviceKey, timestamp + body hash). The API has no nonce endpoint,
   * so the timestamp (2 minute tolerance server side) is the replay guard.
   */
  sign(timestamp: string, body: Record<string, unknown>): string {
    this.ensureKeys();
    const privateKey = this.store.getSecret('device.privateKey');
    if (!privateKey) throw new Error('Device key missing');
    const bodyHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const signer = createSign('SHA256');
    signer.update(`${timestamp}.${bodyHash}`);
    signer.end();
    return signer.sign(privateKey, 'base64');
  }

  private ensureKeys(): void {
    if (this.store.getSecret('device.privateKey') && this.store.get<string>('device.publicKey', '')) return;
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.store.setSecret('device.privateKey', privateKey);
    this.store.set('device.publicKey', publicKey);
  }
}
