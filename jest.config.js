/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testMatch: [
    '<rootDir>/core/__tests__/**/*.test.ts',
    '<rootDir>/web/__tests__/**/*.test.ts',
    '<rootDir>/desktop/__tests__/**/*.test.ts',
    '<rootDir>/mobile/__tests__/**/*.test.ts',
    '<rootDir>/server/__tests__/**/*.test.ts',
    '<rootDir>/workers/__tests__/**/*.test.ts',
  ],
  testEnvironment: 'node',
  passWithNoTests: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  collectCoverageFrom: ['<rootDir>/core/src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
