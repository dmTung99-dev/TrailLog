// Jest has no native module to read the build-time env file from; tests get
// a fixed local config instead.
export default {
  APP_ENV: 'local',
  API_BASE_URL: 'http://localhost:3000',
  GOOGLE_MAPS_API_KEY: '',
};
