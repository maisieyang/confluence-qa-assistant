import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/types.ts',
    '!src/app/**',
    '!src/styles/**',
  ],
};

// Wrap createJestConfig to override transformIgnorePatterns after Next.js sets them.
// This is needed so Jest can transform ESM-only packages (remark ecosystem) via SWC/Babel.
const jestConfig = createJestConfig(config);

export default async () => {
  const resolvedConfig = await (jestConfig as () => Promise<Config>)();
  // Allow all pnpm-hoisted node_modules to be transformed (handles ESM-only deps like remark)
  resolvedConfig.transformIgnorePatterns = [
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return resolvedConfig;
};
