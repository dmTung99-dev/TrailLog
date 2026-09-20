import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageService {
  save(buffer: Buffer, filename: string): Promise<string>;
}

@Injectable()
export class LocalDiskStorageService implements StorageService {
  private readonly uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');

  async save(buffer: Buffer, filename: string): Promise<string> {
    fs.mkdirSync(this.uploadDir, { recursive: true });
    const filePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  }
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
