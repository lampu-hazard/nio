module.exports = {
  ...require('./jest.config'),
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  testMatch: ['**/*.integration.spec.ts'],
  maxWorkers: 1,
};
