/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/web/__tests__/**/*.test.ts', '<rootDir>/desktop/__tests__/**/*.test.ts', '<rootDir>/mobile/__tests__/**/*.test.ts', '<rootDir>/server/__tests__/**/*.test.ts', '<rootDir>/workers/__tests__/**/*.test.ts'],
  testEnvironment: 'node',
  passWithNoTests: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }]
  },
  collectCoverageFrom: ['<rootDir>/*/src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: { global: { statements: 0, branches: 0, functions: 0, lines: 0 } }
}
