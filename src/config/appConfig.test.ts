import { parseAppConfig } from './appConfig';

describe('parseAppConfig', () => {
  it('reads the local environment', () => {
    expect(parseAppConfig({ APP_ENV: 'local', API_BASE_URL: 'http://192.168.1.34:3000' })).toEqual({
      appEnv: 'local',
      apiBaseUrl: 'http://192.168.1.34:3000',
    });
  });

  it('drops a trailing slash so request paths can always start with "/"', () => {
    expect(
      parseAppConfig({ APP_ENV: 'staging', API_BASE_URL: 'https://traillog-api-staging.onrender.com/' }).apiBaseUrl,
    ).toBe('https://traillog-api-staging.onrender.com');
  });

  it('fails loudly when the env file was missing at build time', () => {
    // react-native-config silently falls back to an empty config when the
    // variant's .env file doesn't exist (e.g. .env.local not created yet).
    expect(() => parseAppConfig({})).toThrow(/APP_ENV.*\.env\.local\.example/s);
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => parseAppConfig({ APP_ENV: 'prod', API_BASE_URL: 'https://x.com' })).toThrow(/APP_ENV/);
  });

  it('rejects a missing or non-http API_BASE_URL', () => {
    expect(() => parseAppConfig({ APP_ENV: 'local' })).toThrow(/API_BASE_URL/);
    expect(() => parseAppConfig({ APP_ENV: 'local', API_BASE_URL: '192.168.1.34:3000' })).toThrow(/API_BASE_URL/);
  });

  it('requires https for staging, since release builds block cleartext HTTP', () => {
    expect(() => parseAppConfig({ APP_ENV: 'staging', API_BASE_URL: 'http://example.com' })).toThrow(/https/);
  });
});
