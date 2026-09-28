// Playwright config for the web smoke test (ticket 034). Runs Chromium only,
// headless, against `expo start --web`. Metro's first web bundle can take a
// while to compile, hence the generous webServer timeout.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 8081;
const BASE_URL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /capture\.spec\.js/,
    },
    {
      // Ticket 056: the in-app camera needs a real (if fake) camera stream.
      // Chromium's fake device flags give every getUserMedia() call a
      // synthetic video track instead of prompting for a real camera, so the
      // capture screen (and only it) is exercised on this project.
      name: 'chromium-fake-camera',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
      testMatch: /capture\.spec\.js/,
    },
  ],
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
