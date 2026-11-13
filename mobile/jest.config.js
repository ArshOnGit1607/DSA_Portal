/** jest-expo: React Native test environment. Root `npx jest` does not pick these up (.tsx under src/). */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // ui-core is TypeScript source in the workspace; zustand ships ESM for some entry points.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|react-navigation|@react-navigation/.*|zustand|@dsa-portal/.*))',
  ],
};
