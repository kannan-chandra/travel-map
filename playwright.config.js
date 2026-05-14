const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:8123",
    viewport: { width: 1600, height: 1000 }
  },
  webServer: {
    command: "python3 -m http.server 8123 --bind 127.0.0.1",
    port: 8123,
    reuseExistingServer: true,
    timeout: 30000
  }
});
