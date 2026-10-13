import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createStorageService, LocalDiskStorageService, S3StorageService } from './storage.service';

function fakeS3Client(body = Buffer.from('jpeg-bytes')) {
  return {
    send: jest.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
      }
      return {};
    }),
  };
}

describe('S3StorageService', () => {
  it('puts the photo under uploads/ and returns the same /uploads/ path the local driver returns', async () => {
    const client = fakeS3Client();
    const storage = new S3StorageService(client as unknown as S3Client, 'bucket');

    const url = await storage.save(Buffer.from('x'), 'cp-1.jpg');

    expect(url).toBe('/uploads/cp-1.jpg');
    const command = client.send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'bucket', Key: 'uploads/cp-1.jpg', ContentType: 'image/jpeg' });
  });

  it('reads the photo back as a Buffer', async () => {
    const client = fakeS3Client(Buffer.from('jpeg-bytes'));
    const storage = new S3StorageService(client as unknown as S3Client, 'bucket');

    const buffer = await storage.read('cp-1.jpg');

    expect(buffer.toString()).toBe('jpeg-bytes');
    expect((client.send.mock.calls[0][0] as GetObjectCommand).input).toMatchObject({ Key: 'uploads/cp-1.jpg' });
  });
});

describe('createStorageService', () => {
  const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] });

  it('returns the local-disk driver by default', () => {
    expect(createStorageService(config({}))).toBeInstanceOf(LocalDiskStorageService);
  });

  it('returns the S3 driver when STORAGE_DRIVER is s3', () => {
    const storage = createStorageService(
      config({
        STORAGE_DRIVER: 's3',
        S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'id',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    );
    expect(storage).toBeInstanceOf(S3StorageService);
  });

  it('configures the S3 client for path-style addressing (<endpoint>/<bucket>, which R2 also accepts)', async () => {
    const storage = createStorageService(
      config({
        STORAGE_DRIVER: 's3',
        S3_ENDPOINT: 'http://localhost:9090',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'id',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    );
    const client = (storage as unknown as { client: S3Client }).client;
    expect(client.config.forcePathStyle).toBe(true);
  });
});
