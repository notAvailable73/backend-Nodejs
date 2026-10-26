export default {
  testEnvironment: "node",
  // Native ESM ("type": "module"); run through `npm test`, which enables --experimental-vm-modules
  transform: {},
  setupFiles: ["<rootDir>/tests/setup/env.js"],
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  // All suites share one test database, so run them serially
  maxWorkers: 1,
};
