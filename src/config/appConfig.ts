import Config from 'react-native-config';

export type AppEnv = 'local' | 'staging';

export interface AppConfig {
  appEnv: AppEnv;
  apiBaseUrl: string;
}

/**
 * Validates the values react-native-config baked into this build (from
 * .env.local or .env.staging — see android/app/build.gradle). Throws at
 * startup rather than letting the app make requests to "undefined/auth/login".
 */
export function parseAppConfig(raw: Record<string, string | undefined>): AppConfig {
  const appEnv = raw.APP_ENV;
  if (!appEnv) {
    throw new Error(
      'APP_ENV is empty: the env file for this build variant was missing at build time. ' +
        'Create .env.local from .env.local.example, then rebuild the app.',
    );
  }
  if (appEnv !== 'local' && appEnv !== 'staging') {
    throw new Error(`APP_ENV must be "local" or "staging", got "${appEnv}"`);
  }

  const apiBaseUrl = raw.API_BASE_URL;
  if (!apiBaseUrl || !/^https?:\/\//.test(apiBaseUrl)) {
    throw new Error(`API_BASE_URL must be an http(s) URL, got "${apiBaseUrl ?? ''}"`);
  }
  if (appEnv === 'staging' && !apiBaseUrl.startsWith('https://')) {
    throw new Error('API_BASE_URL must use https for staging');
  }

  return { appEnv, apiBaseUrl: apiBaseUrl.replace(/\/+$/, '') };
}

export const appConfig = parseAppConfig(Config);
