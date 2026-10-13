import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a-real-secret',
};

describe('validateEnv', () => {
  it('accepts the minimal local config and defaults STORAGE_DRIVER to local', () => {
    expect(validateEnv({ ...base }).STORAGE_DRIVER).toBe('local');
  });

  it('rejects a missing DATABASE_URL or JWT_SECRET', () => {
    expect(() => validateEnv({ JWT_SECRET: 'x' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('rejects the placeholder JWT_SECRET from .env.example in production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'replace-with-a-long-random-value' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects an unknown STORAGE_DRIVER', () => {
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 'ftp' })).toThrow(/STORAGE_DRIVER/);
  });

  it('requires every S3 setting when STORAGE_DRIVER is s3', () => {
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 's3', S3_ENDPOINT: 'https://x' })).toThrow(
      /S3_BUCKET.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/,
    );
  });

  it('accepts a complete s3 config', () => {
    const env = validateEnv({
      ...base,
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
      S3_BUCKET: 'traillog-staging',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(env.STORAGE_DRIVER).toBe('s3');
  });
});
