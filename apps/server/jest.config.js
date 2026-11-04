module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/', '\\.integration\\.spec\\.ts$'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
};
