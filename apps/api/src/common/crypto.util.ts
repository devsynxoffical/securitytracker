import * as crypto from 'crypto';

export class CryptoUtil {
  /**
   * Computes SHA-256 hash of string or buffer.
   */
  static sha256(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verifies ECDSA P-256 signature against PEM or hex/raw public key.
   */
  static verifyDeviceSignature(
    publicKeyPemOrHex: string,
    payload: string,
    signatureBase64OrHex: string,
  ): boolean {
    try {
      let key = publicKeyPemOrHex;
      if (!key.includes('BEGIN PUBLIC KEY')) {
        // If raw hex/spki, format as PEM
        key = `-----BEGIN PUBLIC KEY-----\n${publicKeyPemOrHex}\n-----END PUBLIC KEY-----`;
      }

      const verify = crypto.createVerify('SHA256');
      verify.update(payload);
      verify.end();

      const encoding = /^[0-9a-fA-F]+$/.test(signatureBase64OrHex) ? 'hex' : 'base64';
      return verify.verify(key, signatureBase64OrHex, encoding);
    } catch {
      // In development / fallback if signature parsing fails during tests
      return false;
    }
  }

  /**
   * Field-level encryption using AES-256-GCM.
   */
  static encryptField(plainText: string, secretKeyHex: string): string {
    const key = Buffer.from(secretKeyHex.padEnd(64, '0').slice(0, 64), 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
  }

  /**
   * Field-level decryption using AES-256-GCM.
   */
  static decryptField(encryptedPayload: string, secretKeyHex: string): string {
    const [ivHex, tagHex, encryptedText] = encryptedPayload.split(':');
    if (!ivHex || !tagHex || !encryptedText) {
      throw new Error('Invalid encrypted payload format');
    }
    const key = Buffer.from(secretKeyHex.padEnd(64, '0').slice(0, 64), 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Standard RFC 6238 TOTP verification (time step 30s).
   */
  static verifyTotp(secret: string, token: string, window = 1): boolean {
    const currentTimeStep = Math.floor(Date.now() / 1000 / 30);
    for (let i = -window; i <= window; i++) {
      const generated = this.generateTotpCode(secret, currentTimeStep + i);
      if (generated === token) {
        return true;
      }
    }
    return false;
  }

  /** Random 160-bit TOTP secret, base32 encoded (what authenticator apps expect). */
  static generateTotpSecret(): string {
    return this.base32Encode(crypto.randomBytes(20));
  }

  static totpUri(secret: string, account: string, issuer: string): string {
    const label = encodeURIComponent(`${issuer}:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }

  static generateTotpCode(secret: string, timeStep: number): string {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(timeStep));
    const hmac = crypto.createHmac('sha1', this.base32Decode(secret));
    hmac.update(buffer);
    const digest = hmac.digest();
    const offset = digest[digest.length - 1]! & 0xf;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);
    const code = binary % 1000000;
    return code.toString().padStart(6, '0');
  }

  private static readonly BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  static base32Encode(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += this.BASE32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += this.BASE32[(value << (5 - bits)) & 31];
    return out;
  }

  static base32Decode(str: string): Buffer {
    const clean = str.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
      value = (value << 5) | this.BASE32.indexOf(ch);
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  }
}
