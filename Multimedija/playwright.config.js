const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './src/gui',
    testMatch: ['uitests.js'],
    timeout: 30000,
});