module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-permissions$': '<rootDir>/src/__mocks__/react-native-permissions.js',
    '^react-native-geolocation-service$': '<rootDir>/src/__mocks__/react-native-geolocation-service.js',
    '^react-native-background-actions$': '<rootDir>/src/__mocks__/react-native-background-actions.js',
    '^react-native-sensors$': '<rootDir>/src/__mocks__/react-native-sensors.js',
  },
  setupFilesAfterEnv: [],
  testEnvironment: 'node',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@react-native-community|react-native-get-random-values|react-native-permissions|uuid)/)',
  ],
};
