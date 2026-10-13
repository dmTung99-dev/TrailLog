declare module 'react-native-config' {
  // Keys of .env.local / .env.staging. Values are strings, or undefined when
  // the variant's env file was missing at build time.
  export interface NativeConfig {
    APP_ENV?: string;
    API_BASE_URL?: string;
    GOOGLE_MAPS_API_KEY?: string;
    [key: string]: string | undefined;
  }

  export const Config: NativeConfig;
  export default Config;
}
