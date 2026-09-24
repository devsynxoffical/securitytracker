import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface UserJwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signUserToken(payload: UserJwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyUserToken(token: string): UserJwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as UserJwtPayload;
    return decoded;
  } catch (_err) {
    return null;
  }
}
