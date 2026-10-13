export type StorageDriver = 'local' | 's3';

export interface Env {
  NODE_ENV?: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  STORAGE_DRIVER: StorageDriver;
  [key: string]: unknown;
}

// The value shipped in .env.example. Accepted locally so a fresh checkout
// boots, but never in production — a server signing tokens with a secret
// that is public in the repo would accept forged tokens for any user.
const PLACEHOLDER_JWT_SECRET = 'replace-with-a-long-random-value';

const S3_KEYS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];

/**
 * Passed to ConfigModule.forRoot({ validate }) so a misconfigured server
 * refuses to start instead of booting with silent fallbacks.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const missing = (keys: string[]) => keys.filter((key) => !config[key]);

  const missingRequired = missing(['DATABASE_URL', 'JWT_SECRET']);
  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  if (config.NODE_ENV === 'production' && config.JWT_SECRET === PLACEHOLDER_JWT_SECRET) {
    throw new Error('JWT_SECRET is still the .env.example placeholder; set a real secret in production');
  }

  const driver = (config.STORAGE_DRIVER ?? 'local') as string;
  if (driver !== 'local' && driver !== 's3') {
    throw new Error(`STORAGE_DRIVER must be "local" or "s3", got "${driver}"`);
  }

  if (driver === 's3') {
    const missingS3 = missing(S3_KEYS);
    if (missingS3.length > 0) {
      throw new Error(`STORAGE_DRIVER=s3 requires: ${missingS3.join(', ')}`);
    }
  }

  return { ...config, STORAGE_DRIVER: driver } as Env;
}
