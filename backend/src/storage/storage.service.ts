import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

/**
 * Any S3-compatible bucket — Cloudflare R2 in staging. Returns the same
 * `/uploads/<filename>` path as LocalDiskStorageService, so photoUrl values
 * stored in the database mean the same thing whichever driver wrote them.
 */
export class S3StorageService implements StorageService {
  constructor(
    private readonly client: Pick<S3Client, 'send'>,
    private readonly bucket: string,
  ) {}

  async save(buffer: Buffer, filename: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: `uploads/${filename}`, Body: buffer, ContentType: 'image/jpeg' }),
    );
    return `/uploads/${filename}`;
  }

  async read(filename: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `uploads/${filename}` }));
    if (!result.Body) {
      throw new Error(`Empty body for uploads/${filename}`);
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }
}

/** Picks the driver from STORAGE_DRIVER; env.validation.ts has already checked the S3 settings exist. */
export function createStorageService(config: { get(key: string): string | undefined }): StorageService {
  if (config.get('STORAGE_DRIVER') !== 's3') {
    return new LocalDiskStorageService();
  }
  const client = new S3Client({
    region: config.get('S3_REGION') ?? 'auto', // R2 expects "auto"
    endpoint: config.get('S3_ENDPOINT'),
    // <endpoint>/<bucket> rather than <bucket>.<endpoint>: works with R2 and
    // with any local S3 server, where the subdomain form fails DNS lookup.
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.get('S3_ACCESS_KEY_ID') as string,
      secretAccessKey: config.get('S3_SECRET_ACCESS_KEY') as string,
    },
  });
  return new S3StorageService(client, config.get('S3_BUCKET') as string);
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
