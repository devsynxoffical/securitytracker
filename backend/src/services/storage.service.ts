import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ApiError } from '../utils/api-error.js';

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'employee-attachments');
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB Limit
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export interface FileUploadInput {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export class StorageService {
  /**
   * Initializes local storage directory if missing.
   */
  static initStorage(): void {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
  }

  /**
   * Saves a manually attached file safely to the server filesystem.
   */
  static async saveAttachment(input: FileUploadInput) {
    this.initStorage();

    if (input.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw ApiError.badRequest('File size exceeds maximum permitted limit of 5 MB');
    }

    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw ApiError.badRequest(`File type '${input.mimeType}' is not allowed. Permitted types: JPEG, PNG, WEBP, PDF`);
    }

    // Sanitize extension and filename
    const ext = path.extname(input.originalName).toLowerCase() || '.bin';
    const storedName = `${crypto.randomUUID()}${ext}`;
    const targetPath = path.join(STORAGE_DIR, storedName);

    // Path traversal check
    if (!targetPath.startsWith(STORAGE_DIR)) {
      throw ApiError.badRequest('Invalid file path traversal attempt detected');
    }

    await fs.promises.writeFile(targetPath, input.buffer);

    return {
      originalName: input.originalName,
      storedName,
      mimeType: input.mimeType,
      size: input.buffer.length,
      storagePath: path.relative(process.cwd(), targetPath),
    };
  }

  /**
   * Gets absolute file path for an authorized download request.
   */
  static getFilePath(storedName: string): string {
    const filePath = path.join(STORAGE_DIR, storedName);
    if (!filePath.startsWith(STORAGE_DIR) || !fs.existsSync(filePath)) {
      throw ApiError.notFound('Attachment file not found on storage server');
    }
    return filePath;
  }
}
