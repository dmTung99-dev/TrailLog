import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageService {
  save(buffer: Buffer, filename: string): Promise<string>;
  read(filename: string): Promise<Buffer>;
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

  async read(filename: string): Promise<Buffer> {
    return fs.readFileSync(path.join(this.uploadDir, filename));
  }
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
