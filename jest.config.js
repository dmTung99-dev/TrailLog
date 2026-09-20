module.exports = {
  preset: 'react-native',
  // e2e/ contains Detox specs that rely on Detox's own test runner and
  // globals (device/by/element), configured separately via e2e/jest.config.js.
  // They must not be picked up by the plain unit-test run.
  // backend/ is a separate NestJS project (its own package.json, its own
  // Jest config) meant to be built/tested from inside backend/, not swept
  // up by this app's root-level `npx jest`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/', '<rootDir>/backend/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-permissions$': '<rootDir>/src/__mocks__/react-native-permissions.js',
    '^react-native-geolocation-service$': '<rootDir>/src/__mocks__/react-native-geolocation-service.js',
    '^react-native-background-actions$': '<rootDir>/src/__mocks__/react-native-background-actions.js',
    '^react-native-sensors$': '<rootDir>/src/__mocks__/react-native-sensors.js',
    '^react-native-vision-camera$': '<rootDir>/src/__mocks__/react-native-vision-camera.js',
    '^react-native-maps$': '<rootDir>/src/__mocks__/react-native-maps.js',
  },
  setupFilesAfterEnv: [],
  testEnvironment: 'node',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@react-native-community|react-native-get-random-values|react-native-permissions|uuid)/)',
  ],
};
