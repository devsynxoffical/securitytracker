import crypto from 'crypto';

/**
 * Computes a SHA-256 hash of a raw device token.
 * Raw device tokens are NEVER stored in the database.
 */
export function hashDeviceToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a cryptographically secure random device token and its SHA-256 hash.
 */
export function generateDeviceToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashDeviceToken(rawToken);
  return { rawToken, tokenHash };
}
